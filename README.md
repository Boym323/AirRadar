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

Set the base URL of the readsb/tar1090 web root. AirRadar reads `/data/aircraft.json` and optionally `/data/receiver.json`. When the web root is tar1090, it also discovers and reads tar1090's hashed static aircraft database to fill registration, ICAO type code and type description:

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

## Public deployment / security

The public API uses same-origin access; no wildcard CORS policy is enabled. The
receiver's exact coordinates are kept server-side for distance, bearing and
coverage calculations, but are not exposed by default. Set
`PUBLIC_RECEIVER_POSITION_MODE` to `approximate` (default, deterministic
two-decimal coordinates), `hidden` (no public receiver coordinates), or
`exact` only when deliberately publishing the location. Aircraft positions are
not redacted.

Application responses include `nosniff`, strict referrer and permissions
policies, clickjacking protection and a CSP that permits the MapLibre blob
worker and OpenStreetMap tiles. Live endpoints are not cached; catalog data is
short-lived cacheable data. Public response errors are generic and secrets stay
server-side.

The request-response API endpoints have a small bounded in-memory fixed-window
limiter per endpoint: aircraft 60/minute, history 30/minute, airports
30/minute, ATC sectors 30/minute and health 60/minute. It is intentionally
global to this single Node instance rather than trusting `X-Forwarded-For` from
the reverse proxy. `/api/stream` is excluded so long-lived SSE connections and
their heartbeat/coalescing behavior are not interrupted. The limiter is not a
replacement for an upstream network policy; if Nginx Proxy Manager is used for
additional limiting, apply it at the server/http layer and exempt
`/api/stream`.

## PostgreSQL and Prisma

Live state is never written on every ADS-B update. The state service samples each aircraft at the configured interval (20 seconds by default), writes positions with bounded concurrency, and stores `Aircraft`, `Flight`, and `FlightPosition` records. `HISTORY_RETENTION_DAYS` (30 by default) removes old position samples periodically.

Persistence boundaries are intentional:

| Data | Storage | Restart behavior |
| --- | --- | --- |
| `Aircraft`, `Flight`, `FlightPosition` and sampled history | PostgreSQL | Persistent; never reset by AirRadar startup |
| `AircraftMetadataCache` and `AircraftMetadataSync` | PostgreSQL | Persistent catalog; refreshed at most once per day with conditional HTTP validation |
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
| Aircraft metadata | tar1090 static database + PostgreSQL cache | Automatic when `READSB_BASE_URL` points to a tar1090 web root; daily catalog sync uses `AIRCRAFT_METADATA_URL` | Local metadata; no key |
| Aircraft metadata | [ADSBDB](https://github.com/mrjackwills/adsbdb) | `ADSBDB_ENABLED=true` and optional `ADSBDB_BASE_URL` | Free community API, no key |
| Callsign airline and origin/destination | ADSBDB | Same as above | Free community API, no key |
| Scheduled/actual/estimated times, filed route and waypoints | [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/v4/documentation) | `FLIGHTAWARE_API_KEY=…` | Optional commercial service; key stays server-side |
| ATC sectors and transmitters | Demo constants / PostgreSQL import | `ATC_SAMPLE_ENABLED` | Demo sample only; production uses an explicitly synced authoritative dataset |

ADSBDB lookups are keyed by ICAO hex or callsign and cached for hours to a day; the cache coalesces concurrent requests and negatively caches misses, so the provider is not queried on every realtime update. FlightAware is disabled when `FLIGHTAWARE_API_KEY` is empty. Missing keys therefore do not reduce live radar functionality. Route lines are schematic references, not filed flight plans; the orange solid trail is the observed ADS-B trail.

The tar1090 metadata lookup is best-effort and uses a PostgreSQL catalog mirrored in RAM. The catalog checks `AIRCRAFT_METADATA_URL` once per day (with ETag validation) and keeps the previous dataset when GitHub is unavailable. The local tar1090 `databaseFolder` blocks remain an immediate fallback when PostgreSQL or the catalog is unavailable. If the configured page is plain readsb, AirRadar continues with the fields present in `aircraft.json`. When both tar1090 metadata and ADSBDB are enabled, non-empty fields from ADSBDB take precedence and missing fields are filled from the local catalog/fallback.

For the first production deployment, keep `FLIGHTAWARE_API_KEY=` empty. If a key is configured later, the current architecture can request flight plans for currently tracked aircraft that have a callsign; these are AeroAPI requests and may incur commercial charges. The key is used only server-side. The optional FlightAware route lookup is best-effort, so a route failure does not discard the basic flight-plan times or filed route.

`APP_TIMEZONE` controls the local day used by live daily statistics and defaults to `Europe/Prague`.

## Localization

The user interface defaults to Czech (`cs-CZ`).
Visible UI strings are centralized under `lib/i18n`.
Source code, API names, database schema and technical documentation remain in English.

The database contract includes `Airport`, `AtcSector` and `AtcTransmitter` models. The bundled ATC layer is explicitly demo-only (`AirRadar sample data`) and is selected only without `READSB_BASE_URL` (or with the explicit `ATC_SAMPLE_ENABLED=true`). In production set `ATC_SAMPLE_ENABLED=false`; `/api/atc/sectors` and the resolver then use imported PostgreSQL data, or an empty layer if no verified dataset has been imported. Store sector rings as JSON `[[[lon, lat], ...]]` in `AtcSector.polygonJson` and alternate frequencies as JSON `[{"frequencyMhz": 127.35, "label": "..."}]` in `alternateFrequenciesJson`, with source, altitude reference and validity recorded on each row. The current Czech AIP-derived dataset is generated locally by the explicit sync workflow and is not bundled.

ATC reference data can be loaded from the versioned JSON format documented in
[`data/atc/README.md`](data/atc/README.md):

```bash
npm run atc:import -- --dry-run data/atc/cz-atc.json
npm run atc:import -- data/atc/cz-atc.json
```

The importer validates the complete document before writing, normalizes
`SFC`/`FLxxx`/`UNL` altitude semantics, preserves aviation frequency precision,
and commits sector/transmitter upserts plus same-source obsolescence in one
transaction. Every imported row retains source name, reference, effective
validity, altitude reference and last-verification metadata. It never changes
aircraft history.
The resolver cache is process-local; restart the service after an import.
ATC matches are always probable candidates based on position, normalized
barometric/geometric altitude and UTC validity. ADS-B does not report the
aircraft's actual tuned ATC frequency.

For Czech ACC data, use the official eAIP sync rather than a hand-maintained
snapshot:

```bash
npm run atc:sync:cz -- --dry-run
npm run atc:sync:cz
npm run atc:status:cz
```

The sync obtains ENR 2.1 from AIM ŘLP ČR, discovers the effective date and
published AIP/AIRAC amendment metadata, and has no runtime dependency on AIM.
For a lateral `state boundary` construct, ENR 2.1 remains authoritative for
the sector meaning, endpoints, ordering, vertical limits, callsign and
frequencies; the missing boundary polyline is resolved from the official
[ČÚZK Data50 service](https://ags.cuzk.gov.cz/arcgis/rest/services/DATA50/MapServer)
and its [metadata record](https://geoportal.gov.cz/php/micka/record/basic/CZ-CUZK-DATA50-V?dlang=eng).
The sync fetches that dataset once, uses a bounded endpoint snap and a
connected state-boundary graph (including the Germany–Poland tripoint), and
fails on ambiguity, disconnection, excessive snap distance or invalid
polygon geometry. It never creates a straight-line or other guessed
boundary; if the authoritative path intersects a generalized AIP walk, the
walk is polygonized into validated rings without adding geometry. Data50 is
attributed as ČÚZK Data50 under [CC BY 4.0](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx). AIM and ČÚZK
are sync-time sources only; live radar has no runtime dependency on either.
The complete parse, geometry resolution and validation finish before the
transaction, so a failed source or unresolved boundary leaves the database
unchanged.

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
npm run atc:import -- --dry-run data/atc/cz-atc.json # validate/preview ATC data
npm run atc:sync:cz -- --dry-run # preview current official Czech ACC data
npm run atc:status:cz # compare imported Czech effective date with AIM
```

## API

- `GET /api/aircraft` — current state snapshot
- `GET /api/stream` — SSE stream of `snapshot` events
- `GET /api/history/:hex` — PostgreSQL history or RAM trail fallback
- `GET /api/airports` — configured airport catalog or bundled fallback catalog
- `GET /api/atc/sectors` — ATC sector and transmitter map data
- `GET /api/health` — application, database, readsb, ATC dataset and live-state health

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

The script acquires a release lock, rejects tracked or staged working-tree changes, updates the current branch with a fast-forward-only Git operation, runs `npm ci`, Prisma generation, lint, typecheck, tests, Prisma migrations and the production build, then restarts `airradar.service` and checks local and public health. To test and release uncommitted changes, use `sudo ./deploy/release.sh --allow-dirty`; this preserves the current working tree and skips the update from `origin` to avoid overwriting or conflicting with local changes. Use `sudo ./deploy/release.sh --dry-run` to run preflight checks and print the plan without changing the checkout or service. A non-`main` checkout must be explicitly selected with `--branch`.

The script does not automatically roll back Git code or database migrations after a post-restart failure. This avoids returning code to a state that may be incompatible with an already-applied migration; inspect the diagnostics and perform a compatibility-aware recovery manually.

For emergency diagnostics:

```bash
sudo systemctl status airradar
sudo journalctl -u airradar -n 100 --no-pager
```

Configure Nginx Proxy Manager to proxy the public hostname to `192.168.1.142:3000`. AirRadar uses SSE, not WebSocket. In the Proxy Host **Advanced** field (directives are applied inside the proxy location), use:

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
client_max_body_size 1m;
```

The application does not use forwarded headers as a client identity for rate
limiting. Nginx Proxy Manager's location-level Advanced field cannot safely
declare a shared `limit_req_zone`; configure any extra proxy rate limit in the
appropriate server/http context and keep `/api/stream` exempt.

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
