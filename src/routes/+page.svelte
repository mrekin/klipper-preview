<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { _ as locales } from 'svelte-i18n';

	onMount(async () => {
		const basePath = $page.data.basePath || '';
		goto(basePath + '/admin');
	});
</script>

<div class="flex items-center justify-center min-h-screen">
	<div class="text-center">
		<div class="text-2xl font-bold mb-4">{$locales('app.name')}</div>
		<p class="text-surface-500">{$locales('app.redirecting')}</p>
	</div>
</div>
