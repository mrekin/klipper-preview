// Server-side base path storage (set from X-Base-Path header)
let serverBasePath: string = '';

// Server-side public URL storage (loaded from DB)
let serverPublicUrl: string = '';

/**
 * Initialize base path from current URL (client-side only)
 * Called on page load to avoid waiting for API
 */
function initBasePathFromUrl(): void {
	if (typeof window !== 'undefined' && !window.__BASE_PATH__) {
		const pathname = window.location.pathname;

		// Remove known app routes to find base path
		// /klipper/admin -> /klipper
		// /klipper/view?token=abc -> /klipper
		// /admin -> (empty)
		// /view?token=abc -> (empty)
		const knownRoutes = ['/admin', '/view', '/api'];

		let basePath = '';
		for (const route of knownRoutes) {
			const index = pathname.indexOf(route);
			if (index > 0) {
				// Found route, extract base path
				basePath = pathname.substring(0, index);
				break;
			} else if (index === 0) {
				// Route is at root, no base path
				basePath = '';
				break;
			}
		}

		window.__BASE_PATH__ = basePath;
	}
}

// Initialize immediately on script load
if (typeof window !== 'undefined') {
	initBasePathFromUrl();
}


/**
 * Set the base path on server side from X-Base-Path header
 * Called by hooks.server.ts
 */
export function setServerBasePath(path: string): void {
	serverBasePath = path;
}

/**
 * Set the public URL on server side from database
 * Called by hooks.server.ts
 */
export function setPublicUrl(url: string): void {
	serverPublicUrl = url;
	if (typeof window !== 'undefined') {
		window.__PUBLIC_URL__ = url;
	}
}

/**
 * Get the public URL setting
 * Client-side: from window.__PUBLIC_URL__ (set by layout)
 * Server-side: from serverPublicUrl (set by hooks.server.ts)
 */
export function getPublicUrlSetting(): string {
	if (typeof window !== 'undefined') {
		return window.__PUBLIC_URL__ || '';
	}
	return serverPublicUrl;
}

/**
 * Get the base path for the application (e.g., '/klipper' or '' for root)
 * This is determined from the X-Base-Path header set by Caddy
 * Client-side: fetched from /api/config/base-path
 * Server-side: set via setServerBasePath()
 */
export async function getBasePath(): Promise<string> {
	if (typeof window !== 'undefined') {
		// Client-side: fetch from API or use cached value
		if (!window.__BASE_PATH__) {
			try {
				const res = await fetch('/api/admin/config/base-path');
				if (res.ok) {
					const data = await res.json();
					window.__BASE_PATH__ = data.basePath || '';
				}
			} catch (e) {
				console.error('Failed to fetch base path:', e);
			}
		}
		return window.__BASE_PATH__ || '';
	}
	// Server-side: use value set from X-Base-Path header
	return serverBasePath;
}

/**
 * Get the base path synchronously (only after it's been loaded)
 * Use this when you're certain getBasePath() has already been called
 */
export function getBasePathSync(): string {
	if (typeof window !== 'undefined') {
		return window.__BASE_PATH__ || '';
	}
	return serverBasePath;
}

/**
 * Add base path to a relative path for client-side use
 * Used for API requests and navigation in the browser
 *
 * Examples:
 *   getBasePathUrl('/api/status') -> '/klipper/api/status' or '/api/status'
 *   getBasePathUrl('/admin') -> '/klipper/admin' or '/admin'
 *
 * IMPORTANT: This is for client-side use only!
 * Server-side routing works without base path (Caddy handle_path strips it)
 */
export function getBasePathUrl(path: string): string {
	const basePath = getBasePathSync();
	const cleanPath = path.startsWith('/') ? path : '/' + path;
	return basePath + cleanPath;
}

/**
 * Build a complete public URL for a given path
 * Uses public URL setting if configured, otherwise falls back to window.location.origin + base path
 * Used for generating shareable links, QR codes, etc.
 *
 * Examples:
 *   getPublicUrl('/view/abc123') -> 'https://mydomain.ru/klippershare/view/abc123' (with public URL)
 *   getPublicUrl('/view/abc123') -> 'https://example.com/klipper/view/abc123' (fallback)
 */
export async function getPublicUrl(path: string): Promise<string> {
	if (typeof window === 'undefined') {
		// Server-side: return relative path (shouldn't be used server-side)
		return path;
	}

	const publicUrl = getPublicUrlSetting();
	const cleanPath = path.startsWith('/') ? path : '/' + path;

	// Use public URL if configured, otherwise use current origin + basePath
	if (publicUrl) {
		return publicUrl + cleanPath;
	}

	const basePath = await getBasePath();
	return window.location.origin + basePath + cleanPath;
}

// Extend window interface for base path cache and public URL
declare global {
	interface Window {
		__BASE_PATH__?: string;
		__PUBLIC_URL__?: string;
	}
}
