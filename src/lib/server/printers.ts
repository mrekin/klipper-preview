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
	thumbnail_sizes?: string | null;
}

// Get all printers
export function getAllPrinters(): Printer[] {
	const stmt = db.prepare(
		'SELECT id, name, moonraker_url, created_at, is_default, last_error, thumbnail_sizes FROM printers ORDER BY name'
	);
	const rows = stmt.all() as any[];
	return rows.map((row: any) => ({
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error,
		thumbnail_sizes: row.thumbnail_sizes
	}));
}

// Get printer by ID
export function getPrinter(id: number): Printer | null {
	// Check cache first
	const cached = printerCache.get(id);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.printer;
	}

	const stmt = db.prepare('SELECT id, name, moonraker_url, created_at, is_default, last_error, thumbnail_sizes FROM printers WHERE id = ?');
	const row = stmt.get(id) as any;

	if (!row) return null;

	const printer: Printer = {
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error,
		thumbnail_sizes: row.thumbnail_sizes
	};

	// Cache it
	printerCache.set(id, { printer, timestamp: Date.now() });

	return printer;
}

// Get default printer
export function getDefaultPrinter(): Printer | null {
	const stmt = db.prepare(
		'SELECT id, name, moonraker_url, created_at, is_default, last_error, thumbnail_sizes FROM printers WHERE is_default = 1'
	);
	const row = stmt.get() as any;

	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		moonraker_url: row.moonraker_url,
		created_at: row.created_at,
		is_default: row.is_default === 1,
		last_error: row.last_error,
		thumbnail_sizes: row.thumbnail_sizes
	};
}

// Create printer
export function createPrinter(name: string, moonrakerUrl: string, isDefault = false, thumbnailSizes?: string): Printer {
	const now = Date.now();

	// If setting as default, remove default flag from others
	if (isDefault) {
		db.prepare('UPDATE printers SET is_default = 0').run();
	}

	// Parse thumbnail sizes to JSON array
	const jsonSizes = parseThumbnailSizes(thumbnailSizes);

	const stmt = db.prepare(
		'INSERT INTO printers (name, moonraker_url, created_at, is_default, thumbnail_sizes) VALUES (?, ?, ?, ?, ?)'
	);
	const result = stmt.run(name, moonrakerUrl, now, isDefault ? 1 : 0, jsonSizes);

	const id = result.lastID!;
	const printer: Printer = {
		id,
		name,
		moonraker_url: moonrakerUrl,
		created_at: now,
		is_default: isDefault,
		last_error: null,
		thumbnail_sizes: jsonSizes
	};

	// Invalidate cache
	printerCache.clear();

	return printer;
}

// Update printer
export function updatePrinter(id: number, name: string, moonrakerUrl: string, isDefault = false, thumbnailSizes?: string): boolean {
	// Check if printer exists
	const checkStmt = db.prepare('SELECT id FROM printers WHERE id = ?');
	const existing = checkStmt.get(id) as any;
	if (!existing) return false;

	// If setting as default, remove default flag from others
	if (isDefault) {
		db.prepare('UPDATE printers SET is_default = 0').run();
	}

	// Parse thumbnail sizes to JSON array
	const jsonSizes = parseThumbnailSizes(thumbnailSizes);

	const stmt = db.prepare(
		'UPDATE printers SET name = ?, moonraker_url = ?, is_default = ?, thumbnail_sizes = ? WHERE id = ?'
	);
	stmt.run(name, moonrakerUrl, isDefault ? 1 : 0, jsonSizes, id);

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

// Default thumbnail sizes
export const DEFAULT_THUMBNAIL_SIZES = ['256x256', '128x128', '64x64', '32x32'];

// Get thumbnail sizes for printer with fallback to defaults
export function getPrinterThumbnailSizes(printerId: number): string[] {
	const printer = getPrinter(printerId);
	if (!printer?.thumbnail_sizes) {
		return DEFAULT_THUMBNAIL_SIZES;
	}

	try {
		const sizes = JSON.parse(printer.thumbnail_sizes);
		return Array.isArray(sizes) ? sizes : DEFAULT_THUMBNAIL_SIZES;
	} catch {
		return DEFAULT_THUMBNAIL_SIZES;
	}
}

// Helper to parse thumbnail sizes from comma-separated string and convert to JSON array
export function parseThumbnailSizes(sizesStr: string | null | undefined): string | null {
	if (!sizesStr || sizesStr.trim() === '') {
		return null;
	}

	// Parse comma-separated string and convert to JSON array
	const sizes = sizesStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
	if (sizes.length === 0) {
		return null;
	}

	return JSON.stringify(sizes);
}
