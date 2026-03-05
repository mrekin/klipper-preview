import type { GCodeLayer, GCodeMoveType } from '$lib/types';

/**
 * Binary search to find last executed move on layer based on filePosition.
 * Finds the move with max filePosition <= currentFilePosition.
 *
 * Time complexity: O(log n)
 *
 * @param moves - Array of G-code moves
 * @param currentFilePosition - Current file position from printer
 * @returns Index of last executed move, or -1 if not found
 */
export function findLastExecutedMoveIndex(
	moves: GCodeMoveType[],
	currentFilePosition: number
): number {
	if (moves.length === 0) return -1;

	// Protect against overflow
	const maxFilePosition = moves[moves.length - 1].filePosition;
	const effectivePosition = Math.min(currentFilePosition, maxFilePosition);

	let left = 0;
	let right = moves.length - 1;
	let result = -1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);

		if (moves[mid].filePosition <= effectivePosition) {
			result = mid;
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return result;
}

/**
 * Binary search to find layer by filePosition.
 * Finds the layer with max filePosition <= currentFilePosition.
 *
 * IMPORTANT: This function should be used for G-code preview layer detection instead of
 * using currentLayer from Moonraker's print_stats.info.current_layer (which is unreliable).
 *
 * Time complexity: O(log n)
 *
 * @param layers - Array of G-code layers
 * @param currentFilePosition - Current file position from printer
 * @returns Index of current layer, or 0 if not found
 */
export function findLayerByFilePosition(layers: GCodeLayer[], currentFilePosition: number): number {
	if (layers.length === 0) return 0;
	if (currentFilePosition <= 0) return 0;

	// Protect against overflow
	const maxFilePosition = layers[layers.length - 1].filePosition;
	const effectivePosition = Math.min(currentFilePosition, maxFilePosition);

	// Binary search: find layer with max filePosition <= currentFilePosition
	let left = 0;
	let right = layers.length - 1;
	let result = 0;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);

		if (layers[mid].filePosition <= effectivePosition) {
			result = mid;
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return result;
}

/**
 * Get toolhead position before a given move index.
 * Looks back up to 3 moves to find x, y, z coordinates.
 *
 * @param moves - Array of G-code moves
 * @param moveIndex - Index to look back from
 * @returns Toolhead position {x, y, z}
 */
export function getToolHeadPosition(moves: GCodeMoveType[], moveIndex: number): {
	x: number;
	y: number;
	z: number;
} {
	const output = { x: 0, y: 0, z: 0 };

	// Look back up to 3 moves to find x, y, z
	for (let i = moveIndex, count = 0; i >= 0 && count < 3; i--) {
		const move = moves[i];
		if (move?.x !== undefined && output.x === 0) {
			output.x = move.x;
			count++;
		}
		if (move?.y !== undefined && output.y === 0) {
			output.y = move.y;
			count++;
		}
		if (move?.z !== undefined && output.z === 0) {
			output.z = move.z;
			count++;
		}
	}

	return output;
}
