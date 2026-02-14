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

const db = new Database(dbPath, { fileMustExist: false });
// Включаем WAL mode для одновременого чтения/записи
db.pragma('journal_mode = WAL');

// Создание таблицы при первом запуске
db.exec(`
	CREATE TABLE IF NOT EXISTS tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		token TEXT UNIQUE NOT NULL,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL,
		ttl_minutes INTEGER NOT NULL,
		filename TEXT,
		comment TEXT,
		revoked INTEGER DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
	CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
`);

export interface Setting {
	key: string;
	value: string;
}

// Настройки Moonraker URL
const MOONRAKER_URL_KEY = 'moonraker_url';
const DEFAULT_MOONRAKER_URL = 'http://192.168.1.100:7125';

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

export interface Token {
	id: number;
	token: string;
	created_at: number;
	expires_at: number;
	ttl_minutes: number;
	filename: string | null;
	comment: string | null;
	revoked: boolean;
}

// Генерация токена
export function generateToken(): string {
	return randomBytes(24).toString('base64url').slice(0, 32);
}

// Создание нового токена
export function createToken(ttlMinutes: number, filename?: string, comment?: string): Token {
	const now = Date.now();
	const token = generateToken();

	const stmt = db.prepare(`
		INSERT INTO tokens (token, created_at, expires_at, ttl_minutes, filename, comment)
		VALUES (?, ?, ?, ?, ?, ?)
	`);

	stmt.run(token, now, now + ttlMinutes * 60 * 1000, ttlMinutes, filename || null, comment || null);

	return getToken(token)!;
}

// Получение токена
export function getToken(token: string): Token | null {
	const stmt = db.prepare(`
		SELECT * FROM tokens WHERE token = ? AND revoked = 0
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

	// Проверка истечения
	if (Date.now() > t.expires_at) {
		return false;
	}

	return true;
}

// Получение всех активных токенов
export function getAllTokens(): Token[] {
	// Удаляем истёкшие токены
	cleanupExpiredTokens();

	const stmt = db.prepare(`
		SELECT * FROM tokens WHERE revoked = 0 ORDER BY created_at DESC
	`);

	return (stmt.all() as any[]).map(row => ({
		...row,
		revoked: !!row.revoked
	}));
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
