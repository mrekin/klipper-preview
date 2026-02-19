<script lang="ts">
	import { page } from '$app/stores';
	import { getBasePathUrl, getBasePath, setPublicUrl } from '$lib/config';
	import PrinterModal from '$lib/components/PrinterModal.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	interface Printer {
		id: number;
		name: string;
		moonraker_url: string;
		created_at: number;
		is_default: boolean;
		token_count?: number;
		last_error?: string | null;
		thumbnail_sizes?: string | null;
	}

	let moonrakerUrl = $state(data.moonrakerUrl || '');
	let publicUrl = $state(data.publicUrl || '');
	let printers = $state<Printer[]>([]);
	let showPrinterModal = $state(false);
	let editingPrinter = $state<Printer | null>(null);
	let showDeleteConfirm = $state(false);
	let deletingPrinter = $state<Printer | null>(null);
	let urlValidationMessage = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');

	// Health check state for each printer
	type HealthCheckStatus = 'idle' | 'checking' | 'ok' | 'error';
	let healthStatus = $state<Record<number, HealthCheckStatus>>({});

	// Get base path from layout data
	let basePath = $derived($page.data.basePath || '');

	// Cache publicUrl in window for faster access
	$effect(() => {
		if (typeof window !== 'undefined' && publicUrl) {
			(window as any).__cachedPublicUrl = publicUrl;
		}
	});

	// Helper to build API URLs with base path
	function apiUrl(path: string): string {
		return basePath + path;
	}

	// Helper function to update state safely
	function updateState(newMoonrakerUrl: string, newPublicUrl: string) {
		moonrakerUrl = newMoonrakerUrl;
		publicUrl = newPublicUrl;
	}

	// Валидация публичного URL
	function isValidPublicUrl(url: string): boolean {
		if (!url) return true; // Пустое значение - валидно (отключение)
		try {
			new URL(url);
			return url.startsWith('http://') || url.startsWith('https://');
		} catch {
			return false;
		}
	}

	function validateUrl(url: string): void {
		if (url && !isValidPublicUrl(url)) {
			urlValidationMessage = 'URL должен начинаться с http:// или https://';
		} else {
			urlValidationMessage = '';
		}
	}

	// Load printers
	async function loadPrinters() {
		try {
			const res = await fetch(apiUrl('/api/printers'));
			if (res.ok) {
				printers = await res.json();
				// Initialize health status for new printers
				printers.forEach((p) => {
					if (!(p.id in healthStatus)) {
						healthStatus[p.id] = p.last_error ? 'error' : 'idle';
					}
				});
			}
		} catch (e) {
			console.error('Error loading printers:', e);
		}
	}

	// Check printer health
	async function checkPrinterHealth(printerId: number) {
		healthStatus[printerId] = 'checking';
		try {
			const res = await fetch(apiUrl(`/api/printers/${printerId}/health`), {
				method: 'POST'
			});

			if (res.ok) {
				const data = await res.json();
				if (data.status === 'ok') {
					healthStatus[printerId] = 'ok';
					// Reload printers to get updated error state
					await loadPrinters();
				} else {
					healthStatus[printerId] = 'error';
				}
			} else {
				healthStatus[printerId] = 'error';
			}
		} catch (e) {
			console.error('Health check error:', e);
			healthStatus[printerId] = 'error';
		}

		// Auto-reset ok status after 3 seconds
		setTimeout(() => {
			if (healthStatus[printerId] === 'ok') {
				healthStatus[printerId] = 'idle';
			}
		}, 3000);
	}

	function getHealthStatusIcon(printerId: number): string {
		const status = healthStatus[printerId];
		switch (status) {
			case 'checking':
				return '⟳';
			case 'ok':
				return '✓';
			case 'error':
				return '✗';
			default:
				return 'OK';
		}
	}

	function getHealthStatusClass(printerId: number): string {
		const status = healthStatus[printerId];
		switch (status) {
			case 'checking':
				return 'animate-spin text-surface-500';
			case 'ok':
				return 'text-green-500';
			case 'error':
				return 'text-red-500';
			default:
				return 'text-surface-500 hover:text-primary-500';
		}
	}

	// Open modal for creating printer
	function openCreatePrinterModal() {
		editingPrinter = null;
		showPrinterModal = true;
	}

	// Open modal for editing printer
	function openEditPrinterModal(printer: Printer) {
		editingPrinter = printer;
		showPrinterModal = true;
	}

	// Save printer
	async function savePrinter(data: {
		name: string;
		moonraker_url: string;
		is_default: boolean;
		thumbnail_sizes?: string;
	}) {
		saving = true;
		error = '';

		try {
			const url = editingPrinter
				? apiUrl(`/api/printers/${editingPrinter.id}`)
				: apiUrl('/api/printers');
			const method = editingPrinter ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to save printer');
			}

			showPrinterModal = false;
			await loadPrinters();
			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (e: any) {
			error = e.message || 'Ошибка сохранения принтера';
			console.error('Save printer error:', e);
		} finally {
			saving = false;
		}
	}

	// Open delete confirmation
	async function openDeleteConfirm(printer: Printer) {
		// Get token count
		try {
			const res = await fetch(apiUrl(`/api/tokens?printer_id=${printer.id}`));
			if (res.ok) {
				const tokens = await res.json();
				deletingPrinter = { ...printer, token_count: tokens.length };
				showDeleteConfirm = true;
			}
		} catch (e) {
			console.error('Error getting token count:', e);
		}
	}

	// Delete printer
	async function deletePrinter() {
		if (!deletingPrinter) return;

		saving = true;
		error = '';

		try {
			const res = await fetch(apiUrl(`/api/printers/${deletingPrinter.id}?confirm=true`), {
				method: 'DELETE'
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to delete printer');
			}

			showDeleteConfirm = false;
			deletingPrinter = null;
			await loadPrinters();

			// Dispatch custom event to notify other components
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('printersUpdated'));
			}

			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (e: any) {
			error = e.message || 'Ошибка удаления принтера';
			console.error('Delete printer error:', e);
		} finally {
			saving = false;
		}
	}

	// Реактивная валидация публичного URL
	$effect(() => {
		validateUrl(publicUrl);
	});

	async function save() {
		if (urlValidationMessage) {
			error = 'Исправьте ошибки перед сохранением';
			return;
		}

		saving = true;
		error = '';
		try {
			const res = await fetch(apiUrl('/api/settings'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ moonrakerUrl, publicUrl })
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to save settings');
			}

			// Update window cache immediately for instant availability
			setPublicUrl(publicUrl);

			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (e: any) {
			error = e.message || 'Ошибка сохранения настроек';
			console.error('Save settings error:', e);
		} finally {
			saving = false;
		}
	}

	// Load printers on mount
	loadPrinters();

	// Listen for printers updated event from other components
	$effect(() => {
		const handler = () => {
			console.log('[Settings] Printers updated event received, reloading...');
			loadPrinters();
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('printersUpdated', handler);

			return () => {
				window.removeEventListener('printersUpdated', handler);
			};
		}
	});
</script>

<svelte:head>
	<title>Настройки | Klipper Print Share</title>
</svelte:head>

<div class="p-6">
	<div class="max-w-4xl mx-auto">
		<a href="/admin" class="text-primary-500 hover:underline mb-6 inline-block">
			← Назад к панели
		</a>

		<h1 class="text-2xl font-bold mb-6">Настройки</h1>

		{#if error}
			<div class="bg-red-500/10 text-red-500 px-4 py-3 rounded-lg mb-6">
				{error}
			</div>
		{/if}

		{#if saved}
			<div class="bg-green-500/10 text-green-500 px-4 py-3 rounded-lg mb-6">
				✓ Настройки сохранены!
			</div>
		{/if}

		<!-- Printers Section -->
		<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800 mb-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold">Принтеры</h2>
				<button
					class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
					onclick={openCreatePrinterModal}
				>
					+ Добавить принтер
				</button>
			</div>

			{#if printers.length === 0}
				<p class="text-surface-500 text-center py-8">Нет настроенных принтеров</p>
			{:else}
				<div class="space-y-3">
					{#each printers as printer}
						<div class="flex items-center justify-between p-4 bg-surface-50-950 rounded-lg border border-surface-200-800">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium">{printer.name}</span>
									{#if printer.is_default}
										<span class="text-xs px-2 py-1 bg-primary-500/10 text-primary-500 rounded"
											>По умолчанию</span
										>
									{/if}
								</div>
								<p class="text-sm text-surface-500 mt-1">{printer.moonraker_url}</p>
								{#if printer.last_error}
									<p class="text-xs text-red-500 mt-1">{printer.last_error}</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<button
									class="px-3 py-1 text-sm bg-surface-200-800 rounded transition-colors {getHealthStatusClass(
										printer.id
									)} disabled:opacity-50"
									onclick={() => checkPrinterHealth(printer.id)}
									disabled={healthStatus[printer.id] === 'checking'}
									title="Проверить соединение"
								>
									{getHealthStatusIcon(printer.id)}
								</button>
								<button
									class="px-3 py-1 text-sm bg-surface-200-800 hover:bg-surface-300-700 rounded transition-colors"
									onclick={() => openEditPrinterModal(printer)}
								>
									Редактировать
								</button>
								<button
									class="px-3 py-1 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors"
									onclick={() => openDeleteConfirm(printer)}
								>
									Удалить
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Public URL Settings -->
		<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800 mb-6">
			<h2 class="text-lg font-semibold mb-4">Публичные ссылки</h2>

			<div class="space-y-4">
				<div>
					<label for="public-url" class="block text-sm text-surface-500 mb-2"
						>Публичный URL</label
					>
					<input
						id="public-url"
						type="text"
						bind:value={publicUrl}
						disabled={loading || saving}
						class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50"
						placeholder="https://mydomain.ru/klippershare"
					/>
					<p class="text-sm text-surface-500 mt-2">
						Полный URL, по которому пользователи будут открывать preview страницу
					</p>
					<p class="text-sm text-surface-500 mt-1">
						Если поле пустое - используется текущий адрес админки
					</p>
					<p class="text-xs text-surface-600 mt-2">
						Примеры: https://mydomain.ru/klippershare, http://192.168.1.100:8080/print
					</p>
					{#if urlValidationMessage}
						<p class="text-sm text-orange-500 mt-2">
							{urlValidationMessage}
						</p>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex justify-end">
				<button
					class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={save}
					disabled={loading || saving || urlValidationMessage !== ''}
				>
					{saving ? 'Сохранение...' : 'Сохранить настройки'}
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Printer Modal -->
{#if showPrinterModal}
	<PrinterModal
		show={showPrinterModal}
		printer={editingPrinter}
		printers={printers}
		onSave={savePrinter}
		onCancel={() => (showPrinterModal = false)}
		{saving}
	/>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && deletingPrinter}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-surface-100-900 rounded-xl p-6 max-w-md w-full border border-surface-200-800">
			<h2 class="text-xl font-bold mb-4">Удалить принтер?</h2>

			<p class="text-surface-600 mb-4">
				Вы уверены, что хотите удалить принтер <strong>"{deletingPrinter.name}"</strong>?
			</p>

			{#if (deletingPrinter.token_count || 0) > 0}
				<p class="text-orange-500 mb-4">
					Это также удалит {deletingPrinter.token_count} связанных токенов.
				</p>
			{/if}

			<div class="flex gap-3">
				<button
					class="flex-1 px-4 py-2 bg-surface-200-800 hover:bg-surface-300-700 rounded-lg transition-colors"
					onclick={() => (showDeleteConfirm = false)}
					disabled={saving}
				>
					Отмена
				</button>
				<button
					class="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
					onclick={deletePrinter}
					disabled={saving}
				>
					{saving ? 'Удаление...' : 'Удалить'}
				</button>
			</div>
		</div>
	</div>
{/if}
