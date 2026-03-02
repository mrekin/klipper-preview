<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ as locales } from 'svelte-i18n';
	import { browser } from '$app/environment';

	// Use $effect instead of onMount for reliable client-side execution in Svelte 5
	$effect(() => {
		if (browser) {
			const basePath = page.data.basePath || '';
			const defaultPage = page.data.defaultPage || '/admin';
			console.log('[+page.svelte] Redirecting to:', basePath + defaultPage, 'defaultPage from DB:', defaultPage);
			goto(basePath + defaultPage);
		}
	});
</script>

<div class="flex items-center justify-center min-h-screen">
	<div class="text-center">
		<div class="text-2xl font-bold mb-4">{$locales('app.name')}</div>
		<p class="text-surface-500">{$locales('app.redirecting')}</p>
	</div>
</div>
