import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPrinterStatus } from '$lib/server/moonraker';
import { validateToken, getToken } from '$lib/server/database';

export const GET: RequestHandler = async ({ url }) => {
	// Токен передаётся как query-параметр
	const token = url.searchParams.get('token');

	// Проверка на отсутствие токена - возвращаем 401 Unauthorized
	if (!token) {
		return json({ error: 'Token is required' }, { status: 401 });
	}

	// Валидация токена - возвращаем 403 Forbidden для невалидных токенов
	if (!validateToken(token)) {
		return json({ error: 'Invalid or expired token' }, { status: 403 });
	}

	try {
		// Get token data to extract printer_id
		const tokenData = getToken(token);
		const printerId = tokenData?.printer_id || undefined;

		const status = await fetchPrinterStatus(printerId);
		return json(status);
	} catch (error) {
		return json({ error: 'Failed to fetch printer status' }, { status: 500 });
	}
};
