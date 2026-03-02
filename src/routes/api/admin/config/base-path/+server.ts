import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * API endpoint to provide base path to the client
 * The base path is determined from the X-Base-Path header set by Caddy
 * and stored in locals by hooks.server.ts
 */
export const GET: RequestHandler = ({ locals }) => {
	// The base path is set by hooks.server.ts from X-Base-Path header
	const basePath = (locals as any).basePath || '';

	return json({ basePath });
};
