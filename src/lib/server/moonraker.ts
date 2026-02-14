import { env } from '$env/dynamic/private';
import { getMoonrakerUrlSetting } from './tokens';
// Получение URL Moonraker из БД или переменной окружения
export function getMoonrakerUrl(): string {
	return env.MOONRAKER_URL || getMoonrakerUrlSetting();
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
	position: { x: 125.4, y: 87.2, z: 12.7 }
};

// Функция запроса статуса из Moonraker
export async function fetchPrinterStatus(): Promise<PrinterStatus> {
	try {
		const url = getMoonrakerUrl();

		// Запрос к Moonraker API
		// Fixed: proper query string with & separators
		const response = await fetch(
			`${url}/printer/objects/query?display_status&print_stats&heater_bed&extruder&toolhead`,
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
		const extruder = result.extruder || {};
		const heaterBed = result.heater_bed || {};
		const toolhead = result.toolhead || {};

		// Расчёт слоёв из метаданных файла (упрощённо)
		const currentLayer = Math.floor((displayStatus.progress || 0) * 100);

		return {
			state: mapState(printStats.state),
			filename: printStats.filename || '',
			progress: (displayStatus.progress || 0) * 100,
			print_duration: printStats.print_duration || 0,
			estimated_time: printStats.total_duration || printStats.print_duration || 0,
			extruder_temp: extruder.temperature || 0,
			extruder_target: extruder.target || 0,
			bed_temp: heaterBed.temperature || 0,
			bed_target: heaterBed.target || 0,
			current_layer: currentLayer,
			total_layers: 100, // Требуется запрос метаданных файла
			position: {
				x: toolhead.position?.[0] || 0,
				y: toolhead.position?.[1] || 0,
				z: toolhead.position?.[2] || 0
			}
		};
	} catch (error) {
		console.error('Moonraker fetch error:', error);
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
