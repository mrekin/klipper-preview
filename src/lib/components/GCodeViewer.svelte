<script lang="ts">
	import { _ as locales } from 'svelte-i18n';

	interface GcodeLineEntry {
		line: string;
		filePosition: number;
	}

	interface Move {
		x: number;
		y: number;
		type: 'move' | 'extrude';
		filePosition: number;
	}

	interface Props {
		gcodeLines: GcodeLineEntry[];
		currentLayer: number;
		totalLayers: number;
		nozzlePosition: { x: number; y: number; z: number };
		filePosition: number;
	}

	let { gcodeLines, currentLayer = 0, totalLayers = 100, nozzlePosition, filePosition = 0 }: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let ctx: CanvasRenderingContext2D | null = $state(null);

	// Display parameters
	let scale = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let isDragging = $state(false);
	let lastX = $state(0);
	let lastY = $state(0);

	// Model bounds
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;

	// Parsed data
	let layers = $state<{ z: number; moves: Move[] }[]>([]);
	let lastParsedLength = 0;

	// Display layer tracking
	let displayLayer = $derived.by(() => {
		return Math.min(Math.max(0, currentLayer), layers.length - 1);
	});

	// Separate function for scaling and centering
	function fitToView(padding = 20) {
		if (canvas && layers.length > 0 && maxX > minX && maxY > minY) {
			const modelWidth = maxX - minX;
			const modelHeight = maxY - minY;

			scale = Math.min(
				(canvas.width - padding * 2) / modelWidth,
				(canvas.height - padding * 2) / modelHeight
			);

			// Center model on canvas
			offsetX = (canvas.width - modelWidth * scale) / 2 - minX * scale;
			offsetY = (canvas.height - modelHeight * scale) / 2 - minY * scale;
		}
	}

	// Parse G-code
	function parseGcode(entries: GcodeLineEntry[]) {
		layers = [];
		let currentZ = 0;
		let currentLayerMoves: Move[] = [];
		let x = 0, y = 0;
		let currentE = 0;

		// Reset bounds
		minX = Infinity; maxX = -Infinity;
		minY = Infinity; maxY = -Infinity;

		let moveCount = 0;
		let layerCount = 0;

		for (const entry of entries) {
			const trimmed = entry.line.trim();

			// Layer detection - support more marker variants
			if (trimmed.startsWith(';LAYER:') ||
				trimmed.startsWith(';LAYER;') ||
				trimmed.startsWith('; layer ') ||
				trimmed.startsWith(';LAYER:') ||
				trimmed.startsWith(';LAYER:')) {
				if (currentLayerMoves.length > 0) {
					layers.push({ z: currentZ, moves: [...currentLayerMoves] });
					layerCount++;
				}
				currentLayerMoves = [];
				const zMatch = trimmed.match(/(\d+\.?\d*)/);
				if (zMatch) {
					currentZ = parseFloat(zMatch[1]);
				}
				continue;
			}

			// Parse G0/G1 commands
			if (trimmed.startsWith('G0') || trimmed.startsWith('G1')) {
				const parts = trimmed.split(/\s+/);
				let newX = x, newY = y, newE = currentE;
				let isMove = trimmed.startsWith('G0');
				let hasX = false, hasY = false;

				for (const part of parts) {
					if (part.startsWith('X')) {
						newX = parseFloat(part.slice(1));
						hasX = !isNaN(newX);
					} else if (part.startsWith('Y')) {
						newY = parseFloat(part.slice(1));
						hasY = !isNaN(newY);
					} else if (part.startsWith('E')) {
						newE = parseFloat(part.slice(1));
					}
				}

				// Update bounds only if coordinates actually changed
				if (hasX) {
					minX = Math.min(minX, newX);
					maxX = Math.max(maxX, newX);
				}
				if (hasY) {
					minY = Math.min(minY, newY);
					maxY = Math.max(maxY, newY);
				}

				if (hasX && hasY) {
					// Determine movement type: move or extrude
					const type = isMove || newE <= currentE ? 'move' : 'extrude';
					currentLayerMoves.push({
						x: newX,
						y: newY,
						type,
						filePosition: entry.filePosition
					});
					x = newX;
					y = newY;
					currentE = newE;
					moveCount++;
				}
			}
		}

		// Add last layer
		if (currentLayerMoves.length > 0) {
			layers.push({ z: currentZ, moves: [...currentLayerMoves] });
			layerCount++;
		}

		// Scale and center model
		fitToView(20);
		render();
	}

	// Binary search to find last executed move on layer based on filePosition
	function findLastExecutedMoveIndex(moves: Move[], currentFilePosition: number): number {
		if (moves.length === 0) return -1;

		// Protect against overflow - clamp to max filePosition in moves
		const maxFilePosition = moves[moves.length - 1].filePosition;
		const effectivePosition = Math.min(currentFilePosition, maxFilePosition);

		let left = 0;
		let right = moves.length - 1;
		let result = -1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);

			if (moves[mid].filePosition <= effectivePosition) {
				result = mid; // This move has been executed
				left = mid + 1; // Search further right
			} else {
				right = mid - 1; // Search left
			}
		}

		return result;
	}

	// Render partial layer (from startIndex to endIndex)
	function drawLayerPartial(layer: typeof layers[0], color: string, startIndex: number, endIndex: number) {
		if (!ctx || !canvas || startIndex > endIndex || startIndex >= layer.moves.length) return;

		ctx.strokeStyle = color;
		ctx.lineWidth = 1;
		ctx.beginPath();

		let lastX: number | null = null;
		let lastY: number | null = null;

		for (let i = startIndex; i <= endIndex && i < layer.moves.length; i++) {
			const move = layer.moves[i];
			const x = move.x * scale + offsetX;
			const y = canvas.height - (move.y * scale + offsetY);

			if (move.type === 'extrude' && lastX !== null && lastY !== null) {
				ctx.moveTo(lastX, lastY);
				ctx.lineTo(x, y);
			}

			lastX = x;
			lastY = y;
		}

		ctx.stroke();
	}

	// Render full layer
	function drawLayerFull(layer: typeof layers[0], color: string) {
		if (!ctx || !canvas || layer.moves.length === 0) return;

		ctx.strokeStyle = color;
		ctx.lineWidth = 0.5;
		ctx.beginPath();

		let lastX: number | null = null;
		let lastY: number | null = null;

		for (const move of layer.moves) {
			const x = move.x * scale + offsetX;
			const y = canvas.height - (move.y * scale + offsetY);

			if (move.type === 'extrude' && lastX !== null && lastY !== null) {
				ctx.moveTo(lastX, lastY);
				ctx.lineTo(x, y);
			}

			lastX = x;
			lastY = y;
		}

		ctx.stroke();
	}

	// Rendering
	function render() {
		if (!ctx || !canvas || layers.length === 0) {
			return;
		}

		// Clear canvas
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Grid
		ctx.strokeStyle = '#2a2a4e';
		ctx.lineWidth = 1;
		const gridSize = 10 * scale;

		// Vertical lines (X axis)
		const startX = offsetX % gridSize;
		for (let x = startX; x < canvas.width; x += gridSize) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}

		// Horizontal lines (Y axis) - accounting for inversion
		const startY = offsetY % gridSize;
		for (let y = startY; y < canvas.height; y += gridSize) {
			const canvasY = canvas.height - y;
			if (canvasY >= 0 && canvasY < canvas.height) {
				ctx.beginPath();
				ctx.moveTo(0, canvasY);
				ctx.lineTo(canvas.width, canvasY);
				ctx.stroke();
			}
		}

		// Render layers
		// currentLayer is 1-based from Klipper, need 0-based for array: currentLayer - 1
		const layerIndex = Math.min(Math.max(0, currentLayer - 1), layers.length - 1);

		// Find last executed move on current layer
		const currentLayerMoves = layers[layerIndex]?.moves || [];
		const lastExecutedIndex = filePosition && filePosition > 0
			? findLastExecutedMoveIndex(currentLayerMoves, filePosition)
			: currentLayerMoves.length - 1; // Fallback: entire layer printed

		// Printed layers (gray) - render all layers BEFORE current
		for (let i = 0; i < layerIndex && i < layers.length; i++) {
			drawLayerFull(layers[i], '#4a4a6a');
		}

		// Current layer: split into two parts
		if (layerIndex < layers.length && layerIndex >= 0) {
			const layer = layers[layerIndex];

			// Skip if layer has no moves
			if (layer.moves.length === 0) {
				// Empty layer - skip rendering
			} else {
				// Printed part (blue)
				if (lastExecutedIndex >= 0) {
					drawLayerPartial(layer, '#3b82f6', 0, lastExecutedIndex);
				}

				// Remaining part (gray semi-transparent)
				if (lastExecutedIndex + 1 < layer.moves.length) {
					ctx.globalAlpha = 0.5; // Semi-transparency
					drawLayerPartial(layer, '#6a6a8a', lastExecutedIndex + 1, layer.moves.length - 1);
					ctx.globalAlpha = 1.0; // Reset
				}
			}
		}

		// Nozzle position (red dot)
		if (nozzlePosition) {
			const px = nozzlePosition.x * scale + offsetX;
			const py = canvas.height - (nozzlePosition.y * scale + offsetY);

			ctx.beginPath();
			ctx.arc(px, py, 4, 0, Math.PI * 2);
			ctx.fillStyle = '#ef4444';
			ctx.fill();
		}
	}

	// Event handlers
	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (!canvas) return;

		const delta = e.deltaY > 0 ? 0.9 : 1.1;

		// Scale relative to cursor
		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const newScale = Math.max(0.1, Math.min(10, scale * delta));
		const scaleChange = newScale / scale;

		// For X - normal coordinate system
		offsetX = mouseX - (mouseX - offsetX) * scaleChange;
		// For Y - inverted coordinate system (due to canvas.height - ...)
		// Use inverted cursor position
		const mouseYInverted = canvas.height - mouseY;
		offsetY = mouseYInverted - (mouseYInverted - offsetY) * scaleChange;

		scale = newScale;

		render();
	}

	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;

		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;

		offsetX += dx;
		offsetY -= dy;  // Inversion for Y due to canvas.height - (...) during rendering

		lastX = e.clientX;
		lastY = e.clientY;

		render();
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function zoomIn() {
		scale *= 1.2;
		render();
	}

	function zoomOut() {
		scale = Math.max(0.1, scale / 1.2);
		render();
	}

	function resetView() {
		fitToView(40);
		render();
	}

	$effect(() => {
		// Parse only when new data is loaded
		if (gcodeLines.length > 0 && canvas && gcodeLines.length !== lastParsedLength) {
			parseGcode(gcodeLines);
			lastParsedLength = gcodeLines.length;
		}
	});

	// Track changes for re-rendering
	let lastRenderedLayer = -1;
	let lastRenderedLayersCount = -1;
	let lastRenderedPosition = '-1,-1,-1';
	let lastRenderedFilePosition = -1;

	$effect(() => {
		const shouldRender = layers.length > 0 && ctx && canvas;
		if (!shouldRender) return;

		const layerIndex = Math.min(Math.max(0, currentLayer - 1), layers.length - 1);
		const positionKey = `${nozzlePosition?.x},${nozzlePosition?.y},${nozzlePosition?.z}`;
		const needsRender = layerIndex !== lastRenderedLayer ||
							layers.length !== lastRenderedLayersCount ||
							positionKey !== lastRenderedPosition ||
							filePosition !== lastRenderedFilePosition;

		if (needsRender) {
			lastRenderedLayer = layerIndex;
			lastRenderedLayersCount = layers.length;
			lastRenderedPosition = positionKey;
			lastRenderedFilePosition = filePosition;
			render();
		}
	});

	$effect(() => {
		if (canvas && !ctx) {
			// Initialize context when canvas is available
			ctx = canvas.getContext('2d');

			// Initial size
			const resize = () => {
				if (!canvas) return;
				const container = canvas.parentElement;
				if (container) {
					canvas.width = container.clientWidth;
					canvas.height = container.clientHeight;
					// Recalculate scaling on size change
					if (layers.length > 0) {
						fitToView(20);
					}
					render();
				}
			};

			resize();
			window.addEventListener('resize', resize);

			return () => window.removeEventListener('resize', resize);
		}
	});
</script>

<div class="relative w-full h-full bg-surface-900 rounded-lg overflow-hidden">
	<canvas
		bind:this={canvas}
		class="w-full h-full cursor-grab active:cursor-grabbing"
		onwheel={handleWheel}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
	></canvas>

	<!-- Controls -->
	<div class="absolute top-4 right-4 flex flex-col gap-2">
		<button
			class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-xl"
			onclick={zoomIn}
		>
			+
		</button>
		<button
			class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-xl"
			onclick={zoomOut}
		>
			−
		</button>
		<button
			class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-sm"
			onclick={resetView}
		>
			⌂
		</button>
	</div>

	<!-- Layer info -->
	<div class="absolute bottom-4 left-4 bg-surface-800/80 backdrop-blur px-3 py-2 rounded-lg text-sm">
		{$locales('viewer.layer')}: {currentLayer} / {totalLayers}
	</div>
</div>
