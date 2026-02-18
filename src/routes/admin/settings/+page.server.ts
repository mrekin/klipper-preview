import type { PageServerLoad } from './$types';
import { getMoonrakerUrlSetting, getPublicUrlSetting } from '$lib/server/tokens';

export const load: PageServerLoad = async () => {
	return {
		moonrakerUrl: getMoonrakerUrlSetting(),
		publicUrl: getPublicUrlSetting()
	};
};
