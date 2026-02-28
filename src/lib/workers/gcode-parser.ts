/**
 * G-code parser - parses G-code files and extracts moves, layers, and metadata
 * Based on Fluidd's implementation with support for all major G-code commands
 */

// Types (inline for worker)
export interface GCodeMove {
	x?: number;
	y?: number;
	z?: number;
	e?: number;
	tool: number;
	filePosition: number;
}

export interface GCodeArcMove extends GCodeMove {
	i?: number;
	j?: number;
	k?: number;
	r?: number;
	d: 'clockwise' | 'counter-clockwise';
}

export type GCodeMoveType = GCodeMove | GCodeArcMove;

export interface GCodeLayer {
	move: number;
	z: number;
	filePosition: number;
}

export interface GCodeBounds {
	x: { min: number; max: number };
	y: { min: number; max: number };
}

export interface GCodeParseResult {
	moves: GCodeMoveType[];
	layers: GCodeLayer[];
	bounds: GCodeBounds | null;
	tools: number[];
}

// Parser state
interface ParserState {
	x: number;
	y: number;
	z: number;
	e: number;
}

// Parsed line data for G-code commands (always have numeric args)
interface GCodeParsedLine {
	type: 'gcode';
	command: string;
	args: Record<string, number>;
}

// Parsed line data for macro commands (can have string args)
interface MacroParsedLine {
	type: 'macro';
	command: string;
	args: Record<string, number | string>;
}

// Union type for all parsed lines
type ParsedLine = GCodeParsedLine | MacroParsedLine;

// Type guard to check if parsed line is G-code
function isGcodeLine(parsed: ParsedLine): parsed is GCodeParsedLine {
	return parsed.type === 'gcode';
}

// Parse G-code file
export function parseGcode(gcode: string): GCodeParseResult {
	const moves: GCodeMoveType[] = [];
	const layers: GCodeLayer[] = [];
	const tools = new Set<number>([0]);

	let state: ParserState = { x: 0, y: 0, z: 0, e: 0 };
	let positioningMode: 'absolute' | 'relative' = 'absolute';
	let extrusionMode: 'absolute' | 'relative' = 'absolute';
	let currentTool = 0;
	let filePosition = 0;

	let newLayerForNextMove = false;
	let lastZ = 0;

	// Model bounds
	const bounds: GCodeBounds = {
		x: { min: Infinity, max: -Infinity },
		y: { min: Infinity, max: -Infinity }
	};

	const lines = gcode.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim().split(';')[0]; // remove comments

		if (!line) {
			filePosition += lines[i].length + 1;
			continue;
		}

		const parsed = parseLine(line);
		if (!parsed) {
			filePosition += lines[i].length + 1;
			continue;
		}

		let move: GCodeMoveType | null = null;

		if (parsed.type === 'macro') {
			// Handle macro commands
			switch (parsed.command) {
				case 'SET_PRINT_STATS_INFO':
					if (parsed.args.current_layer !== undefined) {
						newLayerForNextMove = true;
					}
					break;
			}
		} else if (isGcodeLine(parsed)) {
			// Handle G-code commands
			switch (parsed.command) {
				case 'G0':
				case 'G1':
					move = parseLinearMove(parsed.args, currentTool, filePosition);
					break;

				case 'G2':
				case 'G3':
					move = parseArcMove(
						parsed.args,
						parsed.command === 'G2' ? 'clockwise' : 'counter-clockwise',
						currentTool,
						filePosition
					);
					break;

				case 'G10':
					// Firmware retraction
					move = {
						e: -1, // will be calculated to absolute value
						tool: currentTool,
						filePosition
					};
					break;

				case 'G11':
					// Firmware unretraction
					move = {
						e: 1,
						tool: currentTool,
						filePosition
					};
					break;

				case 'G28':
					// Home
					move = { tool: currentTool, filePosition };
					const homeArgs = parsed.args;
					const hasHomeArgs = Object.keys(homeArgs).length > 0;
					if (!hasHomeArgs || homeArgs.x !== undefined) {
						move.x = 0;
					}
					if (!hasHomeArgs || homeArgs.y !== undefined) {
						move.y = 0;
					}
					if (!hasHomeArgs || homeArgs.z !== undefined) {
						move.z = 0;
					}
					break;

				case 'G90':
					positioningMode = 'absolute';
					break;

				case 'G91':
					positioningMode = 'relative';
					break;

				case 'M82':
					extrusionMode = 'absolute';
					state.e = 0;
					break;

				case 'M83':
					extrusionMode = 'relative';
					break;

				case 'G92':
					// Set position
					if (extrusionMode === 'absolute') {
						state.e = parsed.args.e ?? state.e;
					}
					if (positioningMode === 'absolute') {
						state.x = parsed.args.x ?? state.x;
						state.y = parsed.args.y ?? state.y;
						state.z = parsed.args.z ?? state.z;
					}
					break;

				default:
					// Check for tool change (T0, T1, ...)
					if (parsed.command.startsWith('T')) {
						const toolNum = parseInt(parsed.command.substring(1));
						if (!isNaN(toolNum)) {
							currentTool = toolNum;
							tools.add(currentTool);
						}
					}
					break;
			}
		}

		if (move) {
			// Process absolute/relative coordinates
			move = processMoveCoordinates(move, state, positioningMode, extrusionMode);

			// Create new layer
			if (newLayerForNextMove && move.e && move.e > 0) {
				if (hasMovementInPlane(move)) {
					layers.push({
						z: state.z,
						move: moves.length,
						filePosition
					});
					newLayerForNextMove = false;
				}
			}
			// Fallback: layer detection by Z change
			else if (move.z !== undefined && move.z !== lastZ) {
				if (move.e && move.e > 0 && hasMovementInPlane(move)) {
					layers.push({
						z: move.z,
						move: moves.length,
						filePosition
					});
				}
				lastZ = move.z;
			}

			// Update state
			if (move.x !== undefined) state.x = move.x;
			if (move.y !== undefined) state.y = move.y;
			if (move.z !== undefined) state.z = move.z;
			if (move.e !== undefined) state.e = move.e;

			// Update bounds (always, not only when layers exist)
			bounds.x.min = Math.min(bounds.x.min, state.x);
			bounds.x.max = Math.max(bounds.x.max, state.x);
			bounds.y.min = Math.min(bounds.y.min, state.y);
			bounds.y.max = Math.max(bounds.y.max, state.y);

			moves.push(move);
		}

		filePosition += lines[i].length + 1;
	}

	return {
		moves,
		layers,
		bounds: moves.length > 0 ? bounds : null,
		tools: Array.from(tools).sort((a, b) => a - b)
	};
}

// Parse a single G-code line
function parseLine(line: string): ParsedLine | null {
	// G-code command (G0, G1, M82, ...)
	const gcodeMatch = line.match(/^([GMT]\d+)\s*(.*)$/i);
	if (gcodeMatch) {
		const [, command, argsStr] = gcodeMatch;
		const args = parseGcodeArgs(argsStr);
		return { type: 'gcode', command: command.toUpperCase(), args };
	}

	// Macro command (SET_PRINT_STATS_INFO, ...)
	const macroMatch = line.match(
		/^(SET_PRINT_STATS_INFO|EXCLUDE_OBJECT_DEFINE|SET_RETRACTION)\s+(.*)$/i
	);
	if (macroMatch) {
		const [, command, argsStr] = macroMatch;
		const args = parseMacroArgs(argsStr);
		return { type: 'macro', command: command.toUpperCase(), args };
	}

	return null;
}

// Parse G-code arguments (X10 Y20 Z0.3 E1)
function parseGcodeArgs(argsStr: string): Record<string, number> {
	const args: Record<string, number> = {};
	const regex = /([a-zA-Z])\s*(-?\d+\.?\d*)/g;

	let match;
	while ((match = regex.exec(argsStr)) !== null) {
		const [, key, value] = match;
		args[key.toLowerCase()] = parseFloat(value);
	}

	return args;
}

// Parse macro arguments (CURRENT_LAYER=1 or KEY=VALUE)
function parseMacroArgs(argsStr: string): Record<string, number | string> {
	const args: Record<string, number | string> = {};

	// Simple parsing of KEY=VALUE or KEY VALUE
	const parts = argsStr.split(/\s+/);
	for (const part of parts) {
		const eqIndex = part.indexOf('=');
		if (eqIndex >= 0) {
			const key = part.substring(0, eqIndex).toLowerCase();
			const value = part.substring(eqIndex + 1);
			const numValue = parseFloat(value);
			args[key] = isNaN(numValue) ? value : numValue;
		}
	}

	return args;
}

// Parse linear move (G0/G1)
function parseLinearMove(args: Record<string, number>, tool: number, filePosition: number): GCodeMove {
	const move: GCodeMove = { tool, filePosition };

	if (args.x !== undefined) move.x = args.x;
	if (args.y !== undefined) move.y = args.y;
	if (args.z !== undefined) move.z = args.z;
	if (args.e !== undefined) move.e = args.e;

	return move;
}

// Parse arc move (G2/G3)
function parseArcMove(
	args: Record<string, number>,
	direction: 'clockwise' | 'counter-clockwise',
	tool: number,
	filePosition: number
): GCodeArcMove {
	const move: GCodeArcMove = { tool, filePosition, d: direction };

	if (args.x !== undefined) move.x = args.x;
	if (args.y !== undefined) move.y = args.y;
	if (args.z !== undefined) move.z = args.z;
	if (args.e !== undefined) move.e = args.e;
	if (args.i !== undefined) move.i = args.i;
	if (args.j !== undefined) move.j = args.j;
	if (args.k !== undefined) move.k = args.k;
	if (args.r !== undefined) move.r = args.r;

	return move;
}

// Process move coordinates (handle absolute/relative positioning)
function processMoveCoordinates(
	move: GCodeMoveType,
	state: ParserState,
	positioningMode: 'absolute' | 'relative',
	extrusionMode: 'absolute' | 'relative'
): GCodeMoveType {
	// Handle E (extrusion)
	if (move.e !== undefined) {
		if (extrusionMode === 'absolute') {
			// Convert absolute E to relative
			const relativeE = move.e - state.e;
			move.e = relativeE;
		}
		// In relative mode E is already relative
	}

	// Handle coordinates
	if (positioningMode === 'relative') {
		if (move.x !== undefined) move.x = state.x + move.x;
		if (move.y !== undefined) move.y = state.y + move.y;
		if (move.z !== undefined) move.z = state.z + move.z;
	}

	return move;
}

// Check if move has movement in XY plane
function hasMovementInPlane(move: GCodeMoveType): boolean {
	return ('x' in move && move.x !== undefined && move.x !== 0) ||
		('y' in move && move.y !== undefined && move.y !== 0) ||
		('i' in move && move.i !== undefined && move.i !== 0) ||
		('j' in move && move.j !== undefined && move.j !== 0);
}
