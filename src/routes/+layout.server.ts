import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Pass base path from X-Base-Path header to all pages
	return {
		basePath: (locals as any).basePath || ''
	};
};
