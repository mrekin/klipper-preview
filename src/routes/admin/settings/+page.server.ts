import type { PageServerLoad } from './$types';
import { getMoonrakerUrlSetting, getPublicUrlSetting, getLanguageSetting, getDefaultPageSetting } from '$lib/server/database';

export const load: PageServerLoad = async () => {
	return {
		moonrakerUrl: getMoonrakerUrlSetting(),
		publicUrl: getPublicUrlSetting(),
		language: getLanguageSetting(),
		defaultPage: getDefaultPageSetting()
	};
};
