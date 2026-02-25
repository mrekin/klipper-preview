# Klipper Print Share

Service for sharing 3D printing status via temporary links.

Works with Moonraker API (KliperPreview -> Moonraker API -> Klipper (printer) )

### Admin page
<img width="1050" height="727" alt="Screenshot 2026-02-25 124615" src="https://github.com/user-attachments/assets/79bcd4fd-d31b-433c-a004-1d21e191448c" />

### View page
<img width="1022" height="719" alt="image" src="https://github.com/user-attachments/assets/ebef16d3-ac58-4850-865b-3381ffcee157" />


## 1. Usage

1. Open `/admin` from your local network
2. Select a printer (if multiple configured)
3. Click a button with desired TTL (or enter custom time)
4. Optionally add a comment for the link
5. Copy the generated link or scan the QR code
6. Share with your customer
7. Customer views print progress without control access

### 1.1 Key Features

- **Progress tracking** - completion percentage, current layer, elapsed/remaining time
- **Real-time temperature monitoring** - extruder and bed temperatures
- **G-code visualization** - interactive preview similar to Fluidd
- **Multiple printers support** - manage and share links for multiple printers
- **QR codes** - generate QR codes for easy link sharing
- **Model thumbnails** - preview model images on view page
- **Temporary links** - configurable TTL with 30-minute steps
- **Read-only access** - customers can view but cannot control the printer
- **i18n support** - English and Russian languages available

## 2. Installation

### 2.1 Development

Run locally without Docker:

```bash
# Install dependencies
npm install
# or
bun install

# Create .env file (optional for dev)
cp .env.example .env

# Run dev server
npm run dev
# or
bun run dev
```

The app will be available at `http://localhost:3000/admin`

### 2.2 Production (Docker)

#### Prerequisites

- Docker and Docker Compose
- Moonraker API access (local network)

#### Get image

```
docker pull ghcr.io/mrekin/klipper-preview:latest
```

Write docker compose file

```
services:
  app:
    image: ghcr.io/mrekin/klipper-preview:latest
    container_name: klipper-print-share
    ports:
      - "3000:3000"
    environment:
      - DATABASE_PATH=/data/tokens.db
    volumes:
      - ./data:/data
    restart: unless-stopped
    networks:
      - print-share-network

networks:
  print-share-network:
    driver: bridge
```


```bash
# Run
docker compose up -d
```


The app will be available at `http://localhost:3000/admin`

**Environment variables** (set in `docker-compose.yml`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | Path to tokens database (inside container) | `/data/tokens.db` |

To configure printers, open `/admin/settings` in your browser.

### 2.3 Caddy Configuration (Optional)

Caddy is used as an optional reverse proxy for HTTPS and base path support.

Copy `Caddyfile.example` to `Caddyfile` and configure:

```caddy
your-domain.com {
    @allowedKlipper {
        path_regexp ^/klipper/(view|_app|api/(status|gcode|token|config/base-path|thumbnail))
    }

    handle @allowedKlipper {
        uri strip_prefix /klipper
        reverse_proxy localhost:3000 {
            header_up X-Base-Path /klipper
        }
    }

    handle / {
        redir /klipper/view
    }
}
```

**Important notes:**
- Replace `your-domain.com` with your actual domain
- Adjust the reverse_proxy URL to match your app's address
- The `X-Base-Path` header tells the app it's running under `/klipper` prefix
- `thumbnail` endpoint is required for model preview images

## 3. Moonraker API

Endpoints used:

- `GET /printer/objects/query` - printer status
- `GET /server/files/metadata` - file metadata
- `GET /server/files/gcodes/{filename}` - download G-code
- `GET /server/files/gcodes/{filename}/bigthumbnail` - model thumbnail
- `WebSocket /websocket` - real-time updates

## 4. Check list

- [x] Admin page
- [x] Settings page
- [x] View page
    - [x] Gcode preview
    - [x] Thumble preview
    - [x] Print process info
    - [ ] Websocket support
    - [ ] Camera support
- [x] Multiple printers support
- [x] i18n support
- [ ] Admin auth
- [ ] Moonraker auth
- [ ] Links/tokens
  - [x] Time limited links
  - [ ] Expire link after print process finished
  - [ ] Access, based on current filename

## 5. License

CC-BY-4.0
