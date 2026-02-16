import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateToken } from '$lib/server/tokens';
import { setServerBasePath } from '$lib/config';

export const handle: Handle = async ({ event, resolve }) => {
	// Read base path from X-Base-Path header set by Caddy
	// Caddy should be configured to set this header with the base path
	const basePath = event.request.headers.get('X-Base-Path') || '';

	// Store base path for server-side use
	setServerBasePath(basePath);
	(event.locals as any).basePath = basePath;

	const pathname = event.url.pathname;

	// Admin access protection
	// In production this should be enforced through Caddy
	// This provides additional defense-in-depth
	if (pathname.startsWith('/admin')) {
		// Can add IP-based protection here
		// const clientIp = event.getClientAddress();
		// if (!isLocalNetwork(clientIp)) {
		// 	return new Response('Access denied', { status: 403 });
		// }
	}

	// Token validation for view pages
	if (pathname.startsWith('/view')) {
		const url = new URL(event.request.url);
		const token = url.searchParams.get('token');
		if (token && !validateToken(token)) {
			return new Response('Ссылка недействительна или истёк срок действия', {
				status: 403,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}
	}

	const response = await resolve(event);

	return response;
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error('Server error:', error);

	return {
		message: 'Произошла ошибка сервера'
	};
};
