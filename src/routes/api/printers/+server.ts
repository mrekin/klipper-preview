import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllPrinters,
	createPrinter,
	getPrinterMoonrakerUrl,
	clearPrinterError
} from '$lib/server/printers';

// GET /api/printers - Get all printers
export const GET: RequestHandler = async () => {
	try {
		const printers = getAllPrinters();
		return json(printers);
	} catch (error) {
		console.error('Error fetching printers:', error);
		return json({ error: 'Failed to fetch printers' }, { status: 500 });
	}
};

// POST /api/printers - Create new printer
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, moonraker_url, is_default } = body;

		// Validation
		if (!name || typeof name !== 'string') {
			return json({ error: 'Name is required' }, { status: 400 });
		}

		if (!moonraker_url || typeof moonraker_url !== 'string') {
			return json({ error: 'Moonraker URL is required' }, { status: 400 });
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

		const printer = createPrinter(name, moonraker_url, is_default);

		// Clear error if connection was successful
		if (connectionOk) {
			clearPrinterError(printer.id);
		}

		return json(printer, { status: 201 });
	} catch (error: any) {
		console.error('Error creating printer:', error);

		// Check for unique constraint violation
		if (error.message && error.message.includes('UNIQUE')) {
			return json({ error: 'Printer name already exists' }, { status: 409 });
		}

		return json({ error: 'Failed to create printer' }, { status: 500 });
	}
};
