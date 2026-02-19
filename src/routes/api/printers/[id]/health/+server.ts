import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrinter, setPrinterError, clearPrinterError } from '$lib/server/printers';

// POST /api/printers/:id/health - Health check for specific printer
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid printer ID' }, { status: 400 });
		}

		const printer = getPrinter(id);
		if (!printer) {
			return json({ error: 'Printer not found' }, { status: 404 });
		}

		// Test connection to Moonraker
		let healthStatus: 'ok' | 'error';
		let errorMessage: string | null = null;

		try {
			const testResponse = await fetch(`${printer.moonraker_url}/printer/info`, {
				signal: AbortSignal.timeout(5000)
			});

			if (!testResponse.ok) {
				throw new Error(`HTTP ${testResponse.status}`);
			}

			healthStatus = 'ok';
			clearPrinterError(id);
		} catch (e: any) {
			healthStatus = 'error';
			errorMessage = `Connection failed: ${e.message}`;
			setPrinterError(id, errorMessage);
		}

		return json({
			printer_id: id,
			status: healthStatus,
			error: errorMessage,
			timestamp: Date.now()
		});
	} catch (error) {
		console.error('Error checking printer health:', error);
		return json({ error: 'Failed to check printer health' }, { status: 500 });
	}
};
