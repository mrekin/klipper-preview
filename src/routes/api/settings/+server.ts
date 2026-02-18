import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMoonrakerUrlSetting,
	setMoonrakerUrlSetting,
	getPublicUrlSetting,
	setPublicUrlSetting
} from '$lib/server/tokens';

// Получить настройки
export const GET: RequestHandler = async () => {
	const moonrakerUrl = getMoonrakerUrlSetting();
	const publicUrl = getPublicUrlSetting();
	return json({ moonrakerUrl, publicUrl });
};

// Валидация формата публичного URL
function isValidPublicUrl(url: string): boolean {
	if (!url) return true; // Пустое значение - валидно (отключение)
	try {
		new URL(url);
		return url.startsWith('http://') || url.startsWith('https://');
	} catch {
		return false;
	}
}

// Сохранить настройки
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { moonrakerUrl, publicUrl } = body;

	if (moonrakerUrl && typeof moonrakerUrl === 'string') {
		setMoonrakerUrlSetting(moonrakerUrl);
	}

	if (publicUrl !== undefined) {
		// Валидация: пустая строка - это валидное значение (отключение)
		if (publicUrl === '' || isValidPublicUrl(publicUrl)) {
			setPublicUrlSetting(publicUrl);
		} else {
			return json({ error: 'Invalid publicUrl format' }, { status: 400 });
		}
	}

	return json({ success: true, moonrakerUrl, publicUrl });
};
