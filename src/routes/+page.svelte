<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getBasePathUrl, getBasePath } from '$lib/config';

	onMount(async () => {
		await getBasePath();
		goto(getBasePathUrl('/admin'));
	});
</script>

<div class="flex items-center justify-center min-h-screen">
	<div class="text-center">
		<div class="text-2xl font-bold mb-4">Klipper Print Share</div>
		<p class="text-surface-500">Перенаправление...</p>
	</div>
</div>
