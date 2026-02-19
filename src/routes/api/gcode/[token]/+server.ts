import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchGcode } from '$lib/server/moonraker';
import { validateToken, getToken } from '$lib/server/tokens';

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
		
		// Возвращаем только путь движения (G0/G1 команды) для экономии трафика
		const lines = gcode.split('\n');
		const movementLines: string[] = [];
		
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('G0') || trimmed.startsWith('G1') || 
			    trimmed.startsWith(';LAYER:') || trimmed.startsWith('; layer')) {
				movementLines.push(trimmed);
			}
		}
		
		return json({ 
			filename,
			lines: movementLines.slice(0, 50000) // Ограничение для больших файлов
		});
	} catch (error) {
		return json({ error: 'Failed to fetch G-code' }, { status: 500 });
	}
};
