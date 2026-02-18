import { env } from '$env/dynamic/private';
import { getMoonrakerUrlSetting } from './tokens';
// Получение URL Moonraker из БД или переменной окружения
// БД имеет приоритет над переменной окружения
export function getMoonrakerUrl(): string {
	return getMoonrakerUrlSetting() || env.MOONRAKER_URL;
}


// Интерфейсы данных Moonraker
export interface PrinterStatus {
	state: 'printing' | 'paused' | 'complete' | 'error' | 'standby' | 'cancelled';
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
	layer_count: number; // Из метаданных файла
	position: { x: number; y: number; z: number };
}

// Mock-данные для тестирования
const mockStatus: PrinterStatus = {
	state: 'printing',
	filename: 'benchy_v2.gcode',
	progress: 47.5,
	print_duration: 3420, // 57 минут
	estimated_time: 7200, // 2 часа
	extruder_temp: 210,
	extruder_target: 210,
	bed_temp: 60,
	bed_target: 60,
	current_layer: 127,
	total_layers: 450,
	layer_count: 450,
	position: { x: 125.4, y: 87.2, z: 12.7 }
};

// Функция запроса статуса из Moonraker
export async function fetchPrinterStatus(): Promise<PrinterStatus> {
	try {
		const url = getMoonrakerUrl();
		console.log('[fetchPrinterStatus] Fetching from Moonraker URL:', url);

		// Запрос к Moonraker API для статуса
		const response = await fetch(
			`${url}/printer/objects/query?display_status&print_stats&heater_bed&extruder&toolhead`,
			{ signal: AbortSignal.timeout(5000) }
		);

		console.log('[fetchPrinterStatus] Response status:', response.status);

		if (!response.ok) {
			throw new Error(`Moonraker error: ${response.status}`);
		}

		const data = await response.json();
		console.log('[fetchPrinterStatus] Response data:', JSON.stringify(data).substring(0, 500));
		const result = data.result?.status;

		if (!result) {
			throw new Error('Invalid Moonraker response');
		}

		// Парсинг ответа Moonraker
		const displayStatus = result.display_status || {};
		const printStats = result.print_stats || {};
		const extruder = result.extruder || {};
		const heaterBed = result.heater_bed || {};
		const toolhead = result.toolhead || {};

		console.log('[fetchPrinterStatus] Parsed status - state:', printStats.state, 'filename:', printStats.filename);

		// Получаем метаданные текущего файла
		let layerCount = 100;
		const filename = printStats.filename || '';
		if (filename) {
			try {
				const metadataResponse = await fetch(
					`${url}/server/files/metadata?filename=${encodeURIComponent(filename)}`,
					{ signal: AbortSignal.timeout(3000) }
				);
				if (metadataResponse.ok) {
					const metadataData = await metadataResponse.json();
					layerCount = metadataData.result?.layer_count || 100;
				}
			} catch (e) {
				console.warn('Failed to fetch file metadata:', e);
			}
		}

		// Расчёт текущего слоя
		const currentLayer = Math.floor((displayStatus.progress || 0) * layerCount);

		// Получаем оценку времени печати из метаданных или используем текущее время как fallback
		let estimatedTime = printStats.estimated_time || 0;
		// Если estimated_time нет, используем total_duration из print_stats
		if (!estimatedTime) {
			estimatedTime = printStats.total_duration || 0;
		}

		return {
			state: mapState(printStats.state),
			filename: filename,
			progress: (displayStatus.progress || 0) * 100,
			print_duration: printStats.print_duration || 0,
			estimated_time: estimatedTime,
			extruder_temp: extruder.temperature || 0,
			extruder_target: extruder.target || 0,
			bed_temp: heaterBed.temperature || 0,
			bed_target: heaterBed.target || 0,
			current_layer: currentLayer,
			total_layers: layerCount,
			layer_count: layerCount,
			position: {
				x: toolhead.position?.[0] || 0,
				y: toolhead.position?.[1] || 0,
				z: toolhead.position?.[2] || 0
			}
		};
	} catch (error) {
		console.error('[fetchPrinterStatus] ERROR - returning mock data:', error);
		// Возвращаем mock-данные при ошибке
		return {
			...mockStatus,
			// Симулируем прогресс
			progress: (mockStatus.progress + Math.random() * 0.5) % 100,
			current_layer: Math.floor(mockStatus.current_layer + Math.random() * 2)
		};
	}
}

function mapState(state: string): PrinterStatus['state'] {
	const stateMap: Record<string, PrinterStatus['state']> = {
		'printing': 'printing',
		'paused': 'paused',
		'complete': 'complete',
		'standby': 'standby',
		'error': 'error',
		'cancelled': 'cancelled'
	};
	return stateMap[state] || 'standby';
}

// Форматирование времени
export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
}

// Получение G-code файла
export async function fetchGcode(filename: string): Promise<string | null> {
	try {
		const url = getMoonrakerUrl();
		const response = await fetch(`${url}/server/files/gcodes/${encodeURIComponent(filename)}`);

		if (!response.ok) {
			throw new Error(`G-code fetch error: ${response.status}`);
		}

		return await response.text();
	} catch (error) {
		console.error('G-code fetch error:', error);
		return null;
	}
}
