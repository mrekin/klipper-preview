<script lang="ts">
	import '../app.css';
	import { setupI18n } from '$lib/i18n';
	import { locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
	}

	let { data }: Props = $props();
	let i18nReady = $state(false);

	// Initialize i18n on client side
	$effect(async () => {
		if (typeof window !== 'undefined' && !i18nReady) {
			try {
				console.log('[LAYOUT] Initializing i18n with locale:', data.language);
				await setupI18n(data.language);
				i18nReady = true;
				console.log('[LAYOUT] i18n initialized successfully');
			} catch (error) {
				console.error('[LAYOUT] Failed to initialize i18n:', error);
				i18nReady = true; // Still show content even if i18n fails
			}
		}
	});

	// Update locale reactively when data.language changes
	$effect(() => {
		if (i18nReady && data.language && data.language !== get(locale)) {
			locale.set(data.language);
		}
	});
</script>

{#if !i18nReady}
	<div class="flex items-center justify-center min-h-screen">
		<p>Loading...</p>
	</div>
{:else}
	<div class="min-h-screen">
		<slot />
	</div>
{/if}
