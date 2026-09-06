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

Live state is never written on every ADS-B update. The state service samples each aircraft at the configured interval (20 seconds by default), writes positions with bounded concurrency, and stores `Aircraft`, `Flight`, and `FlightPosition` records. `HISTORY_RETENTION_DAYS` (30 by default) removes old position samples periodically.

The project uses the Prisma 8 contract-based PostgreSQL workflow. `prisma/contract.prisma` is the source of truth, `prisma.config.ts` defines the PostgreSQL target, and `generated/prisma8/` contains generated runtime contract artifacts. The checked-in migration lives under `migrations/app/`.

```bash
# Example local database
createdb airradar

# Set DATABASE_URL in .env, then:
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Prisma 8 currently requires Node.js 22.18 or newer. The repository pins the Prisma 8 release candidates used by this MVP and enforces the requirement through `engines` and `.nvmrc`.

Without `DATABASE_URL`, the app still works fully in demo mode. History falls back to the in-memory trail and `/api/health` reports the database as `not_configured`.

## Useful commands

```bash
npm run dev          # local development
npm run lint         # ESLint
npm run typecheck    # strict TypeScript
npm run test         # Vitest unit tests
npm run build        # Prisma generate + production build
npm run start        # production server
npm run prisma:generate # emit Prisma 8 contract artifacts
npm run prisma:migrate  # plan a new migration from the contract
npm run prisma:deploy   # apply pending migrations
npm run prisma:verify   # verify the configured database
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

The browser talks only to AirRadar APIs. `AircraftProvider` is the stable server-side abstraction; `LocalReadsbProvider` and `MockReadsbProvider` implement it. `AircraftStateService` owns the in-memory map, derived distance/bearing, bounded trails, statistics, polling, stale-target cleanup and sampling. SSE coalesces snapshots for slow clients, so a disconnected or slow browser cannot grow a server-side queue.

Optional server-side contracts are defined for `AircraftMetadataProvider`, `FlightRouteProvider`, `FlightPlanProvider`, `ExternalAdsbProvider`, `AtcSectorProvider` and `AtcActivityProvider`. The enrichment cache uses normalized keys, positive/negative TTLs and in-flight request coalescing; no provider is called when no integration is configured. The frontend receives normalized data and never selects a provider.

`Flight` represents a flight instance, not a callsign. A new instance is opened when the callsign changes or the continuity gap is exceeded; the ICAO address remains the aircraft identity and registration/callsign are observations.

The ATC service already models multi-polygon sectors, vertical limits, validity, country, callsign, primary/alternate frequencies and source. Its resolver performs point-in-polygon plus altitude/time matching. The project intentionally does not ship AIP data yet; a future AIP-backed `AtcSectorProvider` can replace the empty provider without changing the resolver or frontend.

The MVP intentionally does not ship populated AIP/FlightAware data, global ADS-B, RTL-airband ingestion, push notifications or coverage heatmaps.
