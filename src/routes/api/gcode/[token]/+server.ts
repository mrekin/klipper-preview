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
		
		// Return movement lines (G0/G1 + LAYER markers) with file positions
		// This allows frontend to determine which part of the current layer has been printed
		interface GcodeLineEntry {
			line: string;
			filePosition: number;
		}

		const lines = gcode.split('\n');
		const movementLines: GcodeLineEntry[] = [];
		let currentBytePosition = 0;

		for (const line of lines) {
			const trimmed = line.trim();
			const lineLength = line.length + 1; // +1 for newline character

			if (trimmed.startsWith('G0') || trimmed.startsWith('G1') ||
			    trimmed.startsWith(';LAYER:') || trimmed.startsWith('; layer')) {
				movementLines.push({
					line: trimmed,
					filePosition: currentBytePosition
				});
			}

			currentBytePosition += lineLength;
		}

		return json({
			filename,
			lines: movementLines.slice(0, 50000) // Limit for large files
		});
	} catch (error) {
		return json({ error: 'Failed to fetch G-code' }, { status: 500 });
	}
};
