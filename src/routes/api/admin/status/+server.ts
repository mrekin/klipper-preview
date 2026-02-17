import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPrinterStatus } from '$lib/server/moonraker';

/**
 * Admin endpoint for printer status.
 * No token validation required - protected by Caddy basic auth.
 */
export const GET: RequestHandler = async () => {
	try {
		const status = await fetchPrinterStatus();
		return json(status);
	} catch (error) {
		return json({ error: 'Failed to fetch printer status' }, { status: 500 });
	}
};
