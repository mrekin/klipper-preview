<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import type { QRCodeToDataURLOptions } from 'qrcode';

	interface Props {
		text: string;
		size?: number;
	}

	let { text, size = 200 }: Props = $props();

	let dataUrl: string = $state('');
	let error: string | null = $state(null);

	onMount(async () => {
		try {
			const options: QRCodeToDataURLOptions = {
				width: size,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			};
			dataUrl = await QRCode.toDataURL(text, options);
		} catch (e) {
			error = 'Failed to generate QR code';
			console.error('QR Code generation error:', e);
		}
	});
</script>

{#if error}
	<div class="flex items-center justify-center p-4 bg-red-500/10 rounded-lg">
		<span class="text-red-500 text-sm">{error}</span>
	</div>
{:else if dataUrl}
	<div class="inline-block bg-white p-2 rounded-lg shadow-md">
		<img src={dataUrl} alt="QR Code" style="width: {size}px; height: {size}px;" />
	</div>
{/if}
