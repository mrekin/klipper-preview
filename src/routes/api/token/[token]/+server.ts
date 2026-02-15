import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getToken, validateToken } from '$lib/server/tokens';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = params.token;

	// Валидация токена
	if (!validateToken(token)) {
		return json({ error: 'Invalid or expired token' }, { status: 403 });
	}

	// Получаем информацию о токене
	const tokenData = getToken(token);

	if (!tokenData) {
		return json({ error: 'Token not found' }, { status: 404 });
	}

	// Проверяем запрошен ли обновление
	const noCache = url.searchParams.get('noCache') === 'true';

	// Добавляем заголовки для предотвращения кеа
	const headers = new Headers({
		'Cache-Control': noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=10',
	});

	return json(tokenData, { headers });
};
