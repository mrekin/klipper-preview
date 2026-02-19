<script lang="ts">
	interface Printer {
		id: number;
		name: string;
		moonraker_url: string;
		created_at: number;
		is_default: boolean;
		last_error: string | null;
		thumbnail_sizes?: string | null;
	}

	interface Props {
		show: boolean;
		printer?: Printer | null;
		printers?: Printer[];
		onSave: (data: { name: string; moonraker_url: string; is_default: boolean; thumbnail_sizes?: string }) => Promise<void>;
		onCancel: () => void;
		saving?: boolean;
	}

	let { show, printer, printers = [], onSave, onCancel, saving = false }: Props = $props();

	let printerName = $state('');
	let printerMoonrakerUrl = $state('');
	let printerIsDefault = $state(false);
	let printerThumbnailSizes = $state('');
	let error = $state('');

	// Initialize form when printer changes
	$effect(() => {
		if (printer) {
			printerName = printer.name;
			printerMoonrakerUrl = printer.moonraker_url;
			printerIsDefault = printer.is_default;
			printerThumbnailSizes = printer.thumbnail_sizes || '';
		} else {
			printerName = '';
			printerMoonrakerUrl = '';
			printerThumbnailSizes = '';
			// Auto-default for first printer
			printerIsDefault = printers.length === 0;
		}
	});

	// Validate URL
	$effect(() => {
		if (printerMoonrakerUrl && !printerMoonrakerUrl.startsWith('http')) {
			error = 'URL должен начинаться с http:// или https://';
		} else {
			error = '';
		}
	});

	async function handleSubmit() {
		if (!printerName.trim() || !printerMoonrakerUrl.trim()) {
			error = 'Заполните все поля';
			return;
		}
		if (error) return;

		await onSave({
			name: printerName.trim(),
			moonraker_url: printerMoonrakerUrl.trim(),
			is_default: printerIsDefault,
			thumbnail_sizes: printerThumbnailSizes.trim() || undefined
		});
	}
</script>

{#if show}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-surface-100-900 rounded-xl p-6 max-w-md w-full border border-surface-200-800">
			<h2 class="text-xl font-bold mb-4">
				{printer
					? 'Редактировать принтер'
					: printers.length === 0
						? 'Добавить первый принтер'
						: 'Добавить принтер'}
			</h2>

			{#if error}
				<div class="bg-red-500/10 text-red-500 px-4 py-3 rounded-lg mb-4">
					{error}
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label for="printer-name" class="block text-sm text-surface-500 mb-2">
						Имя принтера
					</label>
					<input
						id="printer-name"
						type="text"
						bind:value={printerName}
						disabled={saving}
						class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50"
						placeholder="Ender 3, Voron 2.4..."
						autofocus
					/>
				</div>

				<div>
					<label for="printer-moonraker" class="block text-sm text-surface-500 mb-2">
						URL Moonraker
					</label>
					<input
						id="printer-moonraker"
						type="text"
						bind:value={printerMoonrakerUrl}
						disabled={saving}
						class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50"
						placeholder="http://192.168.1.XXX:7125"
					/>
				</div>

				<div class="flex items-center gap-2">
					<input
						id="printer-default"
						type="checkbox"
						bind:checked={printerIsDefault}
						disabled={saving}
						class="w-4 h-4 rounded border-surface-300-700"
					/>
					<label for="printer-default" class="text-sm">
						Использовать по умолчанию
						{#if printers.length === 0}
							<span class="text-surface-500">(автоматически для первого принтера)</span>
						{/if}
					</label>
				</div>

				<div>
					<label for="thumbnail-sizes" class="block text-sm text-surface-500 mb-2">
						Размеры превью изображений
					</label>
					<input
						id="thumbnail-sizes"
						type="text"
						bind:value={printerThumbnailSizes}
						disabled={saving}
						class="w-full px-4 py-2 rounded-lg border border-surface-300-700 bg-surface-50-950 disabled:opacity-50"
						placeholder="256x256, 128x128, 64x64"
					/>
					<p class="text-xs text-surface-500 mt-2">
						Размеры thumbnails через запятую (например: 256x256, 128x128, 64x64).
						Должны совпадать с настройками вашего слайсера (Cura, PrusaSlicer и т.д.).
					</p>
					<p class="text-xs text-surface-500 mt-1">
						Если не указано, используются стандартные размеры: 256x256, 128x128, 64x64, 32x32
					</p>
				</div>

				<div class="flex gap-3 mt-6">
					<button
						type="button"
						class="flex-1 px-4 py-2 font-medium bg-surface-200-800 hover:bg-surface-300-700 rounded-lg transition-colors"
						onclick={onCancel}
						disabled={saving}
					>
						Отмена
					</button>
					<button
						type="submit"
						class="flex-1 px-4 py-2 font-semibold bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
						disabled={
							saving ||
							!printerName.trim() ||
							!printerMoonrakerUrl.trim() ||
							!!error
						}
					>
						{saving ? 'Сохранение...' : 'Сохранить'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
