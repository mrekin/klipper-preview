import { db } from './tokens';

// Cache for printer settings (5 min TTL)
const printerCache = new Map<number, { printer: Printer; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface Printer {
	id: number;
	name: string;
	moonraker_url: string;
	created_at: number;
	is_default: boolean;
	last_error: string | null;
}

// Get all printers
export function getAllPrinters(): Printer[] {
	const stmt = db.prepare(
		'SELECT id, name, moonraker_url, created_at, is_default, last_error FROM printers ORDER BY name'
	);
	const rows = stmt.all() as any[];
	return rows.map((row: any) => ({
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error
	}));
}

// Get printer by ID
export function getPrinter(id: number): Printer | null {
	// Check cache first
	const cached = printerCache.get(id);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.printer;
	}

	const stmt = db.prepare('SELECT id, name, moonraker_url, created_at, is_default, last_error FROM printers WHERE id = ?');
	const row = stmt.get(id) as any;

	if (!row) return null;

	const printer: Printer = {
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error
	};

	// Cache it
	printerCache.set(id, { printer, timestamp: Date.now() });

	return printer;
}

// Get default printer
export function getDefaultPrinter(): Printer | null {
	const stmt = db.prepare(
		'SELECT id, name, moonraker_url, created_at, is_default, last_error FROM printers WHERE is_default = 1'
	);
	const row = stmt.get() as any;

	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error
	};
}

// Create printer
export function createPrinter(name: string, moonrakerUrl: string, isDefault = false): Printer {
	const now = Date.now();

	// If setting as default, remove default flag from others
	if (isDefault) {
		db.prepare('UPDATE printers SET is_default = 0').run();
	}

	const stmt = db.prepare(
		'INSERT INTO printers (name, moonraker_url, created_at, is_default) VALUES (?, ?, ?, ?)'
	);
	const result = stmt.run(name, moonrakerUrl, now, isDefault ? 1 : 0);

	const id = result.lastID!;
	const printer: Printer = {
		id,
		name,
		moonraker_url: moonrakerUrl,
		created_at: now,
		is_default: isDefault,
		last_error: null
	};

	// Invalidate cache
	printerCache.clear();

	return printer;
}

// Update printer
export function updatePrinter(id: number, name: string, moonrakerUrl: string, isDefault = false): boolean {
	// Check if printer exists
	const checkStmt = db.prepare('SELECT id FROM printers WHERE id = ?');
	const existing = checkStmt.get(id) as any;
	if (!existing) return false;

	// If setting as default, remove default flag from others
	if (isDefault) {
		db.prepare('UPDATE printers SET is_default = 0').run();
	}

	const stmt = db.prepare(
		'UPDATE printers SET name = ?, moonraker_url = ?, is_default = ? WHERE id = ?'
	);
	stmt.run(name, moonrakerUrl, isDefault ? 1 : 0, id);

	// Invalidate cache
	printerCache.delete(id);

	return true;
}

// Delete printer (returns number of deleted tokens)
export function deletePrinter(id: number): number {
	// Count tokens that will be deleted
	const countStmt = db.prepare('SELECT COUNT(*) as count FROM tokens WHERE printer_id = ?');
	const tokenCount = countStmt.get(id) as any;
	const count = tokenCount?.count || 0;

	// Delete printer (CASCADE will delete tokens)
	const deleteStmt = db.prepare('DELETE FROM printers WHERE id = ?');
	deleteStmt.run(id);

	// Invalidate cache
	printerCache.delete(id);

	return count;
}

// Get Moonraker URL for printer
export function getPrinterMoonrakerUrl(printerId: number): string | null {
	const printer = getPrinter(printerId);
	return printer?.moonraker_url || null;
}

// Invalidate cache for specific printer
export function invalidatePrinterCache(printerId: number): void {
	printerCache.delete(printerId);
}

// Invalidate all printer cache
export function invalidateAllPrinterCache(): void {
	printerCache.clear();
}

// Set printer error
export function setPrinterError(id: number, error: string | null): void {
	const stmt = db.prepare('UPDATE printers SET last_error = ? WHERE id = ?');
	stmt.run(error, id);
	printerCache.delete(id);
}

// Clear printer error
export function clearPrinterError(id: number): void {
	setPrinterError(id, null);
}
