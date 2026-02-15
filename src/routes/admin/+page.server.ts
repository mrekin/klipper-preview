import type { ServerLoad } from '@sveltejs/kit';
import { getAllTokens } from '$lib/server/tokens';
import { fetchPrinterStatus } from '$lib/server/moonraker';

export const load: ServerLoad = async () => {
	const tokens = getAllTokens();
	const status = await fetchPrinterStatus();

	return {
		tokens,
		status
	};
};
