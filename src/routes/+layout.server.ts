import type { LayoutServerLoad } from './$types';
import { getLanguageSetting, getDefaultPageSetting } from '$lib/server/database';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Pass base path from X-Base-Path header, public URL and language to all pages
	const language = getLanguageSetting();
	const defaultPage = getDefaultPageSetting();
	return {
		basePath: (locals as any).basePath || '',
		publicUrl: (locals as any).publicUrl || '',
		language,
		defaultPage
	};
};
