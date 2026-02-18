<script lang="ts">
	import QRCode from 'qrcode';
	import type { QRCodeToDataURLOptions } from 'qrcode';

	let {
		text,
		size = 200
	}: {
		text: string;
		size?: number;
	} = $props();

	let dataUrl = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Используем $effect для реактивной генерации QR-кода
	$effect(() => {
		if (!text) {
			error = 'No text provided';
			loading = false;
			return;
		}

		console.log('[QRCode] Generating for:', text);

		// Сбрасываем состояние при изменении text
		dataUrl = '';
		loading = true;
		error = null;

		QRCode.toDataURL(text, {
			width: size,
			margin: 2,
			color: {
				dark: '#000000',
				light: '#ffffff'
			}
		} as QRCodeToDataURLOptions)
			.then((url) => {
				dataUrl = url;
				loading = false;
				console.log('[QRCode] Success, length:', url.length);
			})
			.catch((e) => {
				error = 'Failed to generate QR';
				loading = false;
				console.error('[QRCode] Error:', e);
			});
	});
</script>

<div class="inline-block bg-white p-2 rounded-lg shadow-md">
	{#if loading}
		<div style="width: {size}px; height: {size}px;" class="flex items-center justify-center bg-surface-100">
			<span class="text-sm text-surface-500">Loading...</span>
		</div>
	{:else if error}
		<div style="width: {size}px; height: {size}px;" class="flex items-center justify-center bg-red-500/10">
			<span class="text-sm text-red-500">Error</span>
		</div>
	{:else}
		<img src={dataUrl} alt="QR Code" style="width: {size}px; height: {size}px;" />
	{/if}
</div>
