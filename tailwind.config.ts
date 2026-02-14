import type { Config } from 'tailwindcss';
import { join } from 'path';

export default {
	content: [
		join('./src/**/*.{html,js,svelte,ts}'),
		'./node_modules/@skeletonlabs/skeleton-svelte/**/*.{html,js,svelte,ts}'
	],
	theme: {
		extend: {}
	},
	plugins: []
} satisfies Config;
