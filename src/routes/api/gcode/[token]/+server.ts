import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchGcode } from '$lib/server/moonraker';
import { validateToken, getToken } from '$lib/server/database';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = params.token;
	
	// Валидация токена
	if (!validateToken(token)) {
		return json({ error: 'Invalid or expired token' }, { status: 403 });
	}
	
	// Получаем имя файла из query или из токена
	const tokenData = getToken(token);
	const filename = url.searchParams.get('file') || tokenData?.filename;
	
	if (!filename) {
		return json({ error: 'No file specified' }, { status: 400 });
	}
	
	try {
		const gcode = await fetchGcode(filename, tokenData?.printer_id || undefined);

		if (!gcode) {
			return json({ error: 'G-code file not found' }, { status: 404 });
		}

		// Return full G-code text - no size limit
		// Frontend will parse it in WebWorker for better performance
		return json({
			filename,
			gcode, // Full G-code text
			size: gcode.length
		});
	} catch (error) {
		return json({ error: 'Failed to fetch G-code' }, { status: 500 });
	}
};
