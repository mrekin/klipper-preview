<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import QRCode from '$lib/components/QRCode.svelte';
	import { getBasePathUrl, getPublicUrl, getBasePath } from '$lib/config';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	interface Token {
		id: number;
		token: string;
		created_at: number;
		expires_at: number;
		ttl_minutes: number;
		filename: string | null;
		comment: string | null;
		revoked: boolean;
	}

	interface PrinterStatus {
		state: string;
		filename: string;
		progress: number;
		extruder_temp: number;
		extruder_target: number;
		bed_temp: number;
		bed_target: number;
	}

	let tokens = $state<Token[]>(data.tokens);
	let status = $state<PrinterStatus | null>(data.status);
	let loading = $state(false);
	let newTokenTtl = $state(60);
	let newTokenComment = $state('');
	let generatedToken = $state<Token | null>(null);
	let generatedTokenUrl = $state('');
	let copied = $state(false);
	let validationMessage = $state('');

	// Get base path from layout data (set by hooks.server.ts from X-Base-Path header)
	let basePath = $derived($page.data.basePath || '');

	// Helper to build API URLs with base path
	function apiUrl(path: string): string {
		return basePath + path;
	}

	// Helper to build public URLs with base path
	function publicUrl(path: string): string {
		if (typeof window === 'undefined') return path;
		const cleanPath = path.startsWith('/') ? path : '/' + path;
		return window.location.origin + basePath + cleanPath;
	}

	// Предустановленные варианты TTL
	const ttlOptions = [
		{ value: 30, label: '30 мин' },
		{ value: 60, label: '1 час' },
		{ value: 90, label: '1.5 часа' },
		{ value: 120, label: '2 часа' },
		{ value: 180, label: '3 часа' },
		{ value: 240, label: '4 часа' },
		{ value: 360, label: '6 часов' },
		{ value: 480, label: '8 часов' },
		{ value: 720, label: '12 часов' },
		{ value: 1440, label: '24 часа' },
	];

	function validateTtl(value: number): number {
		if (value < 1) {
			validationMessage = 'Минимум: 1 минута';
			return 1;
		}
		if (value > 43200) {
			validationMessage = 'Максимум: 43200 минут (30 дней)';
			return 43200;
		}
		validationMessage = '';
		return value;
	}

	async function loadData() {
		try {
			const [tokensRes, statusRes] = await Promise.all([
				fetch(apiUrl('/api/tokens')),
				fetch(apiUrl('/api/status'))
			]);

			tokens = await tokensRes.json();
			status = await statusRes.json();
		} catch (e) {
			console.error('Load error:', e);
		}
	}

	async function generateToken() {
		try {
			const res = await fetch(apiUrl('/api/tokens'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ttl: newTokenTtl,
					comment: newTokenComment || undefined
				})
			});

			generatedToken = await res.json();
			generatedTokenUrl = publicUrl(`/view?token=${generatedToken.token}`);
			newTokenComment = ''; // Reset comment after generation
			await loadData();
		} catch (e) {
			console.error('Generate error:', e);
		}
	}

	async function revokeToken(token: string) {
		try {
			await fetch(apiUrl('/api/tokens'), {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token })
			});

			await loadData();
		} catch (e) {
			console.error('Revoke error:', e);
		}
	}

	async function copyLink(token: string) {
		const url = publicUrl(`/view?token=${token}`);

		// Try modern clipboard API first
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(url)
				.then(() => {
					copied = true;
					setTimeout(() => copied = false, 2000);
				})
				.catch(() => {
					// Fallback to old method if clipboard API fails
					fallbackCopy(url);
				});
		} else {
			// Fallback for non-secure contexts or older browsers
			fallbackCopy(url);
		}
	}

	function fallbackCopy(text: string) {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.left = '-999999px';
		textarea.style.top = '-999999px';
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();

		try {
			document.execCommand('copy');
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}

		document.body.removeChild(textarea);
	}

	function formatTime(expiresAt: number): string {
		const remaining = expiresAt - Date.now();
		if (remaining <= 0) return 'Истёк';

		const hours = Math.floor(remaining / (1000 * 60 * 60));
		const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

		if (hours > 0) return `${hours}ч ${minutes}мин`;
		return `${minutes}мин`;
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString('ru-RU');
	}

	$effect(() => {
		newTokenTtl = validateTtl(newTokenTtl);
	});

	onMount(async () => {
		// Загружаем данные сразу (basePath уже есть в $page.data)
		await loadData();

		// Обновление статуса каждые 5 секунд
		const interval = setInterval(loadData, 5000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>Админ-панель | Klipper Print Share</title>
</svelte:head>

<div class="min-h-screen bg-surface-50-950 p-6">
	<div class="max-w-6xl mx-auto">
		<!-- Header -->
		<header class="mb-8">
			<h1 class="text-3xl font-bold text-surface-950-50">Klipper Print Share</h1>
			<p class="text-surface-500 mt-2">Панель управления временными ссылками</p>
		</header>

		{#if loading}
			<div class="flex justify-center py-12">
				<div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
			</div>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Статус принтера -->
				<div class="lg:col-span-1">
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">Статус принтера</h2>

						{#if status}
							<div class="space-y-4">
								<div>
									<span class="text-surface-500 text-sm">Состояние</span>
									<div class="flex items-center gap-2 mt-1">
										<span class="w-3 h-3 rounded-full {status.state === 'printing' ? 'bg-green-500 animate-pulse' : status.state === 'paused' ? 'bg-yellow-500' : 'bg-gray-500'}"></span>
										<span class="font-medium capitalize">{status.state}</span>
									</div>
								</div>

								{#if status.filename}
									<div>
										<span class="text-surface-500 text-sm">Файл</span>
										<p class="font-mono text-sm truncate mt-1">{status.filename}</p>
									</div>
								{/if}

								<div>
									<span class="text-surface-500 text-sm">Прогресс</span>
									<div class="mt-1">
										<div class="h-2 bg-surface-200-800 rounded-full overflow-hidden">
											<div class="h-full bg-primary-500 transition-all" style="width: {status.progress}%"></div>
										</div>
										<span class="text-sm mt-1 block">{status.progress.toFixed(1)}%</span>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-4">
									<div>
										<span class="text-surface-500 text-sm">Сопло</span>
										<p class="font-mono">
											<span class="text-orange-500">{status.extruder_temp}</span>
											<span class="text-surface-500">/ {status.extruder_target}°C</span>
										</p>
									</div>
									<div>
										<span class="text-surface-500 text-sm">Стол</span>
										<p class="font-mono">
											<span class="text-blue-500">{status.bed_temp}</span>
											<span class="text-surface-500">/ {status.bed_target}°C</span>
										</p>
									</div>
								</div>
							</div>
						{:else}
							<p class="text-surface-500">Нет данных</p>
						{/if}

						<a href={apiUrl('/admin/settings')} class="mt-4 block text-sm text-primary-500 hover:underline">
							Настройки подключения →
						</a>
					</div>
				</div>

				<!-- Генерация ссылки -->
				<div class="lg:col-span-2">
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">Создать временную ссылку</h2>

						<div class="flex flex-wrap gap-2 mb-4">
							{#each ttlOptions as opt}
								<button
									class="px-4 py-2 rounded-lg border transition-colors {newTokenTtl === opt.value ? 'bg-primary-500 text-white border-primary-500' : 'border-surface-300-700 hover:border-primary-500'}"
									onclick={() => newTokenTtl = opt.value}
								>
									{opt.label}
								</button>
							{/each}
						</div>

						<div class="space-y-4 mb-6">
							<div>
								<label for="comment-input" class="block text-sm text-surface-500 mb-2">
									Комментарий (опционально)
								</label>
								<input
									id="comment-input"
									type="text"
									bind:value={newTokenComment}
									class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950"
									placeholder="Например: Заказ Иванова - бенчерг"
								/>
							</div>

							<div class="flex gap-2">
								<input
									type="number"
									step="5"
									min="1"
									max="43200"
									bind:value={newTokenTtl}
									class="flex-1 px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950"
									placeholder="Произвольное время (мин)"
								/>
								<button
									class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
									onclick={generateToken}
								>
									Создать ссылку
								</button>
							</div>
							{#if validationMessage}
								<div class="text-sm text-orange-500 mt-1">
									{validationMessage}
								</div>
							{/if}
						</div>

						{#if generatedToken}
							<div class="bg-surface-50-950 rounded-lg p-6 border border-primary-500">
								<p class="text-sm text-surface-500 mb-4">Ссылка создана:</p>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div>
										<div class="flex items-center gap-2 mb-2">
											<code class="flex-1 px-3 py-2 bg-surface-200-800 rounded text-sm break-all">
												{generatedTokenUrl}
											</code>
											<button
												class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
												onclick={() => { if (generatedToken) copyLink(generatedToken.token); }}
											>
												{copied ? '✓' : 'Копировать'}
											</button>
										</div>
										{#if generatedToken.comment}
											<p class="text-sm text-surface-600 mt-2">
												<strong>Комментарий:</strong> {generatedToken.comment}
											</p>
										{/if}
										<p class="text-sm text-surface-500 mt-2">
											Действует до: {formatDate(generatedToken.expires_at)}
										</p>
									</div>
									<div class="flex flex-col items-center justify-center">
										<p class="text-sm text-surface-500 mb-2 text-center">QR-код для сканирования:</p>
										<QRCode
											text={generatedTokenUrl}
											size={200}
										/>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Список активных ссылок -->
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800 mt-6">
						<h2 class="text-lg font-semibold mb-4">Активные ссылки ({tokens.length})</h2>

						{#if tokens.length === 0}
							<p class="text-surface-500 text-center py-8">Нет активных ссылок</p>
						{:else}
							<div class="space-y-3">
								{#each tokens as t}
									<div class="flex items-center justify-between p-3 bg-surface-50-950 rounded-lg border border-surface-200-800">
										<div class="flex-1 min-w-0">
											<code class="text-sm font-mono">{t.token.slice(0, 8)}...</code>
											{#if t.comment}
												<div class="text-sm text-surface-600 mt-1 truncate">
													{t.comment}
												</div>
											{/if}
											<div class="text-sm text-surface-500 mt-1">
												Осталось: {formatTime(t.expires_at)}
											</div>
										</div>
										<div class="flex gap-2">
											<button
												class="px-3 py-1 text-sm bg-primary-500/10 text-primary-500 rounded hover:bg-primary-500/20 transition-colors"
												onclick={() => copyLink(t.token)}
											>
												Копировать
											</button>
											<button
												class="px-3 py-1 text-sm bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors"
												onclick={() => revokeToken(t.token)}
											>
												Отозвать
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
