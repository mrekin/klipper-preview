import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPrinter,
	updatePrinter,
	deletePrinter,
	invalidatePrinterCache,
	clearPrinterError
} from '$lib/server/printers';

// GET /api/printers/:id - Get specific printer
export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid printer ID' }, { status: 400 });
		}

		const printer = getPrinter(id);
		if (!printer) {
			return json({ error: 'Printer not found' }, { status: 404 });
		}

		return json(printer);
	} catch (error) {
		console.error('Error fetching printer:', error);
		return json({ error: 'Failed to fetch printer' }, { status: 500 });
	}
};

// PUT /api/printers/:id - Update printer
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid printer ID' }, { status: 400 });
		}

		const body = await request.json();
		const { name, moonraker_url, is_default, thumbnail_sizes } = body;

		// Validation
		if (!name || typeof name !== 'string') {
			return json({ error: 'Name is required' }, { status: 400 });
		}

		if (!moonraker_url || typeof moonraker_url !== 'string') {
			return json({ error: 'Moonraker URL is required' }, { status: 400 });
		}

		// Validate thumbnail_sizes (if provided)
		if (thumbnail_sizes !== undefined && thumbnail_sizes !== null && thumbnail_sizes !== '') {
			if (typeof thumbnail_sizes !== 'string') {
				return json({ error: 'Thumbnail sizes must be a string' }, { status: 400 });
			}

			// Parse and validate format
			try {
				const sizes = thumbnail_sizes.split(',').map((s: string) => s.trim());
				const sizeRegex = /^\d+x\d+$/;

				for (const size of sizes) {
					if (!sizeRegex.test(size)) {
						return json({
							error: `Invalid size format: "${size}". Use format like "256x256"`
						}, { status: 400 });
					}
				}
			} catch (e) {
				return json({ error: 'Invalid thumbnail sizes format' }, { status: 400 });
			}
		}

		// Validate URL format
		try {
			new URL(moonraker_url);
		} catch {
			return json({ error: 'Invalid Moonraker URL format' }, { status: 400 });
		}

		// Validate name length
		if (name.length > 100) {
			return json({ error: 'Name must be 100 characters or less' }, { status: 400 });
		}

		// Test connection to Moonraker
		let connectionOk = false;
		try {
			const testResponse = await fetch(`${moonraker_url}/printer/info`, {
				signal: AbortSignal.timeout(5000)
			});
			if (!testResponse.ok) {
				return json({ error: 'Cannot connect to Moonraker at provided URL' }, { status: 400 });
			}
			connectionOk = true;
		} catch {
			return json({ error: 'Cannot connect to Moonraker at provided URL' }, { status: 400 });
		}

		const success = updatePrinter(id, name, moonraker_url, is_default, thumbnail_sizes || null);
		if (!success) {
			return json({ error: 'Printer not found' }, { status: 404 });
		}

		// Clear error if connection was successful
		if (connectionOk) {
			clearPrinterError(id);
		}

		// Invalidate cache
		invalidatePrinterCache(id);

		const updatedPrinter = getPrinter(id);
		return json(updatedPrinter);
	} catch (error: any) {
		console.error('Error updating printer:', error);

		// Check for unique constraint violation
		if (error.message && error.message.includes('UNIQUE')) {
			return json({ error: 'Printer name already exists' }, { status: 409 });
		}

		return json({ error: 'Failed to update printer' }, { status: 500 });
	}
};

// DELETE /api/printers/:id - Delete printer
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid printer ID' }, { status: 400 });
		}

		// Check for confirmation parameter
		const confirm = url.searchParams.get('confirm');
		if (confirm !== 'true') {
			const printer = getPrinter(id);
			if (!printer) {
				return json({ error: 'Printer not found' }, { status: 404 });
			}

			// Get token count for this printer
			const { getAllTokens } = await import('$lib/server/tokens');
			const printerTokens = getAllTokens(id);

			return json({
				confirm_required: true,
				printer_name: printer.name,
				token_count: printerTokens.length
			});
		}

		const deletedTokens = deletePrinter(id);

		return json({
			success: true,
			deleted_tokens: deletedTokens
		});
	} catch (error) {
		console.error('Error deleting printer:', error);
		return json({ error: 'Failed to delete printer' }, { status: 500 });
	}
};
