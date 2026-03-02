import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllPrinters, setPrinterError, clearPrinterError } from '$lib/server/printers';

// POST /api/admin/printers/health - Health check for all printers
export const POST: RequestHandler = async () => {
	try {
		const printers = getAllPrinters();
		const results = await Promise.allSettled(
			printers.map(async (printer) => {
				try {
					const testResponse = await fetch(`${printer.moonraker_url}/printer/info`, {
						signal: AbortSignal.timeout(5000)
					});

					if (!testResponse.ok) {
						throw new Error(`HTTP ${testResponse.status}`);
					}

					clearPrinterError(printer.id);
					return {
						printer_id: printer.id,
						printer_name: printer.name,
						status: 'ok' as const
					};
				} catch (e: any) {
					const errorMsg = `Connection failed: ${e.message}`;
					setPrinterError(printer.id, errorMsg);
					return {
						printer_id: printer.id,
						printer_name: printer.name,
						status: 'error' as const,
						error: errorMsg
					};
				}
			})
		);

		const summary = {
			total: printers.length,
			ok: results.filter((r) => r.status === 'fulfilled' && r.value.status === 'ok').length,
			error: results.filter((r) => r.status === 'fulfilled' && r.value.status === 'error').length,
			timestamp: Date.now()
		};

		const details = results.map((r, i) => ({
			printer_id: printers[i].id,
			printer_name: printers[i].name,
			status: r.status === 'fulfilled' ? r.value.status : 'error',
			error: r.status === 'fulfilled' ? r.value.error : 'Check failed'
		}));

		return json({
			summary,
			details
		});
	} catch (error) {
		console.error('Error checking all printers health:', error);
		return json({ error: 'Failed to check printers health' }, { status: 500 });
	}
};
