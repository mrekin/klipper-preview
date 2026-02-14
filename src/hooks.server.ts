import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateToken } from '$lib/server/tokens';

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	
	// Проверка доступа к админ-панели
	// В production это должно проверяться через Caddy
	// Здесь дополнительная защита
	if (pathname.startsWith('/admin')) {
		// Можно добавить проверку IP или другой защиты
		// const clientIp = event.getClientAddress();
		// if (!isLocalNetwork(clientIp)) {
		// 	return new Response('Access denied', { status: 403 });
		// }
	}
	
	// Валидация токена для view страниц
	if (pathname.startsWith('/view/')) {
		const token = pathname.split('/')[2];
		if (token && !validateToken(token)) {
			return new Response('Ссылка недействительна или истёк срок действия', { 
				status: 403,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}
	}
	
	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error('Server error:', error);
	
	return {
		message: 'Произошла ошибка сервера'
	};
};
