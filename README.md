# Klipper Print Share

Service for sharing 3D printing status via temporary links.

## 1. Use Cases

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

The app will be available at `http://localhost:5173`

### 2.2 Production (Docker)

#### Prerequisites

- Docker and Docker Compose
- Moonraker API access (local network)

#### Configuration

```bash
# Build and run
docker compose up -d
```

The app will be available at `http://localhost:3000`

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

## 4. Usage

1. Open `/admin` from your local network
2. Select a printer (if multiple configured)
3. Click a button with desired TTL (or enter custom time)
4. Optionally add a comment for the link
5. Copy the generated link or scan the QR code
6. Share with your customer
7. Customer views print progress without control access

## 5. License

CC-BY-4.0
