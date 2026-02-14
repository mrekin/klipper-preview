import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMoonrakerUrlSetting, setMoonrakerUrlSetting } from '$lib/server/tokens';

// Получить настройки
export const GET: RequestHandler = async () => {
	const moonrakerUrl = getMoonrakerUrlSetting();
	return json({ moonrakerUrl });
};

// Сохранить настройки
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { moonrakerUrl } = body;

	if (!moonrakerUrl || typeof moonrakerUrl !== 'string') {
		return json({ error: 'Invalid moonrakerUrl' }, { status: 400 });
	}

	setMoonrakerUrlSetting(moonrakerUrl);
	return json({ success: true, moonrakerUrl });
};
