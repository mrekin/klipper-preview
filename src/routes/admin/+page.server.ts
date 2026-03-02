import type { ServerLoad } from '@sveltejs/kit';
import { getAllTokens } from '$lib/server/database';
import { fetchPrinterStatus } from '$lib/server/moonraker';

export const load: ServerLoad = async ({ url }) => {
	const tokens = getAllTokens();

	// Get printer_id from URL params
	const printerParam = url.searchParams.get('printer');
	const printerId = printerParam ? parseInt(printerParam, 10) : undefined;

	const status = await fetchPrinterStatus(printerId);

	return {
		tokens,
		status
	};
};
