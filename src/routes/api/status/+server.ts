import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPrinterStatus } from '$lib/server/moonraker';
import { validateToken } from '$lib/server/tokens';

export const GET: RequestHandler = async ({ url }) => {
	// Токен передаётся как query-параметр
	const token = url.searchParams.get('token');
	
	// Валидация токена
	if (token && !validateToken(token)) {
		return json({ error: 'Invalid or expired token' }, { status: 403 });
	}
	
	try {
		const status = await fetchPrinterStatus();
		return json(status);
	} catch (error) {
		return json({ error: 'Failed to fetch printer status' }, { status: 500 });
	}
};
