# Термины проекта

| Термин | Описание | Артефакты |
|--------|----------|-----------|
| TTL / Time To Live | Время жизни ссылки в минутах, после которого она становится недействительной | `ttlMinutes` (API), `ttl_minutes` (БД) |
| Token / Токен | Уникальная строка для доступа к странице просмотра статуса принтера | `token` column (tokens table), `/api/token/[token]` route |
| Бессрочная ссылка | Ссылка с TTL = 0, которая никогда не истекает | `ttlMinutes = 0` (API), `expires_at` calculation (tokens.ts) |
| Предустановленные варианты | Быстрые кнопки для выбора стандартных значений TTL (30 мин, 1 час, 24 часа и т.д.) | `ttlOptions` array (admin/+page.svelte) |
| Base path / Базовый путь | Префикс URL для проксирования приложения через reverse proxy (например, `/klipper/`). Caddy убирает префикс через `handle_path` для server-side routing, но client-side запросы должны включать префикс | `X-Base-Path` header (Caddy), `getBasePath()` в `src/lib/config.ts` |
| Public URL / Публичный URL | Полный URL, формируемый автоматически из origin + base path для ссылок и QR-кодов. Используется `getPublicUrl()` которая учитывает base path из заголовка. Отличается от `getBasePathUrl()` тем, что возвращает полный URL с origin | `getPublicUrl()` в `src/lib/config.ts`, `window.location.origin` |
| getBasePathUrl() | Функция для добавления base path к относительным путям в client-side коде. Используется для API запросов и навигации, чтобы они шли через правильный прокси-путь | `getBasePathUrl()` в `src/lib/config.ts`, `fetch(getBasePathUrl('/api/tokens'))` |
| Reverse proxy / Обратный прокси | Сервер (Caddy), который перенаправляет запросы к приложению по определенному пути. Использует `handle_path` для удаления префикса перед отправкой в контейнер | Caddyfile, `X-Base-Path` header |
| handle_path (Caddy) | Директива Caddy которая удаляет указанный префикс из пути перед отправкой запроса в бэкенд. Запрос `/klipper/admin` → `/admin` в контейнере | `handle_path /klipper/*` в Caddyfile |
| X-Base-Path header | Заголовок HTTP который Caddy передает в приложение для информирования о базовом пути. Используется для формирования публичных URL | `header_upstream X-Base-Path /klipper` в Caddyfile |
| Polling / Поллинг | Периодический опрос сервера для получения обновленных данных (используется вместо WebSocket). Работает корректно без дополнительных настроек, так как пути переписаны Caddy | `setInterval(loadStatus, 2000)` в view/[token]/+page.svelte |
| 401 Unauthorized / HTTP код 401 | Код состояния HTTP, означающий что клиент не предоставил идентификацию. Используется когда токен отсутствует в запросе | `if (!token)` в /api/status (строки 11-13 после изменения) |
| 403 Forbidden / HTTP код 403 | Код состояния HTTP, означающий что сервер понял запрос, но отказывается его авторизовать. Используется когда токен невалиден, истек или отозван | `validateToken()` в src/lib/server/tokens.ts строки 118-129 |
| Token validation / Валидация токена | Процесс проверки токена: существует ли в БД, не отозван ли, не истек ли срок действия. Реализована через `validateToken()` в tokens.ts | `validateToken()` в src/lib/server/tokens.ts строки 118-129 |
| Public API / Публичный API | API endpoints доступные из интернета, но требующие валидный токен авторизации. Пример: `/api/status` требует `?token=` параметр | `/api/status`, `/api/gcode/[token]`, `/api/token/[token]` |
| Admin API / Админский API | API endpoints для административных функций, доступные только из локальной сети (без токена, но с защитой через Caddy). Пример: `/api/admin/status` | `/api/admin/status` (создается в задаче #4), `/api/tokens`, `/api/settings` |
