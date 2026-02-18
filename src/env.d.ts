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
		}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		__BASE_PATH__?: string;
		__PUBLIC_URL__?: string;
	}
}

export {};
