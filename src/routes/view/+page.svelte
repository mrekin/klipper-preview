<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { getBasePathUrl, getBasePath } from '$lib/config';
	import GCodeViewer from '$lib/components/GCodeViewer.svelte';

	interface TokenData {
		token: string;
		created_at: number;
		expires_at: number;
	}

	interface PrinterStatus {
		state: string;
		filename: string;
		progress: number;
		print_duration: number;
		estimated_time: number;
		extruder_temp: number;
		extruder_target: number;
		bed_temp: number;
		bed_target: number;
		current_layer: number;
		total_layers: number;
		position: { x: number; y: number; z: number };
		file_position: number;
	}

	let status: PrinterStatus | null = $state(null);
	let gcodeLines: Array<{ line: string; filePosition: number }> = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let token: string = $derived($page.url.searchParams.get('token') || '');
	let tokenData: TokenData | null = $state(null);
	let loadedFilename: string | null = $state(null);
	let thumbnailVisible = $state(true);
	let thumbnailError = $state(false);

	let updateInterval: ReturnType<typeof setInterval> | undefined = undefined;

	let currentFilename = $derived.by(() => status?.filename ?? null);

	// Get base path from layout data
	let basePath = $derived($page.data.basePath || '');

	// Get thumbnail URL
	let thumbnailUrl = $derived.by(() => {
		if (!status?.filename || !thumbnailVisible || thumbnailError) {
			return '';
		}
		const filename = encodeURIComponent(status.filename);
		return apiUrl(`/api/thumbnail/${token}?filename=${filename}`);
	});

	// Handle thumbnail error
	function handleThumbnailError() {
		thumbnailError = true;
		thumbnailVisible = false;
	}

	// Helper to build API URLs with base path
	function apiUrl(path: string): string {
		return basePath + path;
	}

	async function loadStatus() {
		if (!token) {
			error = 'Токен не указан';
			loading = false;
			return;
		}

		try {
			const res = await fetch(apiUrl(`/api/status?token=${token}`));

			if (!res.ok) {
				if (res.status === 403) {
					error = 'Ссылка недействительна или истёк срок действия';
				} else {
					error = 'Ошибка загрузки данных';
				}
				return;
			}

			status = await res.json();
		} catch (e) {
			console.error('Status load error:', e);
		}
	}

	async function loadGcode(filename: string) {
		if (loadedFilename === filename) {
			return;
		}

		try {
			const res = await fetch(apiUrl(`/api/gcode/${token}?file=${encodeURIComponent(filename)}`));

			if (res.ok) {
				const data = await res.json();
				gcodeLines = data.lines || [];
				loadedFilename = filename;
			} else {
				console.error('[GCODE] Error response:', res.status, await res.text().catch(() => ''));
			}
		} catch (e) {
			console.error('G-code load error:', e);
		}
	}

	function formatDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);

		if (h > 0) {
			return `${h}ч ${m}мин ${s}сек`;
		}
		return `${m}мин ${s}сек`;
	}

	function formatETA(seconds: number): string {
		if (seconds <= 0) return '—';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);

		if (h > 0) return `~${h}ч ${m}мин`;
		return `~${m}мин`;
	}

	function formatTimeRemaining(expiresAt: number): string {
		const remaining = expiresAt - Date.now();
		if (remaining <= 0) return 'Истёк';
		const h = Math.floor(remaining / (1000 * 60 * 60));
		const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
		if (h > 0) return `${h}ч ${m}мин`;
		return `${m}мин`;
	}

	function calculatePrintETA(status: PrinterStatus): string {
		// Рассчитываем на основе прогресса
		if (status.progress > 0 && status.print_duration > 0) {
			// Рассчитываем среднее время на 1% прогресса
			const timePerPercent = status.print_duration / status.progress;
			// Оставшееся время = время на 1% * оставшиеся %
			const remaining = timePerPercent * (100 - status.progress);
			return formatETA(remaining);
		}

		return '—';
	}

	$effect(() => {
		if (currentFilename) {
			// Reset thumbnail error when file changes
			if (currentFilename !== loadedFilename) {
				thumbnailError = false;
				thumbnailVisible = true;
			}
			loadGcode(currentFilename);
		}
	});

	// Запускаем только в браузере
	if (browser) {
		(async () => {
			// Проверяем наличие токена
			if (!token) {
				error = 'Токен не указан';
				loading = false;
				return;
			}

			// Загружаем информацию о токене
			try {
				const res = await fetch(apiUrl(`/api/token/${token}?noCache=true`));
				if (res.ok) {
					tokenData = await res.json();
				}
			} catch (e) {
				console.error('Token info load error:', e);
			}

			await loadStatus();
			loading = false;

			// Обновление каждые 2 секунды
			updateInterval = setInterval(loadStatus, 2000);
		})();
	}
</script>

<svelte:head>
	<title>Статус печати | Klipper Print Share</title>
</svelte:head>

<div class="min-h-screen bg-surface-50-950">
	{#if loading}
		<div class="flex items-center justify-center min-h-screen">
			<div class="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full"></div>
		</div>
	{:else if error}
		<div class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md p-8">
				<div class="text-6xl mb-4">🔒</div>
				<h1 class="text-2xl font-bold mb-2">{error}</h1>
				<p class="text-surface-500">Свяжитесь с оператором для получения новой ссылки</p>
			</div>
		</div>
	{:else if status}
		<div class="container mx-auto p-4 lg:p-6">
			<!-- Header -->
			<header class="mb-6">
				<div class="flex items-center gap-3 mb-2">
					<span class="w-3 h-3 rounded-full {status.state === 'printing' ? 'bg-green-500 animate-pulse' : status.state === 'paused' ? 'bg-yellow-500' : status.state === 'complete' ? 'bg-blue-500' : 'bg-gray-500'}"></span>
					<h1 class="text-2xl font-bold capitalize">
						{status.state === 'printing' ? 'Печатается' : status.state === 'paused' ? 'На паузе' : status.state === 'complete' ? 'Завершено' : status.state}
					</h1>
				</div>
				{#if status.filename}
					<p class="text-surface-400 font-mono text-sm">{status.filename}</p>
				{/if}
			</header>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Left: Info cards -->
				<div class="space-y-4">
					<!-- Progress -->
					<div class="bg-surface-100-900 rounded-xl p-5 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">Прогресс</h2>

						<!-- Thumbnail image -->
						{#if thumbnailVisible && thumbnailUrl}
							<div class="mb-4 flex justify-center">
								<img
									src={thumbnailUrl}
									alt="Model preview"
									class="max-w-full h-auto rounded-lg border border-surface-200-800"
									style="max-width: 400px;"
									onerror={handleThumbnailError}
									loading="lazy"
								/>
							</div>
						{/if}

						<!-- Progress bar -->
						<div class="mb-4">
							<div class="flex justify-between text-sm mb-2">
								<span>Выполнено</span>
								<span class="font-mono">{status.progress.toFixed(1)}%</span>
							</div>
							<div class="h-4 bg-surface-200-800 rounded-full overflow-hidden">
								<div
									class="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
									style="width: {status.progress}%"
								></div>
							</div>
						</div>

						<!-- Layer info -->
						<div class="flex justify-between text-sm">
							<span class="text-surface-400">Слой</span>
							<span class="font-mono">{status.current_layer} / {status.total_layers || '—'}</span>
						</div>
					</div>

					<!-- Time -->
					<div class="bg-surface-100-900 rounded-xl p-5 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">Время</h2>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<p class="text-surface-400 text-sm mb-1">Прошло</p>
								<p class="text-2xl font-mono">{formatDuration(status.print_duration)}</p>
							</div>
							<div>
								<p class="text-surface-400 text-sm mb-1">Осталось</p>
								<p class="text-2xl font-mono">{calculatePrintETA(status)}</p>
							</div>
						</div>
					</div>

					<!-- Temperatures -->
					<div class="bg-surface-100-900 rounded-xl p-5 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">Температуры</h2>

						<div class="grid grid-cols-2 gap-6">
							<!-- Extruder -->
							<div>
								<div class="flex items-center gap-2 mb-2">
									<div class="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
										<span class="text-orange-500">🔥</span>
									</div>
									<span class="text-sm text-surface-400">Сопло</span>
								</div>
								<p class="text-3xl font-mono">
									<span class="text-orange-500">{Math.round(status.extruder_temp)}</span>
									<span class="text-surface-500 text-lg">/{status.extruder_target}°C</span>
								</p>
								<div class="h-1.5 bg-surface-200-800 rounded-full mt-2 overflow-hidden">
									<div
										class="h-full bg-orange-500 transition-all"
										style="width: {Math.min(100, (status.extruder_temp / status.extruder_target) * 100)}%"
									></div>
								</div>
							</div>

							<!-- Bed -->
							<div>
								<div class="flex items-center gap-2 mb-2">
									<div class="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
										<span class="text-blue-500">📦</span>
									</div>
									<span class="text-sm text-surface-400">Стол</span>
								</div>
								<p class="text-3xl font-mono">
									<span class="text-blue-500">{Math.round(status.bed_temp)}</span>
									<span class="text-surface-500 text-lg">/{status.bed_target}°C</span>
								</p>
								<div class="h-1.5 bg-surface-200-800 rounded-full mt-2 overflow-hidden">
									<div
										class="h-full bg-blue-500 transition-all"
										style="width: {Math.min(100, (status.bed_temp / status.bed_target) * 100)}%"
									></div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Right: G-code viewer -->
				<div class="bg-surface-100-900 rounded-xl border border-surface-200-800 overflow-hidden">
					<div class="p-4 border-b border-surface-200-800">
						<h2 class="text-lg font-semibold">Визуализация</h2>
						<p class="text-sm text-surface-400">Превью G-code</p>
					</div>
					<div class="h-[400px] lg:h-[500px]">
						{#if gcodeLines.length > 0}
							<GCodeViewer
								gcodeLines={gcodeLines}
								currentLayer={status.current_layer}
								totalLayers={status.total_layers}
								nozzlePosition={status.position || { x: 0, y: 0, z: 0 }}
								filePosition={status.file_position || 0}
							/>
						{:else}
							<div class="flex items-center justify-center h-full text-surface-400">
								<div class="text-center">
									<div class="text-4xl mb-2">📐</div>
									<p>Загрузка G-code...</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<footer class="mt-8 text-center text-sm text-surface-500">
				{#if tokenData}
					<p>Действует {formatTimeRemaining(tokenData.expires_at)}</p>
				{:else}
					<p>Ссылка недействительна</p>
				{/if}
			</footer>
		</div>
	{/if}
</div>
