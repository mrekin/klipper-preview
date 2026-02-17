<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getBasePathUrl, getBasePath } from '$lib/config';

	let moonrakerUrl = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');

	// Get base path from layout data
	let basePath = $derived($page.data.basePath || '');

	// Helper to build API URLs with base path
	function apiUrl(path: string): string {
		return basePath + path;
	}

	async function loadSettings() {
		loading = true;
		error = '';
		try {
			const res = await fetch(apiUrl('/api/settings'));
			if (!res.ok) throw new Error('Failed to load settings');
			const data = await res.json();
			moonrakerUrl = data.moonrakerUrl || '';
		} catch (e) {
			error = 'Ошибка загрузки настроек';
			console.error('Load settings error:', e);
		} finally {
			loading = false;
		}
	}

	async function save() {
		saving = true;
		error = '';
		try {
			const res = await fetch(apiUrl('/api/settings'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ moonrakerUrl })
			});

			if (!res.ok) throw new Error('Failed to save settings');

			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (e) {
			error = 'Ошибка сохранения настроек';
			console.error('Save settings error:', e);
		} finally {
			saving = false;
		}
	}

	onMount(async () => {
		await loadSettings();
	});
</script>

<svelte:head>
	<title>Настройки | Klipper Print Share</title>
</svelte:head>

<div class="min-h-screen bg-surface-50-950 p-6">
	<div class="max-w-2xl mx-auto">
		<a href={apiUrl('/admin')} class="text-primary-500 hover:underline mb-6 inline-block">
			← Назад к панели
		</a>

		<h1 class="text-2xl font-bold mb-6">Настройки подключения</h1>

		{#if error}
			<div class="bg-red-500/10 text-red-500 px-4 py-3 rounded-lg mb-6">
				{error}
			</div>
		{/if}

		<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800">
			<h2 class="text-lg font-semibold mb-4">Moonraker API</h2>

			<div class="space-y-4">
				<div>
					<label for="moonraker-url" class="block text-sm text-surface-500 mb-2"
						>URL Moonraker</label
					>
					<input
						id="moonraker-url"
						type="text"
						bind:value={moonrakerUrl}
						disabled={loading || saving}
						class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50"
						placeholder="http://192.168.1.XXX:7125"
					/>
					<p class="text-sm text-surface-500 mt-2">
						IP-адрес и порт Moonraker в локальной сети
					</p>
				</div>

				<button
					class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={save}
					disabled={loading || saving || !moonrakerUrl}
				>
					{saving ? 'Сохранение...' : 'Сохранить'}
				</button>

				{#if saved}
					<p class="text-green-500">Настройки сохранены!</p>
				{/if}
			</div>
		</div>

		<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800 mt-6">
			<h2 class="text-lg font-semibold mb-4">Информация</h2>

			<div class="space-y-2 text-sm">
				<p>
					<span class="text-surface-500">Moonraker API:</span>
					<code class="bg-surface-200-800 px-2 py-1 rounded"
						>/printer/objects/query</code
					>
				</p>
				<p>
					<span class="text-surface-500">WebSocket:</span>
					<code class="bg-surface-200-800 px-2 py-1 rounded">/websocket</code>
				</p>
				<p>
					<span class="text-surface-500">G-code:</span>
					<code class="bg-surface-200-800 px-2 py-1 rounded"
						>/server/files/gcodes/{'{'}filename{'}'}</code
					>
				</p>
			</div>
		</div>
	</div>
</div>
