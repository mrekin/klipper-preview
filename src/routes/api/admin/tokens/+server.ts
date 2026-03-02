import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createToken, getAllTokens, revokeToken } from '$lib/server/database';

// Получить все токены
export const GET: RequestHandler = async ({ url }) => {
	const printerIdParam = url.searchParams.get('printer_id');
	const printerId = printerIdParam ? parseInt(printerIdParam) : undefined;
	const tokens = await getAllTokens(printerId);
	return json(tokens);
};

// Создать новый токен
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	// Валидация TTL (от 1 до 43200 минут, без округления)
	let ttlMinutes = body.ttl || 60;
	ttlMinutes = Math.max(1, Math.min(43200, Math.floor(Number(ttlMinutes))));

	const token = createToken(ttlMinutes, body.filename, body.comment, body.printer_id);
	return json(token, { status: 201 });
};

// Удалить (отозвать) токен
export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const token = body.token;

	if (!token) {
		return json({ error: 'Token required' }, { status: 400 });
	}

	const success = revokeToken(token);

	if (success) {
		return json({ success: true });
	} else {
		return json({ error: 'Token not found' }, { status: 404 });
	}
};
