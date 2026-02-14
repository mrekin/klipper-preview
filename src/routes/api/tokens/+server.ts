import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createToken, getAllTokens, revokeToken } from '$lib/server/tokens';

// Получить все токены
export const GET: RequestHandler = async () => {
	const tokens = getAllTokens();
	return json(tokens);
};

// Создать новый токен
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	
	// Валидация TTL (шаг 30 минут, от 30 до 10080 минут)
	let ttlMinutes = body.ttl || 60;
	ttlMinutes = Math.max(30, Math.min(10080, Math.round(ttlMinutes / 30) * 30));
	
	const token = createToken(ttlMinutes, body.filename, body.comment);
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
