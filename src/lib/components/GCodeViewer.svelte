<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { _ as locales } from 'svelte-i18n';
	import type {
		GCodeParseResult,
		GCodeLayer,
		GCodeMoveType,
		WorkerOutputMessage
	} from '$lib/types';

	interface Props {
		gcodeData: string; // Full G-code text
		currentLayer: number;
		totalLayers: number;
		nozzlePosition: { x: number; y: number; z: number };
		filePosition: number;
	}

	let { gcodeData, currentLayer = 0, totalLayers = 100, nozzlePosition, filePosition = 0 }: Props =
		$props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let ctx: CanvasRenderingContext2D | null = $state(null);

	// Layer cache for performance
	let layerCache = new Map<number, ImageBitmap>();
	let cacheValid = $state(false);

	// Display parameters
	let scale = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let isDragging = $state(false);
	let lastX = $state(0);
	let lastY = $state(0);

	// Parser state
	let parseResult: GCodeParseResult | null = $state(null);
	let parseProgress = $state(0);
	let isParsing = $state(false);
	let parseError = $state<string | null>(null);

	// Display layer tracking
	let displayLayer = $state(0);
	let isUserNavigating = $state(false);

	// Computed layers (computed once when parseResult changes)
	let computedLayers: GCodeLayer[] = $state([]);

	// Compute layers from parseResult
	$effect(() => {
		if (!parseResult) {
			computedLayers = [];
			return;
		}

		// If parser created layers, use them
		if (parseResult.layers.length > 0) {
			computedLayers = parseResult.layers;
			return;
		}

		console.log('[computeLayers] Computing layers from moves...');
		const startTime = performance.now();

		// Fallback: create layers from moves (same logic as Fluidd)
		const output: GCodeLayer[] = [];
		const moves = parseResult.moves;

		let z = NaN;
		let zStart = 0;
		let zLast = NaN;
		let zNext = NaN;
		const minLayerHeight = 0.2;

		for (let i = 0; i < moves.length; i++) {
			const move = moves[i];
			if (move.z !== undefined && z !== move.z) {
				z = move.z;
				zStart = i;
			}

			if (move.e !== undefined && move.e > 0 && (Number.isNaN(zLast) || z < zLast || z >= zNext)) {
				const hasXYMovement = (move.x !== undefined && move.x !== 0) || (move.y !== undefined && move.y !== 0);
				if (hasXYMovement) {
					zLast = z;
					zNext = Math.round((z + minLayerHeight) * 10000) / 10000;

					output.push({
						z,
						move: zStart,
						filePosition: move.filePosition
					});
				}
			}
		}

		// If moves exist but there are no layers, add a single "default" layer at z=0
		if (output.length === 0 && moves.length > 0) {
			output.push({
				z: 0,
				move: 0,
				filePosition: moves[0].filePosition
			});
		}

		computedLayers = output;
		console.log('[computeLayers] Computed', output.length, 'layers in', (performance.now() - startTime).toFixed(2), 'ms');
	});

	// Simple getter for layers
	let getLayers = () => computedLayers;

	// WebWorker
	let worker: Worker | null = null;

	// Create worker immediately when component is created (not in onMount for Svelte 5 runes)
	if (browser) {
		console.log('[GCodeViewer] Creating worker...');

		// Create Worker
		try {
			worker = new Worker(new URL('../workers/gcode.worker.ts', import.meta.url), {
				type: 'module'
			});
			console.log('[GCodeViewer] Worker created successfully');
		} catch (e) {
			console.error('[GCodeViewer] Failed to create worker:', e);
			parseError = 'Failed to create worker: ' + (e instanceof Error ? e.message : String(e));
		}

		worker.onmessage = (event: MessageEvent<WorkerOutputMessage>) => {
			const message = event.data;
			console.log('[GCodeViewer] Worker message:', message.action);

			if (message.action === 'progress') {
				parseProgress = (message.filePosition / message.total) * 100;
			} else if (message.action === 'result') {
				console.log('[GCodeViewer] Parse result received:', {
					moves: message.result.moves.length,
					layers: message.result.layers.length,
					bounds: message.result.bounds
				});
				parseResult = message.result;
				isParsing = false;
				parseProgress = 100;
				// Initialize display
				initializeView();
			} else if (message.action === 'error') {
				console.error('[GCodeViewer] Worker error:', message.error);
				parseError = message.error;
				isParsing = false;
			}
		};

		worker.onerror = (e) => {
			console.error('[GCodeViewer] Worker error event:', e);
			parseError = 'Worker error: ' + (e?.message || 'Unknown error');
			isParsing = false;
		};
	}

	// Cleanup on unmount
	$effect(() => {
		return () => {
			console.log('[GCodeViewer] Cleanup - terminating worker');
			worker?.terminate();
		};
	});

	// Parse G-code when data changes
	$effect(() => {
		console.log('[GCodeViewer] $effect triggered', {
			hasGcodeData: !!gcodeData,
			gcodeDataLength: gcodeData?.length || 0,
			hasWorker: !!worker,
			isParsing,
			hasParseResult: !!parseResult
		});

		// Wait for worker to be created in onMount
		if (!worker) {
			console.log('[GCodeViewer] Worker not ready yet, waiting...');
			return;
		}

		if (gcodeData && !isParsing && !parseResult) {
			console.log('[GCodeViewer] Starting parse, gcode length:', gcodeData.length);
			isParsing = true;
			parseProgress = 0;
			parseError = null;

			worker.postMessage({
				action: 'parse',
				gcode: gcodeData
			});
		}
	});

	// Initialize view after parsing
	function initializeView() {
		if (!parseResult || !canvas) return;

		// Fit to view
		fitToView(20);

		// Initialize displayLayer to current printed layer
		if (!isUserNavigating) {
			displayLayer = Math.min(Math.max(0, currentLayer - 1), getLayers().length - 1);
		}

		render();
	}

	// Fit model to view
	function fitToView(padding = 20) {
		if (canvas && parseResult && parseResult.bounds) {
			const bounds = parseResult.bounds;
			const modelWidth = bounds.x.max - bounds.x.min;
			const modelHeight = bounds.y.max - bounds.y.min;

			console.log('[fitToView] bounds:', bounds, 'modelSize:', { w: modelWidth, h: modelHeight });

			scale = Math.min(
				(canvas.width - padding * 2) / modelWidth,
				(canvas.height - padding * 2) / modelHeight
			);

			// Center model on canvas
			offsetX = (canvas.width - modelWidth * scale) / 2 - bounds.x.min * scale;
			offsetY = (canvas.height - modelHeight * scale) / 2 - bounds.y.min * scale;

			console.log('[fitToView] scale:', scale.toFixed(4), 'offset:', { x: offsetX.toFixed(2), y: offsetY.toFixed(2) });
		}
	}

	// Binary search to find last executed move on layer based on filePosition
	function findLastExecutedMoveIndex(moves: GCodeMoveType[], currentFilePosition: number): number {
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

	// Get toolhead position before a given move index (like Fluidd's getToolHeadPosition)
	function getToolHeadPosition(moveIndex: number) {
		const output = { x: 0, y: 0, z: 0 };
		const moves = parseResult?.moves ?? [];

		// Look back up to 3 moves to find x, y, z
		for (let i = moveIndex, count = 0; i >= 0 && count < 3; i--) {
			const move = moves[i];
			if (move?.x !== undefined && output.x === 0) { output.x = move.x; count++; }
			if (move?.y !== undefined && output.y === 0) { output.y = move.y; count++; }
			if (move?.z !== undefined && output.z === 0) { output.z = move.z; count++; }
		}

		return output;
	}

	// Render partial layer
	function drawLayerPartial(
		layer: GCodeLayer,
		color: string,
		startIndex: number,
		endIndex: number
	) {
		if (!ctx || !canvas || !parseResult || startIndex > endIndex) return;

		const startTime = performance.now();
		const moves = parseResult.moves;
		const end = Math.min(endIndex, moves.length - 1);

		ctx.strokeStyle = color;
		ctx.lineWidth = 0.5;
		ctx.beginPath();

		// Initialize toolhead position from previous moves (like Fluidd)
		const startPos = getToolHeadPosition(Math.max(0, startIndex - 1));
		let currentState = { ...startPos };

		let lastX: number | null = null;
		let lastY: number | null = null;
		let traveling = true; // Track if we're in travel mode (like Fluidd)

		const actualStart = Math.max(startIndex, layer.move);

		// Count moves with/without extrusion
		let extrusionMoves = 0;
		let travelMoves = 0;
		let pointsLogged = 0;

		for (let i = actualStart; i <= end; i++) {
			const move = moves[i];

			// Get current position BEFORE updating (like Fluidd's toolhead)
			const startX = currentState.x * scale + offsetX;
			const startY = canvas.height - (currentState.y * scale + offsetY);

			// Update position to get new coordinates
			if (move.x !== undefined) currentState.x = move.x;
			if (move.y !== undefined) currentState.y = move.y;
			if (move.z !== undefined) currentState.z = move.z;

			const endX = currentState.x * scale + offsetX;
			const endY = canvas.height - (currentState.y * scale + offsetY);

			// Check for extrusion (like Fluidd)
			if (move.e !== undefined && move.e > 0) {
				extrusionMoves++;
				if (traveling) {
					// Start of extrusion after travel - begin new path at start position
					ctx.moveTo(startX, startY);
					traveling = false;
				}
				// Always draw line to end position (like Fluidd's moveToSVGPath)
				ctx.lineTo(endX, endY);
			} else {
				// Travel move or no extrusion
				travelMoves++;
				traveling = true;
			}
		}

		ctx.stroke();
		const elapsed = performance.now() - startTime;
		console.log(`[drawLayerPartial] Layer ${layer.z}: ${end - actualStart + 1} moves total, ${extrusionMoves} extrusion, ${travelMoves} travel, ${elapsed.toFixed(2)}ms`);
	}

	// Render full layer
	function drawLayerFull(layer: GCodeLayer, layerIndex: number, lastLayerIndex: number, lastMoveIndex: number, color: string) {
		if (!ctx || !canvas || !parseResult) return;

		const moves = parseResult.moves;
		// Find the end of this layer (start of next layer or end of moves)
		const nextLayer = layerIndex < lastLayerIndex ? { move: getLayers()[layerIndex + 1].move } : null;
		const endIndex = nextLayer ? nextLayer.move - 1 : lastMoveIndex;

		drawLayerPartial(layer, color, layer.move, endIndex);
	}

	// Main render function
	function render() {
		if (!ctx || !canvas || !parseResult) return;

		// Clear canvas
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Grid
		ctx.strokeStyle = '#2a2a4e';
		ctx.lineWidth = 1;
		const gridSize = 10 * scale;

		// Vertical lines
		const startX = offsetX % gridSize;
		for (let x = startX; x < canvas.width; x += gridSize) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}

		// Horizontal lines
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

		const layers = getLayers();
		const moves = parseResult.moves;

		// Current printed layer
		const currentPrintedLayer = Math.min(Math.max(0, currentLayer - 1), layers.length - 1);

		// Render recent previous layers for context (last 3) - always gray
		const startLayer = Math.max(0, displayLayer - 3);
		for (let i = startLayer; i < displayLayer && i < layers.length; i++) {
			drawLayerFull(layers[i], i, layers.length - 1, moves.length - 1, '#6a6a8a');
		}

		// Render current layer
		if (displayLayer < layers.length) {
			console.log('[render] Drawing current layer', displayLayer);
			const layer = layers[displayLayer];
			const nextLayerIndex = displayLayer + 1;
			const nextLayer = nextLayerIndex < layers.length ? layers[nextLayerIndex] : null;
			const layerEndIndex = nextLayer ? nextLayer.move - 1 : moves.length - 1;

			if (displayLayer === currentPrintedLayer && filePosition > 0) {
				// Current printing layer - split into two parts
				const lastExecutedIndex = findLastExecutedMoveIndex(moves, filePosition);

				if (lastExecutedIndex >= layer.move) {
					// Printed part (blue)
					drawLayerPartial(layer, '#3b82f6', layer.move, lastExecutedIndex);

					// Remaining part (gray semi-transparent)
					if (lastExecutedIndex + 1 <= layerEndIndex) {
						ctx.globalAlpha = 0.5;
						drawLayerPartial(layer, '#6a6a8a', lastExecutedIndex + 1, layerEndIndex);
						ctx.globalAlpha = 1.0;
					}
				}
			} else if (displayLayer < currentPrintedLayer) {
				// Past layer (blue)
				drawLayerFull(layer, displayLayer, layers.length - 1, moves.length - 1, '#3b82f6');
			} else {
				// Future layer (gray semi-transparent)
				ctx.globalAlpha = 0.5;
				drawLayerFull(layer, displayLayer, layers.length - 1, moves.length - 1, '#6a6a8a');
				ctx.globalAlpha = 1.0;
			}
		}

		// Nozzle position
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

		offsetX = mouseX - (mouseX - offsetX) * scaleChange;
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
		offsetY -= dy;

		lastX = e.clientX;
		lastY = e.clientY;

		render();
	}

	function handleMouseUp() {
		isDragging = false;
	}

	// Navigation functions
	function nextLayer() {
		if (!parseResult || displayLayer >= getLayers().length - 1) return;
		displayLayer++;
		isUserNavigating = true;
		render();
	}

	function prevLayer() {
		if (displayLayer <= 0) return;
		displayLayer--;
		isUserNavigating = true;
		render();
	}

	function goToCurrentLayer() {
		if (!parseResult) return;
		const currentPrintedLayer = Math.min(Math.max(0, currentLayer - 1), getLayers().length - 1);
		displayLayer = currentPrintedLayer;
		isUserNavigating = false;
		render();
	}

	// Track changes for re-rendering
	let lastRenderedLayer = -1;
	let lastRenderedLayersCount = -1;
	let lastRenderedPosition = '-1,-1,-1';
	let lastRenderedFilePosition = -1;
	let lastRenderedCurrentLayer = -1;

	$effect(() => {
		if (!parseResult || !ctx || !canvas) return;

		const startTime = performance.now();
		const currentPrintedLayer = Math.min(
			Math.max(0, currentLayer - 1),
			getLayers().length - 1
		);
		const positionKey = `${nozzlePosition?.x},${nozzlePosition?.y},${nozzlePosition?.z}`;
		const needsRender =
			displayLayer !== lastRenderedLayer ||
			getLayers().length !== lastRenderedLayersCount ||
			positionKey !== lastRenderedPosition ||
			filePosition !== lastRenderedFilePosition ||
			currentPrintedLayer !== lastRenderedCurrentLayer;

		if (needsRender) {
			console.log('[renderEffect] Triggered, displayLayer:', displayLayer, 'currentPrintedLayer:', currentPrintedLayer);
			lastRenderedLayer = displayLayer;
			lastRenderedLayersCount = getLayers().length;
			lastRenderedPosition = positionKey;
			lastRenderedFilePosition = filePosition;
			lastRenderedCurrentLayer = currentPrintedLayer;
			render();
			console.log('[renderEffect] Completed in', (performance.now() - startTime).toFixed(2), 'ms');
		}
	});

	// Initialize canvas context
	$effect(() => {
		if (canvas && !ctx) {
			ctx = canvas.getContext('2d');

			// Initial size
			const resize = () => {
				if (!canvas) return;
				const container = canvas.parentElement;
				if (container) {
					canvas.width = container.clientWidth;
					canvas.height = container.clientHeight;
					if (parseResult) {
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
	{#if isParsing}
		<!-- Parsing progress -->
		<div class="absolute inset-0 flex items-center justify-center bg-surface-900/80">
			<div class="text-center">
				<div class="text-2xl mb-2">{$locales('viewer.parsing')}</div>
				<div class="w-64 h-4 bg-surface-700 rounded-full overflow-hidden">
					<div class="h-full bg-primary-500 transition-all" style="width: {parseProgress}%"></div>
				</div>
				<div class="text-surface-400 mt-2">{Math.round(parseProgress)}%</div>
			</div>
		</div>
	{:else if parseError}
		<!-- Parse error -->
		<div class="absolute inset-0 flex items-center justify-center bg-surface-900/80">
			<div class="text-center text-red-500">
				<div class="text-2xl mb-2">{$locales('viewer.parseError')}</div>
				<div>{parseError}</div>
			</div>
		</div>
	{:else if parseResult}
		<!-- Canvas -->
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
				class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-xl disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={nextLayer}
				disabled={displayLayer >= getLayers().length - 1}
			>
				+
			</button>
			<button
				class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-xl disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={prevLayer}
				disabled={displayLayer <= 0}
			>
				−
			</button>
			<button
				class="w-10 h-10 bg-surface-700 hover:bg-surface-600 rounded-lg flex items-center justify-center text-sm"
				onclick={goToCurrentLayer}
			>
				⌂
			</button>
		</div>

		<!-- Layer info -->
		<div class="absolute bottom-4 left-4 bg-surface-800/80 backdrop-blur px-3 py-2 rounded-lg text-sm">
			{$locales('viewer.layer')}: {displayLayer + 1} / {getLayers().length}
			{displayLayer !==
				Math.min(Math.max(0, currentLayer - 1), getLayers().length - 1)
				? ` (${$locales('viewer.current')}: ${currentLayer})`
				: ''}
		</div>
	{:else}
		<!-- Loading state - waiting for data -->
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-surface-400 text-center">
				<div class="text-4xl mb-2">📐</div>
				<p>{$locales('viewer.loading')}</p>
			</div>
		</div>
	{/if}
</div>
