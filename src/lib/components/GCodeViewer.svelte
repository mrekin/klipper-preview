<script lang="ts">
        interface Props {
                gcodeLines: string[];
                currentLayer: number;
                totalLayers: number;
                nozzlePosition: { x: number; y: number; z: number };
        }

        let { gcodeLines, currentLayer = 0, totalLayers = 100, nozzlePosition }: Props = $props();
        
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
        let lastParsedLength = 0;

        // Отслеживание отображаемого слоя
        let displayLayer = $derived.by(() => {
                return Math.min(Math.max(0, currentLayer), layers.length - 1);
        });

        // Отдельная функция для масштабирования и центрирования
        function fitToView(padding = 20) {
                if (canvas && layers.length > 0 && maxX > minX && maxY > minY) {
                        const modelWidth = maxX - minX;
                        const modelHeight = maxY - minY;

                        scale = Math.min(
                                (canvas.width - padding * 2) / modelWidth,
                                (canvas.height - padding * 2) / modelHeight
                        );

                        // Центрируем модель на канвасе
                        offsetX = (canvas.width - modelWidth * scale) / 2 - minX * scale;
                        offsetY = (canvas.height - modelHeight * scale) / 2 - minY * scale;
                }
        }

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

                let moveCount = 0;
                let layerCount = 0;

                for (const line of lines) {
                        const trimmed = line.trim();

                        // Определение слоёв - поддерживаем больше вариантов маркеров
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

                        // Парсинг G0/G1 команд
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

                                // Обновляем границы только если координаты действительно изменились
                                if (hasX) {
                                        minX = Math.min(minX, newX);
                                        maxX = Math.max(maxX, newX);
                                }
                                if (hasY) {
                                        minY = Math.min(minY, newY);
                                        maxY = Math.max(maxY, newY);
                                }

                                if (hasX && hasY) {
                                        // Определяем тип движения: перемещение или экструзия
                                        const type = isMove || newE <= currentE ? 'move' : 'extrude';
                                        currentLayerMoves.push({ x: newX, y: newY, type });
                                        x = newX;
                                        y = newY;
                                        currentE = newE;
                                        moveCount++;
                                }
                        }
                }

                // Добавляем последний слой
                if (currentLayerMoves.length > 0) {
                        layers.push({ z: currentZ, moves: [...currentLayerMoves] });
                        layerCount++;
                }

                // Масштабируем и центрируем модель
                fitToView(20);
                render();
        }
        
        // Рендеринг
        function render() {
                if (!ctx || !canvas || layers.length === 0) {
                        return;
                }
                // Очистка
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Сетка
                ctx.strokeStyle = '#2a2a4e';
                ctx.lineWidth = 1;
                const gridSize = 10 * scale;

                // Вертикальные линии (по оси X)
                const startX = offsetX % gridSize;
                for (let x = startX; x < canvas.width; x += gridSize) {
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, canvas.height);
                        ctx.stroke();
                }

                // Горизонтальные линии (по оси Y) - с учетом инверсии
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
                
                // Отрисовка слоёв
                // currentLayer - это 1-based номер слоя из Klipper
                // Для массива нужен 0-based индекс: currentLayer - 1
                const layerIndex = Math.min(Math.max(0, currentLayer - 1), layers.length - 1);

                // Напечатанные слои (серый) - отрисовываем все слои ДО текущего
                for (let i = 0; i < layerIndex && i < layers.length; i++) {
                        drawLayer(layers[i], '#4a4a6a');
                }

                // Текущий слой (синий)
                if (layerIndex < layers.length && layerIndex >= 0) {
                        drawLayer(layers[layerIndex], '#3b82f6');
                }

                // Текущая позиция сопла (красная точка)
                // Используем реальные координаты из API
                if (nozzlePosition) {
                        const px = nozzlePosition.x * scale + offsetX;
                        const py = canvas.height - (nozzlePosition.y * scale + offsetY);

                        ctx.beginPath();
                        ctx.arc(px, py, 4, 0, Math.PI * 2);
                        ctx.fillStyle = '#ef4444';
                        ctx.fill();
                }
        }
        
        function drawLayer(layer: typeof layers[0], color: string) {
                if (!ctx || !canvas) return;

                ctx.strokeStyle = color;
                ctx.lineWidth = color === '#3b82f6' ? 1 : 0.5;
                ctx.beginPath();

                let lastX: number | null = null;
                let lastY: number | null = null;

                for (const move of layer.moves) {
                        const x = move.x * scale + offsetX;
                        // Инвертируем Y для отображения (в 3D-принтере Y идет "вглубь")
                        const y = canvas.height - (move.y * scale + offsetY);

                        if (move.type === 'extrude' && lastX !== null && lastY !== null) {
                                ctx.moveTo(lastX, lastY);
                                ctx.lineTo(x, y);
                        }

                        // Сохраняем текущую точку для следующей итерации
                        lastX = x;
                        lastY = y;
                }

                ctx.stroke();
        }
        
        // Обработчики событий
        function handleWheel(e: WheelEvent) {
                e.preventDefault();
                if (!canvas) return;

                const delta = e.deltaY > 0 ? 0.9 : 1.1;

                // Масштабирование относительно курсора
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const newScale = Math.max(0.1, Math.min(10, scale * delta));
                const scaleChange = newScale / scale;

                // Для X - обычная система координат
                offsetX = mouseX - (mouseX - offsetX) * scaleChange;
                // Для Y - инвертированная система координат (из-за canvas.height - ...)
                // Используем инвертированную позицию курсора
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
                offsetY -= dy;  // Инверсия для Y из-за canvas.height - (...) при отрисовке

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
                // Парсим только когда загружаются новые данные
                if (gcodeLines.length > 0 && canvas && gcodeLines.length !== lastParsedLength) {
                        parseGcode(gcodeLines);
                        lastParsedLength = gcodeLines.length;
                }
        });

        // Отслеживаем изменения для ререндеринга
        let lastRenderedLayer = -1;
        let lastRenderedLayersCount = -1;
        let lastRenderedPosition = '-1,-1,-1';

        $effect(() => {
                const shouldRender = layers.length > 0 && ctx && canvas;
                if (!shouldRender) return;

                const layerIndex = Math.min(Math.max(0, currentLayer - 1), layers.length - 1);
                const positionKey = `${nozzlePosition?.x},${nozzlePosition?.y},${nozzlePosition?.z}`;
                const needsRender = layerIndex !== lastRenderedLayer ||
                                    layers.length !== lastRenderedLayersCount ||
                                    positionKey !== lastRenderedPosition;

                if (needsRender) {
                        lastRenderedLayer = layerIndex;
                        lastRenderedLayersCount = layers.length;
                        lastRenderedPosition = positionKey;
                        render();
                }
        });
        
        $effect(() => {
                if (canvas && !ctx) {
                        // Инициализация контекста когда canvas доступен
                        ctx = canvas.getContext('2d');

                        // Начальный размер
                        const resize = () => {
                                if (!canvas) return;
                                const container = canvas.parentElement;
                                if (container) {
                                        canvas.width = container.clientWidth;
                                        canvas.height = container.clientHeight;
                                        // Пересчитываем масштабирование при изменении размера
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
                Слой: {currentLayer} / {totalLayers}
        </div>
</div>
