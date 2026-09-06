# AirRadar

AirRadar is a personal, dark-mode ADS-B radar UI for a local [`readsb`](https://github.com/wiedehopf/readsb) receiver. It keeps the live aircraft state in RAM, samples history to PostgreSQL, and streams snapshots to the browser over Server-Sent Events (SSE).

## Quick start — demo mode

Demo mode is automatic when `READSB_BASE_URL` is empty or absent.

```bash
cd /var/www/airradar
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Open <http://localhost:3000>. The mock provider generates UAE139 / Emirates A380, Lufthansa, Ryanair and other moving traffic around the configured receiver position.

## Connect readsb

Set the base URL of the readsb web server. AirRadar reads `/data/aircraft.json` and optionally `/data/receiver.json`:

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
```

The polling loop retries automatically. If readsb goes away, the UI and API stay alive and report `Receiver offline`.

## PostgreSQL and Prisma

Live state is never written on every ADS-B update. The state service samples each aircraft at the configured interval (20 seconds by default) and stores `Aircraft`, `Flight`, and `FlightPosition` records.

```bash
# Example local database
createdb airradar

# Set DATABASE_URL in .env, then:
npm run prisma:deploy
npm run dev
```

Without `DATABASE_URL`, the app still works fully in demo mode. History falls back to the in-memory trail and `/api/health` reports the database as `not_configured`.

## Useful commands

```bash
npm run dev          # local development
npm run lint         # ESLint
npm run typecheck    # strict TypeScript
npm run test         # Vitest unit tests
npm run build        # Prisma generate + production build
npm run start        # production server
```

## API

- `GET /api/aircraft` — current state snapshot
- `GET /api/stream` — SSE stream of `snapshot` events
- `GET /api/history/:hex` — PostgreSQL history or RAM trail fallback
- `GET /api/health` — application, database, readsb and live-state health

## Production deployment

`deploy/airradar.service` is a systemd unit for `/var/www/airradar`. Put a production `.env` in the project directory, run `npm run build`, run Prisma migrations if PostgreSQL is enabled, then install the unit:

```bash
sudo cp deploy/airradar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
```

Configure Nginx Proxy Manager to proxy the public hostname to `127.0.0.1:3000` and enable WebSocket support if desired; SSE itself works over standard HTTP proxying with buffering disabled in the included unit notes.

## Architecture

The browser talks only to AirRadar APIs. `AircraftProvider` is the stable server-side abstraction; `LocalReadsbProvider` and `MockReadsbProvider` implement it. `AircraftStateService` owns the in-memory map, derived distance/bearing, trails, statistics, polling and sampling. Future metadata, route, FlightAware, external ADS-B or ATC-sector providers can be composed behind the same server-side boundary without changing the frontend.

The MVP intentionally does not implement ATC sectors/frequencies, FlightAware, complex flight plans, global ADS-B, RTL-airband, push notifications or coverage heatmaps.
