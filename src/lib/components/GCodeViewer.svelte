<script lang="ts">
        import { onMount } from 'svelte';
        
        interface Props {
                gcodeLines: string[];
                currentLayer: number;
                totalLayers: number;
        }
        
        let { gcodeLines, currentLayer = 0, totalLayers = 100 }: Props = $props();
        
        let canvas: HTMLCanvasElement | null = $state(null);
        let ctx: CanvasRenderingContext2D | null = $state(null);
        
        // Параметры отображения
        let scale = $state(1);
        let offsetX = $state(0);
        let offsetY = $state(0);
        let isDragging = $state(false);
        let lastX = $state(0);
        let lastY = $state(0);
        
        // Границы модели
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        // Распарсенные данные
        let layers = $state<{ z: number; moves: { x: number; y: number; type: 'move' | 'extrude' }[] }[]>([]);
        
        // Парсинг G-code
        function parseGcode(lines: string[]) {
                layers = [];
                let currentZ = 0;
                let currentLayerMoves: { x: number; y: number; type: 'move' | 'extrude' }[] = [];
                let x = 0, y = 0;
                let currentE = 0;
                
                // Сброс границ
                minX = Infinity; maxX = -Infinity;
                minY = Infinity; maxY = -Infinity;
                
                for (const line of lines) {
                        const trimmed = line.trim();
                        
                        // Определение слоя
                        if (trimmed.startsWith(';LAYER:') || trimmed.startsWith('; layer')) {
                                if (currentLayerMoves.length > 0) {
                                        layers.push({ z: currentZ, moves: [...currentLayerMoves] });
                                }
                                currentLayerMoves = [];
                                const zMatch = trimmed.match(/(\d+\.?\d*)/);
                                if (zMatch) {
                                        currentZ = parseFloat(zMatch[1]);
                                }
                                continue;
                        }
                        
                        // Парсинг G0/G1 команд
                        if (trimmed.startsWith('G0') || trimmed.startsWith('G1')) {
                                const parts = trimmed.split(/\s+/);
                                let newX = x, newY = y, newE = currentE;
                                let isMove = trimmed.startsWith('G0');
                                
                                for (const part of parts) {
                                        if (part.startsWith('X')) {
                                                newX = parseFloat(part.slice(1));
                                                if (!isNaN(newX)) {
                                                        minX = Math.min(minX, newX);
                                                        maxX = Math.max(maxX, newX);
                                                }
                                        } else if (part.startsWith('Y')) {
                                                newY = parseFloat(part.slice(1));
                                                if (!isNaN(newY)) {
                                                        minY = Math.min(minY, newY);
                                                        maxY = Math.max(maxY, newY);
                                                }
                                        } else if (part.startsWith('E')) {
                                                newE = parseFloat(part.slice(1));
                                        }
                                }
                                
                                if (!isNaN(newX) && !isNaN(newY)) {
                                        // Определяем тип движения: перемещение или экструзия
                                        const type = isMove || newE <= currentE ? 'move' : 'extrude';
                                        currentLayerMoves.push({ x: newX, y: newY, type });
                                        x = newX;
                                        y = newY;
                                        currentE = newE;
                                }
                        }
                }
                
                // Добавляем последний слой
                if (currentLayerMoves.length > 0) {
                        layers.push({ z: currentZ, moves: [...currentLayerMoves] });
                }
                
                // Автомасштабирование
                if (canvas && layers.length > 0) {
                        const modelWidth = maxX - minX;
                        const modelHeight = maxY - minY;
                        const padding = 20;
                        
                        scale = Math.min(
                                (canvas.width - padding * 2) / modelWidth,
                                (canvas.height - padding * 2) / modelHeight
                        );
                        
                        offsetX = (canvas.width - modelWidth * scale) / 2 - minX * scale;
                        offsetY = (canvas.height - modelHeight * scale) / 2 - minY * scale;
                }
                
                render();
        }
        
        // Рендеринг
        function render() {
                if (!ctx || !canvas || layers.length === 0) return;
                
                // Очистка
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Сетка
                ctx.strokeStyle = '#2a2a4e';
                ctx.lineWidth = 1;
                const gridSize = 10 * scale;
                
                for (let x = offsetX % gridSize; x < canvas.width; x += gridSize) {
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, canvas.height);
                        ctx.stroke();
                }
                
                for (let y = offsetY % gridSize; y < canvas.height; y += gridSize) {
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(canvas.width, y);
                        ctx.stroke();
                }
                
                // Отрисовка слоёв
                const safeLayer = Math.min(Math.max(0, currentLayer), layers.length);
                
                // Напечатанные слои (серый)
                ctx.strokeStyle = '#4a4a6a';
                ctx.lineWidth = 0.5;
                
                for (let i = 0; i < safeLayer && i < layers.length; i++) {
                        drawLayer(layers[i], '#4a4a6a');
                }
                
                // Текущий слой (синий)
                if (safeLayer < layers.length) {
                        ctx.strokeStyle = '#3b82f6';
                        ctx.lineWidth = 1;
                        drawLayer(layers[safeLayer], '#3b82f6');
                }
                
                // Текущая позиция
                if (safeLayer < layers.length && layers[safeLayer].moves.length > 0) {
                        const lastMove = layers[safeLayer].moves[layers[safeLayer].moves.length - 1];
                        const px = lastMove.x * scale + offsetX;
                        const py = canvas.height - (lastMove.y * scale + offsetY);
                        
                        ctx.beginPath();
                        ctx.arc(px, py, 4, 0, Math.PI * 2);
                        ctx.fillStyle = '#ef4444';
                        ctx.fill();
                }
        }
        
        function drawLayer(layer: typeof layers[0], color: string) {
                if (!ctx || !canvas) return;
                
                ctx.strokeStyle = color;
                ctx.beginPath();
                
                let lastX = 0, lastY = 0;
                
                for (const move of layer.moves) {
                        const x = move.x * scale + offsetX;
                        const y = canvas.height - (move.y * scale + offsetY);
                        
                        if (move.type === 'extrude') {
                                ctx.moveTo(lastX, lastY);
                                ctx.lineTo(x, y);
                        }
                        
                        lastX = x;
                        lastY = y;
                }
                
                ctx.stroke();
        }
        
        // Обработчики событий
        function handleWheel(e: WheelEvent) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                
                // Масштабирование относительно курсора
                const rect = canvas?.getBoundingClientRect();
                if (!rect) return;
                
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const newScale = Math.max(0.1, Math.min(10, scale * delta));
                const scaleChange = newScale / scale;
                
                offsetX = mouseX - (mouseX - offsetX) * scaleChange;
                offsetY = mouseY - (mouseY - offsetY) * scaleChange;
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
        
        function zoomIn() {
                scale *= 1.2;
                render();
        }
        
        function zoomOut() {
                scale = Math.max(0.1, scale / 1.2);
                render();
        }
        
        function resetView() {
                if (canvas && layers.length > 0) {
                        const modelWidth = maxX - minX;
                        const modelHeight = maxY - minY;
                        const padding = 40;
                        
                        scale = Math.min(
                                (canvas.width - padding * 2) / modelWidth,
                                (canvas.height - padding * 2) / modelHeight
                        );
                        
                        offsetX = (canvas.width - modelWidth * scale) / 2 - minX * scale;
                        offsetY = (canvas.height - modelHeight * scale) / 2 - minY * scale;
                        
                        render();
                }
        }
        
        $effect(() => {
                if (gcodeLines.length > 0 && canvas) {
                        parseGcode(gcodeLines);
                }
        });
        
        $effect(() => {
                // Перерисовка при смене слоя
                render();
        });
        
        onMount(() => {
                const canvasEl = canvas;
                if (canvasEl) {
                        ctx = canvasEl.getContext('2d');
                        // Начальный размер
                        const resize = () => {
                                const container = canvasEl.parentElement;
                                if (container) {
                                        canvasEl.width = container.clientWidth;
                                        canvasEl.height = container.clientHeight;
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
                Слой: {Math.min(currentLayer + 1, layers.length)} / {layers.length}
        </div>
</div>
