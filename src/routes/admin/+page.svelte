<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import QRCode from '$lib/components/QRCode.svelte';
	import { _, locale } from 'svelte-i18n';
	import {
		formatDate as formatDateString,
		formatTimeRemaining,
		getTTLLabel
	} from '$lib/i18n/formatters';
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
		printer_id: number | null;
		printer_name?: string;
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

	interface Printer {
		id: number;
		name: string;
		moonraker_url: string;
		created_at: number;
		is_default: boolean;
	}

	let printers = $state<Printer[]>([]);
	let tokens = $state<Token[]>([]);
	let status = $state<PrinterStatus | null>(null);
	let loading = $state(false);
	let newTokenTtl = $state(60);
	let newTokenComment = $state('');
	let generatedToken = $state<Token | null>(null);
	let generatedTokenUrl = $state('');
	let copied = $state(false);
	let validationMessage = $state('');
	let initialized = $state(false);

	// Current locale for formatters
	let currentLocale = $derived($locale || 'en');

	// Get base path from layout data
	let basePath = $derived.by(() => page.data.basePath || '');

	// Helper to build API URLs with base path
	function apiUrl(path: string): string {
		return basePath + path;
	}

	// Helper to build public URLs with base path
	// Cache the value to avoid recalculating on every render
	let cachedPublicUrl = $state<string | null>(null);

	function publicUrl(path: string): string {
		if (typeof window === 'undefined') return path;
		const cleanPath = path.startsWith('/') ? path : '/' + path;

		// Priority 1: Window cache (most up-to-date after settings change)
		const windowPublicUrl = (window as any).__PUBLIC_URL__;
		if (windowPublicUrl) {
			return windowPublicUrl + cleanPath;
		}

		// Priority 2: Layout data (may be stale until reload)
		const publicUrlSetting = cachedPublicUrl || (page.data.publicUrl as string) || '';
		if (publicUrlSetting) {
			return publicUrlSetting + cleanPath;
		}

		// Priority 3: Fallback to current origin
		return window.location.origin + basePath + cleanPath;
	}

	// Update cache when page data changes
	$effect(() => {
		cachedPublicUrl = (page.data.publicUrl as string) || null;
	});

	// Derive selected printer from URL (source of truth!)
	let selectedPrinterId = $derived.by(() =>
		page.url.searchParams.get('printer')
			? parseInt(page.url.searchParams.get('printer')!)
			: null
	);

	// TTL options - will be dynamically generated based on locale
	const ttlOptionValues = [30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
	let ttlOptions = $derived.by(() => ttlOptionValues.map(value => ({ value, label: getTTLLabel(value, currentLocale) })));

	function validateTtl(value: number): number {
		if (value < 1) {
			validationMessage = $_('admin.validationMin');
			return 1;
		}
		if (value > 43200) {
			validationMessage = $_('admin.validationMax');
			return 43200;
		}
		validationMessage = '';
		return value;
	}

	async function loadPrinters() {
		try {
			const res = await fetch(apiUrl('/api/printers'));
			if (res.ok) {
				printers = await res.json();
				initialized = true;
			}
		} catch (e) {
			console.error('[Admin] Error loading printers:', e);
		}
	}

	async function loadData() {
		if (selectedPrinterId === null) return;

		try {
			const [tokensRes, statusRes] = await Promise.all([
				fetch(apiUrl(`/api/tokens?printer_id=${selectedPrinterId}`)),
				fetch(apiUrl(`/api/admin/status?printer_id=${selectedPrinterId}`))
			]);

			tokens = await tokensRes.json();
			status = await statusRes.json();
		} catch (e) {
			console.error('Load error:', e);
		}
	}

	async function generateToken() {
		const printerId = selectedPrinterId;
		if (printerId === null) return;

		try {
			const res = await fetch(apiUrl('/api/tokens'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ttl: newTokenTtl,
					comment: newTokenComment || undefined,
					printer_id: printerId
				})
			});

			generatedToken = await res.json();
			generatedTokenUrl = publicUrl(`/view?token=${generatedToken.token}`);
			newTokenComment = '';
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

		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard
				.writeText(url)
				.then(() => {
					copied = true;
					setTimeout(() => (copied = false), 2000);
				})
				.catch(() => {
					fallbackCopy(url);
				});
		} else {
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
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}

		document.body.removeChild(textarea);
	}

	function formatDate(timestamp: number): string {
		return formatDateString(timestamp);
	}

	// Load data when selectedPrinterId changes (reacts to URL changes)
	$effect(async () => {
		const printerId = selectedPrinterId;
		if (printerId !== null && initialized) {
			await loadData();
		}
	});

	// Validate TTL reactively
	$effect(() => {
		newTokenTtl = validateTtl(newTokenTtl);
	});

	// Reset QR form when printer changes
	$effect(() => {
		const printerId = selectedPrinterId;
		if (printerId !== null) {
			generatedToken = null;
			generatedTokenUrl = '';
			newTokenComment = '';
			newTokenTtl = 60;
		}
	});

	// Handle initial load without printer in URL
	$effect(async () => {
		if (!initialized) {
			await loadPrinters();

			// If no printer in URL, redirect to default or first printer
			if (selectedPrinterId === null && printers.length > 0) {
				const defaultPrinter = printers.find((p) => p.is_default) || printers[0];
				if (defaultPrinter) {
					goto(`/admin?printer=${defaultPrinter.id}`, { replaceState: true });
				}
			}
		}
	});

	// Listen for printers updated event from other components
	$effect(() => {
		const handler = () => {
			loadPrinters();
		};

		window.addEventListener('printersUpdated', handler);

		return () => {
			window.removeEventListener('printersUpdated', handler);
		};
	});
</script>

<svelte:head>
	<title>{$_('admin.title')} | {$_('app.name')}</title>
</svelte:head>

<div class="p-6">
	<!-- Debug info -->
	{#if import.meta.env.DEV}
		<div class="mb-4 p-2 bg-gray-100 text-xs font-mono">
			DEBUG: initialized={initialized}, printers={printers.length}, selectedPrinterId={selectedPrinterId}
		</div>
	{/if}

	{#if selectedPrinterId !== null}
		<div class="max-w-6xl mx-auto">
			<!-- Header -->
			<header class="mb-8">
				{#if printers.length > 0}
					{#each printers as p}
						{#if p.id === selectedPrinterId}
							<h1 class="text-3xl font-bold text-surface-950-50">{p.name}</h1>
						{/if}
					{/each}
				{/if}
				<p class="text-surface-500 mt-2">{$_('admin.subtitle')}</p>
			</header>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Статус принтера -->
				<div class="lg:col-span-1">
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">{$_('admin.printerStatus')}</h2>

						{#if status}
							<div class="space-y-4">
								<div>
									<span class="text-surface-500 text-sm">{$_('admin.state')}</span>
									<div class="flex items-center gap-2 mt-1">
										<span
											class="w-3 h-3 rounded-full {status.state === 'printing'
												? 'bg-green-500 animate-pulse'
												: status.state === 'paused'
													? 'bg-yellow-500'
													: 'bg-gray-500'}"
										></span>
										<span class="font-medium capitalize">{status.state}</span>
									</div>
								</div>

								{#if status.filename}
									<div>
										<span class="text-surface-500 text-sm">{$_('admin.file')}</span>
										<p class="font-mono text-sm truncate mt-1">{status.filename}</p>
									</div>
								{/if}

								<div>
									<span class="text-surface-500 text-sm">{$_('admin.progress')}</span>
									<div class="mt-1">
										<div class="h-2 bg-surface-200-800 rounded-full overflow-hidden">
											<div class="h-full bg-primary-500 transition-all" style="width: {status.progress}%"></div>
										</div>
										<span class="text-sm mt-1 block">{status.progress.toFixed(1)}%</span>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-4">
									<div>
										<span class="text-surface-500 text-sm">{$_('admin.nozzle')}</span>
										<p class="font-mono">
											<span class="text-orange-500">{status.extruder_temp}</span>
											<span class="text-surface-500">/ {status.extruder_target}°C</span>
										</p>
									</div>
									<div>
										<span class="text-surface-500 text-sm">{$_('admin.bed')}</span>
										<p class="font-mono">
											<span class="text-blue-500">{status.bed_temp}</span>
											<span class="text-surface-500">/ {status.bed_target}°C</span>
										</p>
									</div>
								</div>
							</div>
						{:else}
							<p class="text-surface-500">{$_('admin.noData')}</p>
						{/if}
					</div>
				</div>

				<!-- Генерация ссылки -->
				<div class="lg:col-span-2">
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800">
						<h2 class="text-lg font-semibold mb-4">{$_('admin.createLink')}</h2>

						<div class="flex flex-wrap gap-2 mb-4">
							{#each ttlOptions as opt}
								<button
									class="px-4 py-2 rounded-lg border transition-colors {newTokenTtl === opt.value
										? 'bg-primary-500 text-white border-primary-500'
										: 'border-surface-300-700 hover:border-primary-500'}"
									onclick={() => (newTokenTtl = opt.value)}
								>
									{opt.label}
								</button>
							{/each}
						</div>

						<div class="space-y-4 mb-6">
							<div>
								<label for="comment-input" class="block text-sm text-surface-500 mb-2">
									{$_('admin.commentOptional')}
								</label>
								<input
									id="comment-input"
									type="text"
									bind:value={newTokenComment}
									class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950"
									placeholder={$_('admin.commentPlaceholder')}
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
									placeholder={$_('admin.customTime')}
								/>
								<button
									class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
									onclick={generateToken}
								>
									{$_('admin.createLinkBtn')}
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
								<p class="text-sm text-surface-500 mb-4">{$_('admin.linkCreated')}</p>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div>
										<div class="flex items-center gap-2 mb-2">
											<code class="flex-1 px-3 py-2 bg-surface-200-800 rounded text-sm break-all">
												{generatedTokenUrl}
											</code>
											<button
												class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
												onclick={() => {
													if (generatedToken) copyLink(generatedToken.token);
												}}
											>
												{copied ? $_('common.copied') : $_('admin.copy')}
											</button>
										</div>
										{#if generatedToken.comment}
											<p class="text-sm text-surface-600 mt-2">
												<strong>{$_('admin.comment')}:</strong> {generatedToken.comment}
											</p>
										{/if}
										<p class="text-sm text-surface-500 mt-2">
											{$_('admin.validUntil')} {formatDate(generatedToken.expires_at)}
										</p>
									</div>
									<div class="flex flex-col items-center justify-center">
										<p class="text-sm text-surface-500 mb-2 text-center">{$_('admin.qrCodeScan')}</p>
										<QRCode text={generatedTokenUrl} size={200} />
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Список активных ссылок -->
					<div class="bg-surface-100-900 rounded-xl p-6 border border-surface-200-800 mt-6">
						<h2 class="text-lg font-semibold mb-4">{$_('admin.activeLinks')} ({tokens.length})</h2>

						{#if tokens.length === 0}
							<p class="text-surface-500 text-center py-8">{$_('admin.noActiveLinks')}</p>
						{:else}
							<div class="space-y-3">
								{#each tokens as t}
									<div
										class="flex items-center justify-between p-3 bg-surface-50-950 rounded-lg border border-surface-200-800"
									>
										<div class="flex-1 min-w-0">
											<code class="text-sm font-mono">{t.token.slice(0, 8)}...</code>
											{#if t.comment}
												<div class="text-sm text-surface-600 mt-1 truncate">
													{t.comment}
												</div>
											{/if}
											<div class="text-sm text-surface-500 mt-1">
												{$_('admin.remaining')}: {formatTimeRemaining(t.expires_at, currentLocale)}
											</div>
										</div>
										<div class="flex gap-2">
											<button
												class="px-3 py-1 text-sm bg-primary-500/10 text-primary-500 rounded hover:bg-primary-500/20 transition-colors"
												onclick={() => copyLink(t.token)}
											>
												{$_('admin.copy')}
											</button>
											<button
												class="px-3 py-1 text-sm bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors"
												onclick={() => revokeToken(t.token)}
											>
												{$_('admin.revoke')}
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
