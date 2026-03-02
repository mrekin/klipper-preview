import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMoonrakerUrlSetting,
	setMoonrakerUrlSetting,
	getPublicUrlSetting,
	setPublicUrlSetting,
	getLanguageSetting,
	setLanguageSetting,
	getDefaultPageSetting,
	setDefaultPageSetting
} from '$lib/server/database';

// Get settings
export const GET: RequestHandler = async () => {
	const moonrakerUrl = getMoonrakerUrlSetting();
	const publicUrl = getPublicUrlSetting();
	const language = getLanguageSetting();
	const defaultPage = getDefaultPageSetting();
	return json({ moonrakerUrl, publicUrl, language, defaultPage });
};

// Validate public URL format
function isValidPublicUrl(url: string): boolean {
	if (!url) return true; // Empty value is valid (disabled)
	try {
		new URL(url);
		return url.startsWith('http://') || url.startsWith('https://');
	} catch {
		return false;
	}
}

// Save settings
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { moonrakerUrl, publicUrl, language, defaultPage } = body;

	if (moonrakerUrl && typeof moonrakerUrl === 'string') {
		setMoonrakerUrlSetting(moonrakerUrl);
	}

	if (publicUrl !== undefined) {
		// Validation: empty string is a valid value (disabled)
		if (publicUrl === '' || isValidPublicUrl(publicUrl)) {
			setPublicUrlSetting(publicUrl);
		} else {
			return json({ error: 'Invalid publicUrl format' }, { status: 400 });
		}
	}

	if (language && typeof language === 'string') {
		try {
			setLanguageSetting(language);
		} catch (e: any) {
			return json({ error: e.message }, { status: 400 });
		}
	}

	if (defaultPage && typeof defaultPage === 'string') {
		try {
			setDefaultPageSetting(defaultPage);
		} catch (e: any) {
			return json({ error: e.message }, { status: 400 });
		}
	}

	return json({ success: true, moonrakerUrl, publicUrl, language, defaultPage });
};
