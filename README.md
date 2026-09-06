# AirRadar

AirRadar is a personal, dark-mode ADS-B radar UI for a local [`readsb`](https://github.com/wiedehopf/readsb) receiver. It keeps the live aircraft state in RAM, samples history to PostgreSQL, and streams snapshots to the browser over Server-Sent Events (SSE). The map remains usable on desktop, iPhone and Android when optional data sources are unavailable.

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

Set the base URL of the readsb/tar1090 web root. AirRadar reads `/data/aircraft.json` and optionally `/data/receiver.json`:

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
```

For a tar1090 installation mounted below a path, include that path, for example
`http://192.168.1.50/tar1090`; do not include `/data/aircraft.json` in
`READSB_BASE_URL`. The adapter preserves the readsb fields `alt_baro`,
`alt_geom`, `baro_rate`, `geom_rate`, `seen`, `seen_pos`, `category`,
`messages`, and `rssi`. It exposes the derived `altitude`/`verticalRate` as
well as the individual values, and maps readsb `type` to a display source while
retaining the exact value as `sourceType`.

The polling loop retries automatically. If readsb goes away, the UI and API stay alive and report `Receiver offline`.

## PostgreSQL and Prisma

Live state is never written on every ADS-B update. The state service samples each aircraft at the configured interval (20 seconds by default), writes positions with bounded concurrency, and stores `Aircraft`, `Flight`, and `FlightPosition` records. `HISTORY_RETENTION_DAYS` (30 by default) removes old position samples periodically.

Persistence boundaries are intentional:

| Data | Storage | Restart behavior |
| --- | --- | --- |
| `Aircraft`, `Flight`, `FlightPosition` and sampled history | PostgreSQL | Persistent; never reset by AirRadar startup |
| ADSBDB / FlightAware enrichment cache | Process memory with TTL and negative caching | Rebuilt after restart; live radar is independent |
| Watchlist rules | Browser `localStorage` | Persists in that browser; not a shared database list |
| Live statistics | Process memory, derived from current process observations | Rebuilt after restart; historical positions remain in PostgreSQL |
| ATC data | Sample constants in demo; PostgreSQL `AtcSector`/`AtcTransmitter` in production | Sample is never used for a configured real receiver |

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

## Optional enrichment and ATC data

The integrations below are optional. A provider failure is negatively cached and never stops the readsb polling loop:

| Capability | Provider | Configuration | Cost / key |
| --- | --- | --- | --- |
| Aircraft metadata | [ADSBDB](https://github.com/mrjackwills/adsbdb) | `ADSBDB_ENABLED=true` and optional `ADSBDB_BASE_URL` | Free community API, no key |
| Callsign airline and origin/destination | ADSBDB | Same as above | Free community API, no key |
| Scheduled/actual/estimated times, filed route and waypoints | [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/v4/documentation) | `FLIGHTAWARE_API_KEY=…` | Optional commercial service; key stays server-side |
| ATC sectors and transmitters | Demo constants / PostgreSQL import | `ATC_SAMPLE_ENABLED` | Demo sample only; production requires a maintained/licensed AIP dataset |

ADSBDB lookups are keyed by ICAO hex or callsign and cached for hours to a day; the cache coalesces concurrent requests and negatively caches misses, so the provider is not queried on every realtime update. FlightAware is disabled when `FLIGHTAWARE_API_KEY` is empty. Missing keys therefore do not reduce live radar functionality. Route lines are schematic references, not filed flight plans; the orange solid trail is the observed ADS-B trail.

For the first production deployment, keep `FLIGHTAWARE_API_KEY=` empty. If a key is configured later, the current architecture can request flight plans for currently tracked aircraft that have a callsign; these are AeroAPI requests and may incur commercial charges. The key is used only server-side. The optional FlightAware route lookup is best-effort, so a route failure does not discard the basic flight-plan times or filed route.

`APP_TIMEZONE` controls the local day used by live daily statistics and defaults to `Europe/Prague`.

## Localization

The user interface defaults to Czech (`cs-CZ`).
Visible UI strings are centralized under `lib/i18n`.
Source code, API names, database schema and technical documentation remain in English.

The database contract includes `Airport`, `AtcSector` and `AtcTransmitter` models. The bundled ATC layer is explicitly demo-only (`AirRadar sample data`) and is selected only without `READSB_BASE_URL` (or with the explicit `ATC_SAMPLE_ENABLED=true`). In production set `ATC_SAMPLE_ENABLED=false`; `/api/atc/sectors` and the resolver then use imported PostgreSQL data, or an empty layer if no verified dataset has been imported. Store sector rings as JSON `[[[lon, lat], ...]]` in `AtcSector.polygonJson` and alternate frequencies as JSON `[{"frequencyMhz": 127.35, "label": "..."}]` in `alternateFrequenciesJson`, with the source and validity interval recorded on each row. No Czech AIP import is bundled.

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
- `GET /api/airports` — configured airport catalog or bundled fallback catalog
- `GET /api/atc/sectors` — ATC sector and transmitter map data
- `GET /api/health` — application, database, readsb and live-state health

## Production deployment

`deploy/airradar.service` is a systemd unit for `/var/www/airradar`. Put the production `.env` in the project directory and install the unit during initial setup:

```bash
sudo cp deploy/airradar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
```

For normal production releases, use the release script from the application directory:

```bash
cd /var/www/airradar
sudo ./deploy/release.sh
```

The script acquires a release lock, rejects tracked or staged working-tree changes, updates the current branch with a fast-forward-only Git operation, runs `npm ci`, Prisma generation, lint, typecheck, tests, Prisma migrations and the production build, then restarts `airradar.service` and checks local and public health. Use `sudo ./deploy/release.sh --dry-run` to run preflight checks and print the plan without changing the checkout or service. A non-`main` checkout must be explicitly selected with `--branch`.

The script does not automatically roll back Git code or database migrations after a post-restart failure. This avoids returning code to a state that may be incompatible with an already-applied migration; inspect the diagnostics and perform a compatibility-aware recovery manually.

For emergency diagnostics:

```bash
sudo systemctl status airradar
sudo journalctl -u airradar -n 100 --no-pager
```

Configure Nginx Proxy Manager to proxy the public hostname to `127.0.0.1:3000`. AirRadar uses SSE, not WebSocket. In the Proxy Host **Advanced** field (directives are applied inside the proxy location), use:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

`/api/stream` already sends `Content-Type: text/event-stream`,
`Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and
`X-Accel-Buffering: no`. WebSocket support is not required for this endpoint.

## Architecture

The browser talks only to AirRadar APIs. `AircraftProvider` is the stable server-side abstraction; `LocalReadsbProvider` and `MockReadsbProvider` implement it. `AircraftStateService` owns the in-memory map, derived distance/bearing, bounded trails, statistics, polling, stale-target cleanup and sampling. SSE coalesces snapshots for slow clients, so a disconnected or slow browser cannot grow a server-side queue.

Optional server-side contracts are defined for `AircraftMetadataProvider`, `FlightRouteProvider`, `FlightPlanProvider`, `ExternalAdsbProvider`, `AtcSectorProvider` and `AtcActivityProvider`. The enrichment cache uses normalized keys, positive/negative TTLs and in-flight request coalescing; no provider is called when no integration is configured. The frontend receives normalized data and never selects a provider.

`Flight` represents a flight instance, not a callsign. A new instance is opened when the callsign changes or the continuity gap is exceeded; the ICAO address remains the aircraft identity and registration/callsign are observations.

The ATC service models multi-polygon sectors, vertical limits, validity, country, callsign, service, primary/alternate frequencies and source. Its resolver performs point-in-polygon plus altitude/time matching and reports a probable sector only. It never claims to know the aircraft’s actually tuned frequency.

The project intentionally does not claim a definitive AIP dataset, actual tuned radio frequency, global ADS-B coverage, RTL-airband ingestion, push notifications or coverage heatmaps.

For receivers regularly tracking several hundred aircraft, review mobile performance before replacing DOM markers; the next targeted optimization would be a GeoJSON source with a MapLibre symbol layer.
