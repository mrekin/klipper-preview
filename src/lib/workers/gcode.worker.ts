/**
 * G-code WebWorker - parses G-code files in background thread
 * Receives G-code text, returns parsed moves, layers, and metadata
 */

import { parseGcode } from './gcode-parser';

// Types definition (inline for worker)
interface GCodeMove {
	x?: number;
	y?: number;
	z?: number;
	e?: number;
	tool: number;
	filePosition: number;
}

interface GCodeArcMove extends GCodeMove {
	i?: number;
	j?: number;
	k?: number;
	r?: number;
	d: 'clockwise' | 'counter-clockwise';
}

export type GCodeMoveType = GCodeMove | GCodeArcMove;

interface GCodeLayer {
	move: number;
	z: number;
	filePosition: number;
}

interface GCodeBounds {
	x: { min: number; max: number };
	y: { min: number; max: number };
}

interface GCodeParseResult {
	moves: GCodeMoveType[];
	layers: GCodeLayer[];
	bounds: GCodeBounds | null;
	tools: number[];
}

interface WorkerInputMessage {
	action: 'parse';
	gcode: string;
}

interface WorkerProgressMessage {
	action: 'progress';
	filePosition: number;
	total: number;
}

interface WorkerResultMessage {
	action: 'result';
	result: GCodeParseResult;
}

interface WorkerErrorMessage {
	action: 'error';
	error: string;
}

type WorkerOutputMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

// Listen for messages from main thread
self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
	const { action, gcode } = event.data;

	if (action === 'parse') {
		console.log('[Worker] Parse action received, gcode length:', gcode.length);
		try {
			const total = gcode.length;
			console.log('[Worker] Starting parse...');

			// Parse G-code
			// Note: For real progress updates during parsing, parseGcode would need
			// to accept a progress callback. For now, we send progress at start and end.
			const progressMessage: WorkerProgressMessage = {
				action: 'progress',
				filePosition: 0,
				total
			};
			self.postMessage(progressMessage);
			console.log('[Worker] Progress sent, calling parseGcode...');

			const result = parseGcode(gcode);
			console.log('[Worker] Parse complete, moves:', result.moves.length, 'layers:', result.layers.length);

			// Send result
			const resultMessage: WorkerResultMessage = {
				action: 'result',
				result
			};
			self.postMessage(resultMessage);
			console.log('[Worker] Result sent');
		} catch (error) {
			const errorMessage: WorkerErrorMessage = {
				action: 'error',
				error: error instanceof Error ? error.message : String(error)
			};
			self.postMessage(errorMessage);
		}
	}
};

// Type export for TypeScript
export type {};
