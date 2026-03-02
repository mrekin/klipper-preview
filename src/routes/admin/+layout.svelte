<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import PrinterModal from '$lib/components/PrinterModal.svelte';
	import { _ as locales } from 'svelte-i18n';

	interface Printer {
		id: number;
		name: string;
		moonraker_url: string;
		created_at: number;
		is_default: boolean;
	}

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let printers = $state<Printer[]>([]);
	let loading = $state(true);
	let showPrinterModal = $state(false);
	let editingPrinter = $state<Printer | null>(null);
	let saving = $state(false);
	let error = $state('');

	// Get printer_id from URL - used for highlighting active printer
	let urlPrinterId = $derived.by(() =>
		page.url.searchParams.get('printer')
			? parseInt(page.url.searchParams.get('printer')!)
			: null
	);

	async function loadPrinters() {
		try {
			const res = await fetch('/api/admin/printers');
			if (res.ok) {
				printers = await res.json();
				loading = false;
			}
		} catch (e) {
			console.error('Error loading printers:', e);
			loading = false;
		}
	}

	// Select printer and navigate to it
	function selectPrinter(printerId: number) {
		goto(`/admin?printer=${printerId}`, { keepFocus: true, noScroll: true });
	}

	// Open modal for creating printer
	function openCreatePrinterModal() {
		editingPrinter = null;
		showPrinterModal = true;
	}

	// Save printer
	async function savePrinter(data: {
		name: string;
		moonraker_url: string;
		is_default: boolean;
	}) {
		saving = true;
		error = '';
		try {
			const url = editingPrinter ? `/api/admin/printers/${editingPrinter.id}` : '/api/admin/printers';
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

			const newPrinter = await res.json();
			showPrinterModal = false;
			await loadPrinters();

			// Dispatch custom event to notify other components
			window.dispatchEvent(new CustomEvent('printersUpdated'));

			// Redirect to the new printer if creating
			if (!editingPrinter) {
				goto(`/admin?printer=${newPrinter.id}`, { replaceState: true });
			}
		} catch (e: any) {
			error = e.message || $locales('layout.savePrinterError');
			console.error('Save printer error:', e);
		} finally {
			saving = false;
		}
	}

	loadPrinters();
</script>

<svelte:head>
	<title>{$locales('layout.title')} - Admin</title>
</svelte:head>

<div class="min-h-screen bg-surface-50-950 flex">
	{#if loading}
		<div class="flex items-center justify-center w-full">
			<div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
		</div>
	{:else if printers.length === 0}
		<div class="flex items-center justify-center w-full">
			<div class="text-center max-w-md">
				<h2 class="text-2xl font-bold text-surface-950-50 mb-2">
					{$locales('layout.welcome')}
				</h2>
				<p class="text-surface-500 mb-6">
					{$locales('layout.addFirstPrinter')}
				</p>
				<button
					class="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
					onclick={openCreatePrinterModal}
				>
					{$locales('layout.addFirstPrinterBtn')}
				</button>
			</div>
		</div>
	{:else}
		<!-- Sidebar -->
		<aside
			class="w-64 bg-surface-100-900 border-r border-surface-200-800 p-4 flex-shrink-0 overflow-y-auto"
		>
			<div class="mb-6">
				<h1 class="text-xl font-bold text-surface-950-50">{$locales('layout.title')}</h1>
				<p class="text-sm text-surface-500 mt-1">{$locales('layout.subtitle')}</p>
			</div>

			<nav class="space-y-2">
				<p class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">{$locales('layout.printers')}</p>
				{#each printers as printer}
					<button
						class="w-full text-left px-3 py-2 rounded-lg transition-colors {urlPrinterId === printer.id
							? 'bg-primary-500 text-white font-semibold border-l-4 border-primary-600'
							: 'hover:bg-surface-200-800'}"
						onclick={() => selectPrinter(printer.id)}
					>
						<div class="flex items-center justify-between">
							<span class="truncate">{printer.name}</span>
							{#if printer.is_default}
								<span class="text-xs opacity-75" title={$locales('layout.defaultPrinter')}>★</span>
							{/if}
						</div>
					</button>
				{/each}
				<button
					class="w-full text-left px-3 py-2 rounded-lg border border-dashed border-surface-300-700 hover:border-primary-500 hover:bg-primary-500/5 transition-colors text-surface-500 hover:text-primary-500"
					onclick={openCreatePrinterModal}
				>
					{$locales('layout.addPrinter')}
				</button>
			</nav>

			<div class="mt-6 pt-6 border-t border-surface-200-800">
				<a
					href="/admin/settings"
					class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-200-800 transition-colors text-surface-600 hover:text-surface-950-50"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						></path>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						></path>
					</svg>
					<span>{$locales('layout.settings')}</span>
				</a>
			</div>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-auto">
			{@render children()}
		</main>
	{/if}

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
</div>
