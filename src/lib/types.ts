/**
 * G-code preview types
 *
 * Note: These types are duplicated in src/lib/workers/gcode-parser.ts
 * to avoid SvelteKit alias issues in WebWorkers. Keep them in sync!
 */

// G-code move types
export interface GCodeMove {
	x?: number;
	y?: number;
	z?: number;
	e?: number; // extrusion (relative)
	tool: number; // extruder number (T0, T1, ...)
	filePosition: number; // position in file
}

export interface GCodeArcMove extends GCodeMove {
	i?: number; // X offset for arc center
	j?: number; // Y offset for arc center
	k?: number; // Z offset for arc center
	r?: number; // radius
	d: 'clockwise' | 'counter-clockwise'; // direction
}

export type GCodeMoveType = GCodeMove | GCodeArcMove;

// Layer definition
export interface GCodeLayer {
	move: number; // index of first move in the layer
	z: number; // Z coordinate of the layer
	filePosition: number; // position in file at layer start
}

// Model bounds
export interface GCodeBounds {
	x: { min: number; max: number };
	y: { min: number; max: number };
}

// Parser result
export interface GCodeParseResult {
	moves: GCodeMoveType[];
	layers: GCodeLayer[];
	bounds: GCodeBounds | null;
	tools: number[];
}

// Parser progress
export interface GCodeParserProgress {
	filePosition: number;
	total: number;
	percent: number;
}

// WebWorker message types
export interface WorkerInputMessage {
	action: 'parse';
	gcode: string;
}

export interface WorkerProgressMessage {
	action: 'progress';
	filePosition: number;
	total: number;
}

export interface WorkerResultMessage {
	action: 'result';
	result: GCodeParseResult;
}

export interface WorkerErrorMessage {
	action: 'error';
	error: string;
}

export type WorkerOutputMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;
