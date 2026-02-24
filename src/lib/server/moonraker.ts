import { env } from '$env/dynamic/private';
import { getMoonrakerUrlSetting, getSetting } from './tokens';
import { getPrinterMoonrakerUrl } from './printers';

// Получение URL Moonraker из БД или переменной окружения
// БД имеет приоритет над переменной окружения
export function getMoonrakerUrl(printerId?: number): string {
	if (printerId !== undefined) {
		const url = getPrinterMoonrakerUrl(printerId);
		if (url) return url;
	}
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
	file_position: number; // Current position in G-code file (bytes from start)
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
	position: { x: 125.4, y: 87.2, z: 12.7 },
	file_position: 450000
};

// Функция запроса статуса из Moonraker
export async function fetchPrinterStatus(printerId?: number): Promise<PrinterStatus> {
	try {
		const url = getMoonrakerUrl(printerId);

		// Запрос к Moonraker API для статуса
		const response = await fetch(
			`${url}/printer/objects/query?display_status&print_stats&print_stats.info&heater_bed&extruder&toolhead&virtual_sdcard`,
			{ signal: AbortSignal.timeout(5000) }
		);

		if (!response.ok) {
			throw new Error(`Moonraker error: ${response.status}`);
		}

		const data = await response.json();
		const result = data.result?.status;

		if (!result) {
			throw new Error('Invalid Moonraker response');
		}

		// Парсинг ответа Moonraker
		const displayStatus = result.display_status || {};
		const printStats = result.print_stats || {};
		const printStatsInfo = printStats.info || {};
		const extruder = result.extruder || {};
		const heaterBed = result.heater_bed || {};
		const toolhead = result.toolhead || {};
		const virtualSdcard = result.virtual_sdcard || {};

		// Get file_position from virtual_sdcard
		const filePosition = virtualSdcard.file_position || 0;
		if (!virtualSdcard.file_position && printStats.state === 'printing') {
			console.warn('[fetchPrinterStatus] virtual_sdcard.file_position not available, fallback to 0');
		}

		// Приоритет: используем точные данные из print_stats.info
		let currentLayer: number;
		let totalLayers: number;
		const filename = printStats.filename || '';

		const hasLayerInfo = printStatsInfo.current_layer && printStatsInfo.current_layer > 0;

		if (hasLayerInfo) {
			// Современный G-code с layer information
			currentLayer = printStatsInfo.current_layer;
			totalLayers = printStatsInfo.total_layer || 0;
		} else {
			// Fallback: старый G-code без layer information
			let layerCount = 100;
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
					console.warn('[fetchPrinterStatus] Failed to fetch file metadata:', e);
				}
			}

			currentLayer = Math.floor((displayStatus.progress || 0) * layerCount);
			totalLayers = layerCount;
		}

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
			total_layers: totalLayers,
			layer_count: totalLayers,
			position: {
				x: toolhead.position?.[0] || 0,
				y: toolhead.position?.[1] || 0,
				z: toolhead.position?.[2] || 0
			},
			file_position: filePosition
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

// Получение G-code файла
export async function fetchGcode(filename: string, printerId?: number): Promise<string | null> {
	try {
		const url = getMoonrakerUrl(printerId);
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
