/// <reference types="@sveltejs/kit" />

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			basePath: string;
			publicUrl: string;
		}
		interface PageData {
			basePath: string;
			publicUrl: string;
			language?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		__BASE_PATH__?: string;
		__PUBLIC_URL__?: string;
	}
}

// Allow JSON imports
declare module '*.json' {
	const value: Record<string, any>;
	export default value;
}

export {};
