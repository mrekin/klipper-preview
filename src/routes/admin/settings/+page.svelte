<script lang="ts">
	import { page } from '$app/state';
	import { getBasePath, setPublicUrl } from '$lib/config';
	import PrinterModal from '$lib/components/PrinterModal.svelte';
	import { _ as locales } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
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
	let selectedLanguage = $state(data.language || 'en');
	let defaultPage = $state(data.defaultPage || '/admin');
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
	let basePath = $derived.by(() => page.data.basePath || '');

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
			urlValidationMessage = $locales('settings.urlValidationError');
		} else {
			urlValidationMessage = '';
		}
	}

	// Check if there are any validation errors
	function hasErrors(): boolean {
		return urlValidationMessage !== '';
	}

	// Load printers
	async function loadPrinters() {
		try {
			const res = await fetch(apiUrl('/api/admin/printers'));
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
			const res = await fetch(apiUrl(`/api/admin/printers/${printerId}/health`), {
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
				? apiUrl(`/api/admin/printers/${editingPrinter.id}`)
				: apiUrl('/api/admin/printers');
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
			error = e.message || $locales('settings.savePrinterError');
			console.error('Save printer error:', e);
		} finally {
			saving = false;
		}
	}

	// Open delete confirmation
	async function openDeleteConfirm(printer: Printer) {
		// Get token count
		try {
			const res = await fetch(apiUrl(`/api/admin/tokens?printer_id=${printer.id}`));
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
			const res = await fetch(apiUrl(`/api/admin/printers/${deletingPrinter.id}?confirm=true`), {
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
			error = e.message || $locales('settings.deletePrinterError');
			console.error('Delete printer error:', e);
		} finally {
			saving = false;
		}
	}

	// Реактивная валидация публичного URL
	$effect(() => {
		validateUrl(publicUrl);
	});

	// Unified save function for all settings
	async function save() {
		if (hasErrors()) {
			error = $locales('settings.fixErrors');
			// Scroll to first error field
			const firstError = document.querySelector('[aria-invalid="true"]') as HTMLElement;
			firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			firstError?.focus();
			return;
		}

		saving = true;
		error = '';
		try {
			const res = await fetch(apiUrl('/api/admin/settings'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					moonrakerUrl,
					publicUrl,
					language: selectedLanguage,
					defaultPage
				})
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to save settings');
			}

			// Update window cache immediately for instant availability
			setPublicUrl(publicUrl);

			// Update locale
			locale.set(selectedLanguage);

			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (e: any) {
			error = e.message || $locales('settings.saveSettingsError');
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
	<title>{$locales('settings.title')} | {$locales('app.name')}</title>
</svelte:head>

<div class="p-6">
	<div class="max-w-6xl mx-auto">
		<!-- Header with back link and save button -->
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-4">
				<div>
					<a href="/admin" class="text-primary-500 hover:underline inline-block">
						{$locales('settings.backToPanel')}
					</a>
					<h1 class="text-2xl font-bold mt-2">
						{$locales('settings.title')}
						{#if saved}
							<span class="text-green-500 text-lg ml-2">✓ {$locales('settings.settingsSaved')}</span>
						{/if}
					</h1>
				</div>
			</div>
			<button
				class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={save}
				disabled={loading || saving || hasErrors()}
			>
				{saving ? $locales('settings.saving') : $locales('settings.saveAll')}
			</button>
		</div>

		<!-- Error message -->
		{#if error}
			<div class="bg-red-500/10 text-red-500 px-4 py-3 rounded-lg mb-4">
				{error}
			</div>
		{/if}

		<!-- Grid layout for settings -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
			<!-- Printers: full width -->
			<div class="lg:col-span-2 bg-surface-100-900 rounded-xl p-4 border border-surface-200-800">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-base font-semibold">{$locales('settings.printers')}</h2>
					<button
						class="px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
						onclick={openCreatePrinterModal}
					>
						{$locales('settings.addPrinter')}
					</button>
				</div>

				{#if printers.length === 0}
					<p class="text-surface-500 text-center py-6">{$locales('settings.noPrinters')}</p>
				{:else}
					<div class="space-y-2">
						{#each printers as printer}
							<div
								class="flex items-center justify-between p-3 bg-surface-50-950 rounded-lg border border-surface-200-800"
							>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium">{printer.name}</span>
										{#if printer.is_default}
											<span class="text-xs px-2 py-1 bg-primary-500/10 text-primary-500 rounded"
												>{$locales('settings.byDefault')}</span
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
										title={$locales('settings.checkConnection')}
									>
										{getHealthStatusIcon(printer.id)}
									</button>
									<button
										class="px-3 py-1 text-sm bg-surface-200-800 hover:bg-surface-300-700 rounded transition-colors"
										onclick={() => openEditPrinterModal(printer)}
									>
										{$locales('settings.edit')}
									</button>
									<button
										class="px-3 py-1 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors"
										onclick={() => openDeleteConfirm(printer)}
									>
										{$locales('settings.delete')}
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Public URL -->
			<div class="bg-surface-100-900 rounded-xl p-4 border border-surface-200-800">
				<h2 class="text-base font-semibold mb-3">{$locales('settings.publicLinks')}</h2>

				<div class="space-y-2">
					<div class="flex items-center gap-3">
						<label
							for="public-url"
							class="text-sm text-surface-500 min-w-[100px] flex-shrink-0"
							title="{$locales('settings.publicUrlHelp')} {$locales('settings.publicUrlEmptyHelp')}\n\n{$locales('settings.publicUrlExamples')}"
						>
							{$locales('settings.publicUrl')}
							<span class="text-surface-400 ml-1">ⓘ</span>
						</label>
						<input
							id="public-url"
							type="text"
							bind:value={publicUrl}
							aria-invalid={!!urlValidationMessage}
							aria-describedby={urlValidationMessage ? 'public-url-error' : undefined}
							disabled={loading || saving}
							class="flex-1 px-3 py-1.5 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50 text-sm"
							placeholder={$locales('settings.publicUrlPlaceholder')}
						/>
					</div>
					{#if urlValidationMessage}
						<p id="public-url-error" class="text-sm text-orange-500 ml-[115px]" role="alert">
							{urlValidationMessage}
						</p>
					{/if}
				</div>
			</div>

			<!-- Interface -->
			<div class="bg-surface-100-900 rounded-xl p-4 border border-surface-200-800">
				<h2 class="text-base font-semibold mb-3">{$locales('settings.interface')}</h2>

				<div class="space-y-2">
					<div class="flex items-center gap-3">
						<label
							for="default-page-select"
							class="text-sm text-surface-500 min-w-[100px] flex-shrink-0"
							title="{$locales('settings.defaultPageHelp')}"
						>
							{$locales('settings.defaultPage')}
							<span class="text-surface-400 ml-1">ⓘ</span>
						</label>
						<select
							id="default-page-select"
							bind:value={defaultPage}
							disabled={loading || saving}
							class="flex-1 px-3 py-1.5 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50 text-sm"
						>
							<option value="/admin">{$locales('settings.defaultPageAdmin')}</option>
							<option value="/view">{$locales('settings.defaultPageView')}</option>
						</select>
					</div>
					{#if defaultPage === '/view'}
						<p class="text-sm text-orange-500 ml-[115px]">
							{$locales('settings.defaultPageViewWarning')}
						</p>
					{/if}
				</div>
			</div>

			<!-- Language -->
			<div class="bg-surface-100-900 rounded-xl p-4 border border-surface-200-800">
				<h2 class="text-base font-semibold mb-3">{$locales('settings.language')}</h2>

				<div class="space-y-2">
					<div class="flex items-center gap-3">
						<label
							for="language-select"
							class="text-sm text-surface-500 min-w-[100px] flex-shrink-0"
							title="{$locales('settings.languageHint')}"
						>
							{$locales('settings.interfaceLanguage')}
							<span class="text-surface-400 ml-1">ⓘ</span>
						</label>
						<select
							id="language-select"
							bind:value={selectedLanguage}
							disabled={loading || saving}
							class="flex-1 px-3 py-1.5 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50 text-sm"
						>
							<option value="en">English</option>
							<option value="ru">Русский</option>
						</select>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom save button -->
		<div class="flex justify-end">
			<button
				class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={save}
				disabled={loading || saving || hasErrors()}
			>
				{saving ? $locales('settings.saving') : $locales('settings.saveAll')}
			</button>
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
			<h2 class="text-xl font-bold mb-4">{$locales('settings.deletePrinter')}</h2>

			<p class="text-surface-600 mb-4">
				{@html $locales('settings.deletePrinterConfirm', { name: deletingPrinter.name })}
			</p>

			{#if (deletingPrinter.token_count || 0) > 0}
				<p class="text-orange-500 mb-4">
					{@html $locales('settings.deleteTokensWarning', { count: deletingPrinter.token_count || 0 })}
				</p>
			{/if}

			<div class="flex gap-3">
				<button
					class="flex-1 px-4 py-2 bg-surface-200-800 hover:bg-surface-300-700 rounded-lg transition-colors"
					onclick={() => (showDeleteConfirm = false)}
					disabled={saving}
				>
					{$locales('common.cancel')}
				</button>
				<button
					class="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
					onclick={deletePrinter}
					disabled={saving}
				>
					{saving ? $locales('settings.saving') : $locales('common.delete')}
				</button>
			</div>
		</div>
	</div>
{/if}
