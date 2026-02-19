import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'node:fs';

// Инициализация БД
const dataDir = join(process.cwd(), 'data');
const dbPath = env.DATABASE_PATH || join(dataDir, 'tokens.db');

// Создаём директорию если не существует
mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath, { fileMustExist: false });
// Включаем WAL mode для одновременого чтения/записи
db.pragma('journal_mode = WAL');

// Initialize and migrate database
function initializeDatabase() {
	// Create settings table
	db.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`);

	// Check if printers table exists
	const printersTableExists = db.prepare(`
		SELECT name FROM sqlite_master WHERE type='table' AND name='printers'
	`).get() as any;

	if (!printersTableExists) {
		// Create printers table
		db.exec(`
			CREATE TABLE IF NOT EXISTS printers (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT UNIQUE NOT NULL,
				moonraker_url TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				is_default INTEGER DEFAULT 0,
				last_error TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_printers_name ON printers(name);
			CREATE INDEX IF NOT EXISTS idx_printers_default ON printers(is_default);
		`);

		// Check if tokens table exists and has printer_id column
		const tokensTableExists = db.prepare(`
			SELECT name FROM sqlite_master WHERE type='table' AND name='tokens'
		`).get() as any;

		if (tokensTableExists) {
			// Check if printer_id column exists
			const columns = db.pragma('table_info(tokens)');
			const hasPrinterId = columns.some((col: any) => col.name === 'printer_id');

			if (!hasPrinterId) {
				// Get current moonraker_url from settings
				const moonrakerUrl = getSetting(MOONRAKER_URL_KEY) || DEFAULT_MOONRAKER_URL;
				const now = Date.now();

				// Add printer_id column (SQLite doesn't support ALTER TABLE with constraints)
				db.exec(`ALTER TABLE tokens ADD COLUMN printer_id INTEGER`);

				// Create default printer
				db.prepare(`
					INSERT INTO printers (name, moonraker_url, created_at, is_default)
					VALUES (?, ?, ?, 1)
				`).run('Default', moonrakerUrl, now);

				// Get the default printer ID
				const defaultPrinter = db.prepare(`SELECT id FROM printers WHERE name = 'Default'`).get() as any;
				const defaultPrinterId = defaultPrinter.id;

				// Update all existing tokens to use default printer
				db.prepare(`UPDATE tokens SET printer_id = ? WHERE printer_id IS NULL`).run(defaultPrinterId);
			}
		}
	} else {
		// Migrate existing printers table - add last_error column if not exists
		const printersColumns = db.pragma('table_info(printers)') as any[];
		const hasLastError = printersColumns.some((col: any) => col.name === 'last_error');

		if (!hasLastError) {
			db.exec(`ALTER TABLE printers ADD COLUMN last_error TEXT`);
		}

		// Add thumbnail_sizes column if not exists
		const hasThumbnailSizes = printersColumns.some((col: any) => col.name === 'thumbnail_sizes');

		if (!hasThumbnailSizes) {
			db.exec(`ALTER TABLE printers ADD COLUMN thumbnail_sizes TEXT`);
		}
	}

	// Create tokens table if it doesn't exist (for fresh installations)
	db.exec(`
		CREATE TABLE IF NOT EXISTS tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			token TEXT UNIQUE NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			ttl_minutes INTEGER NOT NULL,
			filename TEXT,
			comment TEXT,
			revoked INTEGER DEFAULT 0,
			printer_id INTEGER
		);

		CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
		CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
		CREATE INDEX IF NOT EXISTS idx_tokens_printer ON tokens(printer_id);
	`);
}

// Run initialization
initializeDatabase();

export interface Setting {
	key: string;
	value: string;
}

// Настройки Moonraker URL
const MOONRAKER_URL_KEY = 'moonraker_url';
const DEFAULT_MOONRAKER_URL = 'http://192.168.1.100:7125';

// Настройки публичного URL
const PUBLIC_URL_KEY = 'public_url';

// Получение значения настройки
export function getSetting(key: string): string | null {
	const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
	const row = stmt.get(key) as any;
	return row?.value || null;
}

// Сохранение значения настройки
export function setSetting(key: string, value: string): void {
	const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
	stmt.run(key, value);
}

// Получение URL Moonraker
export function getMoonrakerUrlSetting(): string {
	return getSetting(MOONRAKER_URL_KEY) || DEFAULT_MOONRAKER_URL;
}

// Сохранение URL Moonraker
export function setMoonrakerUrlSetting(url: string): void {
	setSetting(MOONRAKER_URL_KEY, url);
}

// Получение публичного URL
export function getPublicUrlSetting(): string | null {
	return getSetting(PUBLIC_URL_KEY);
}

// Сохранение публичного URL
export function setPublicUrlSetting(url: string): void {
	setSetting(PUBLIC_URL_KEY, url);
}

export interface Token {
	id: number;
	token: string;
	created_at: number;
	expires_at: number;
	ttl_minutes: number;
	filename: string | null;
	comment: string | null;
	revoked: boolean;
	printer_id: number | null;
	printer_name?: string;
}

// Генерация токена
export function generateToken(): string {
	return randomBytes(24).toString('base64url').slice(0, 32);
}

// Создание нового токена
export function createToken(ttlMinutes: number, filename?: string, comment?: string, printerId?: number): Token {
	const now = Date.now();
	const token = generateToken();

	// If printerId not specified, use first available printer
	let finalPrinterId = printerId;
	if (finalPrinterId === undefined) {
		const printers = db.prepare('SELECT id FROM printers ORDER BY is_default DESC, id LIMIT 1').all() as any[];
		if (printers.length === 0) {
			throw new Error('No printers configured. Please add a printer first.');
		}
		finalPrinterId = printers[0].id;
	}

	const stmt = db.prepare(`
		INSERT INTO tokens (token, created_at, expires_at, ttl_minutes, filename, comment, printer_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);

	stmt.run(token, now, now + ttlMinutes * 60 * 1000, ttlMinutes, filename || null, comment || null, finalPrinterId);

	return getToken(token)!;
}

// Получение токена
export function getToken(token: string): Token | null {
	const stmt = db.prepare(`
		SELECT t.*, p.name as printer_name
		FROM tokens t
		LEFT JOIN printers p ON t.printer_id = p.id
		WHERE t.token = ? AND t.revoked = 0
	`);

	const row = stmt.get(token) as any;
	if (!row) return null;

	return {
		...row,
		revoked: !!row.revoked
	};
}

// Проверка валидности токена
export function validateToken(token: string): boolean {
	const t = getToken(token);
	if (!t) return false;

	// Проверка отзыва
	if (t.revoked) {
		return false;
	}

	// Проверка истечения
	if (Date.now() > t.expires_at) {
		return false;
	}

	return true;
}

// Получение всех активных токенов
export function getAllTokens(printerId?: number): Token[] {
	// Удаляем истёкшие токены
	cleanupExpiredTokens();

	let stmt;
	if (printerId !== undefined) {
		stmt = db.prepare(`
			SELECT t.*, p.name as printer_name
			FROM tokens t
			LEFT JOIN printers p ON t.printer_id = p.id
			WHERE t.revoked = 0 AND t.printer_id = ?
			ORDER BY t.created_at DESC
		`);
		return (stmt.all(printerId) as any[]).map(row => ({
			...row,
			revoked: !!row.revoked
		}));
	} else {
		stmt = db.prepare(`
			SELECT t.*, p.name as printer_name
			FROM tokens t
			LEFT JOIN printers p ON t.printer_id = p.id
			WHERE t.revoked = 0
			ORDER BY t.created_at DESC
		`);
		return (stmt.all() as any[]).map(row => ({
			...row,
			revoked: !!row.revoked
		}));
	}
}

// Обновление комментария токена
export function updateTokenComment(token: string, comment: string): boolean {
	const stmt = db.prepare(`
		UPDATE tokens SET comment = ? WHERE token = ?
	`);

	const result = stmt.run(comment, token);
	return result.changes > 0;
}

// Отзыв токена
export function revokeToken(token: string): boolean {
	const stmt = db.prepare(`
		UPDATE tokens SET revoked = 1 WHERE token = ?
	`);

	const result = stmt.run(token);
	return result.changes > 0;
}

// Удаление истёкших токенов
export function cleanupExpiredTokens(): void {
	const stmt = db.prepare(`
		DELETE FROM tokens WHERE expires_at < ?
	`);
	stmt.run(Date.now());
}

// Форматирование оставшегося времени
export function formatTimeRemaining(expiresAt: number): string {
	const remaining = expiresAt - Date.now();
	if (remaining <= 0) return 'Истёк';

	const hours = Math.floor(remaining / (1000 * 60 * 60));
	const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

	if (hours > 0) {
		return `${hours}ч ${minutes}мин`;
	}
	return `${minutes}мин`;
}
