import type { RequestHandler } from './$types';
import { validateToken, getToken } from '$lib/server/database';
import { getMoonrakerUrl } from '$lib/server/moonraker';
import { getPrinterThumbnailSizes } from '$lib/server/printers';

const DEFAULT_THUMBNAIL_SIZES = ['256x256', '128x128', '64x64', '32x32'];

export const GET: RequestHandler = async ({ params, url }) => {
	const token = params.token;

	// Validate token
	if (!validateToken(token)) {
		return new Response('Invalid or expired token', { status: 403 });
	}

	const tokenData = getToken(token);
	const printerId = tokenData?.printer_id;

	// Get parameters
	const filename = url.searchParams.get('filename');
	const requestedSize = url.searchParams.get('size');

	if (!filename) {
		return new Response('Filename is required', { status: 400 });
	}

	// Get thumbnail sizes for fallback
	const sizes = printerId
		? getPrinterThumbnailSizes(printerId)
		: DEFAULT_THUMBNAIL_SIZES;

	// If specific size requested, try only that size
	const sizesToTry = requestedSize ? [requestedSize] : sizes;

	// Fallback through sizes
	for (const size of sizesToTry) {
		try {
			const moonrakerUrl = getMoonrakerUrl(printerId ?? undefined);
			// Filename is already URL-encoded from query param, decode it first
			const decodedFilename = decodeURIComponent(filename);
			// Remove .gcode extension for thumbnail path (thumbnails don't include extension)
			const baseFilename = decodedFilename.replace(/\.gcode$/i, '');
			const encodedFilename = encodeURIComponent(baseFilename);
			const thumbnailUrl = `${moonrakerUrl}/server/files/gcodes/.thumbs/${encodedFilename}-${size}.png`;

			const response = await fetch(thumbnailUrl, {
				signal: AbortSignal.timeout(5000)
			});

			if (response.ok) {
				const imageBuffer = await response.arrayBuffer();

				// Return image with proper headers
				return new Response(imageBuffer, {
					status: 200,
					headers: {
						'Content-Type': 'image/png',
						'Cache-Control': 'public, max-age=300' // 5 minutes
					}
				});
			}
		} catch (e) {
			// Fallback to next size - normal operation, not an error
			continue;
		}
	}

	// If no size worked
	return new Response('Thumbnail not found', { status: 404 });
};
