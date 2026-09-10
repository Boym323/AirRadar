# AirRadar

AirRadar is a personal dark-mode ADS-B radar for a local [`readsb`](https://github.com/wiedehopf/readsb) receiver. It keeps live aircraft state in RAM, samples history to PostgreSQL, and streams snapshots to the browser over Server-Sent Events (SSE). The map remains useful when optional data sources are unavailable.

## Documentation

The compact agent entry point is [`AGENTS.md`](AGENTS.md). Read it first and
then only the linked document relevant to the task; do not assume the whole
`docs/` tree is required.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ownership and boundaries
- [`docs/DATA-FLOWS.md`](docs/DATA-FLOWS.md) — live, history, statistics, and enrichment flows
- [`docs/RUNTIME-INVARIANTS.md`](docs/RUNTIME-INVARIANTS.md) — behavior and safety contracts
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local work, tests, worktrees, and agents
- [`docs/RELEASE.md`](docs/RELEASE.md) — authoritative production release procedure
- [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) — source provenance, security, and licensing
- [`docs/FEATURES.md`](docs/FEATURES.md) — routes/API and production status

## Quick start — demo mode

Demo mode is automatic when `READSB_BASE_URL` is empty or absent.

```bash
cd /var/www/airradar
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Open <http://localhost:3000>. The mock provider generates moving sample
traffic around the configured receiver position. PostgreSQL is optional in
demo mode; history uses the in-memory trail when it is not configured.

## Connect readsb

Set the base URL of the readsb/tar1090 web root. AirRadar appends the data
paths; do not include `/data/aircraft.json` in the variable.

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
```

The adapter reads `/data/aircraft.json` and optionally `/data/receiver.json`,
preserves raw barometric/geometric fields, and derives altitude/vertical rate,
distance, and bearing. Polling retries with bounded backoff; a receiver outage
does not take down the UI or API.

## ADSB.lol Extended Coverage

AirRadar can optionally add live network coverage from the public
`https://api.adsb.lol` HTTP API. It uses the documented geographic endpoint
`/v2/lat/{latitude}/lon/{longitude}/dist/{radius_nm}`; the current public
OpenAPI schema caps the radius at 250 NM. AirRadar never uses `re-api`, BEAST,
or a direct ADSB.lol TCP stream.

Enable it only alongside a configured real readsb receiver:

```dotenv
ADSBLOL_ENABLED=true
ADSBLOL_BASE_URL=https://api.adsb.lol
ADSBLOL_RADIUS_NM=250
ADSBLOL_POLL_INTERVAL_MS=10000
ADSBLOL_REQUEST_TIMEOUT_MS=4000
ADSBLOL_STALE_AFTER_MS=30000
ADSBLOL_MAX_RETRY_INTERVAL_MS=60000
ADSBLOL_MAX_AIRCRAFT=3000
```

The default is conservative: one server-side poll every 10 seconds, bounded
to 3,000 aircraft, with a 4-second timeout. The server uses the precise
receiver coordinates for the upstream query, while the existing public
receiver-coordinate privacy mode remains unchanged.

The radar defaults to `LOCAL`, showing only observations from the local
receiver. `EXTENDED` combines local and network observations by normalized
ICAO identity, shows a single aircraft marker, and labels the selected
position source. Freshness is considered before source priority, so a fresh
local observation wins when appropriate and a fresh ADSB.lol position can
temporarily replace a stale local position. Network trails remain bounded and
in memory.

Network observations are not local receiver evidence: they are never written
to `FlightPosition`, never create local `Flight` history, never affect daily
receiver statistics or reception records, and never use network RSSI/message
counts as local measurements. Existing local enrichment, ATC matching, and
default push-alert semantics remain local-only; network-only aircraft do not
trigger an enrichment fan-out or push notification.

The public API is dynamically rate-limited. AirRadar sends no per-browser
requests, never overlaps ADSB.lol requests, honors `Retry-After` on HTTP 429,
and otherwise uses bounded backoff up to `ADSBLOL_MAX_RETRY_INTERVAL_MS`.
Failed polls keep the last valid network snapshot until the stale timeout;
local radar, history, and statistics continue independently. `/system` shows
the network provider status, last attempt/success, latency, aircraft and MLAT
counts, polling interval, radius, and rate-limit state.

Smoke test the public endpoint with operator-supplied coordinates (do not put
the private receiver location in documentation):

```bash
curl -sS 'https://api.adsb.lol/v2/lat/LAT/lon/LON/dist/100' | jq '.total'
```

ADSB.lol publishes its API and public data under ODbL 1.0. Keep the in-app
ADSB.lol attribution and comply with the current [ODbL terms](https://opendatacommons.org/licenses/odbl/1-0/).

## PostgreSQL

The schema source is `prisma/contract.prisma`; checked-in forward migrations
are under `migrations/app/`. Live state is not written for every ADS-B update:
the service samples positions and stores `Aircraft`, `Flight`, and
`FlightPosition` records. Daily receiver statistics, airport/ATC reference
data, and the optional aircraft metadata catalog have separate tables. See
[`docs/DATA-FLOWS.md`](docs/DATA-FLOWS.md) and
[`docs/RUNTIME-INVARIANTS.md`](docs/RUNTIME-INVARIANTS.md) for persistence
semantics.

```bash
createdb airradar
# Set DATABASE_URL in .env
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Without `DATABASE_URL`, live radar remains available and `/api/health` reports
the database as `not_configured`.

## Optional integrations

All optional providers are server-side, bounded, and isolated from readsb
polling. Configure them in the server-only `.env`; never use
`NEXT_PUBLIC_*` for credentials.

| Capability | Configuration | Default |
| --- | --- | --- |
| ADSBDB metadata/routes | `ADSBDB_ENABLED=true` | Disabled |
| tar1090 aircraft catalog | `AIRCRAFT_METADATA_URL` when using a tar1090 root | Best effort, daily conditional sync |
| FlightAware flight plans | `FLIGHTAWARE_API_KEY` | Disabled; commercial/possibly billable |
| AviationWeather.gov METAR/TAF/SIGMET | No key; server-side AWC integration | Disabled; opt-in |
| Planespotters aircraft photos | `AIRCRAFT_PHOTOS_ENABLED=true` | Disabled |
| Server alerts/Pushover | `/var/lib/airradar/alerts.json` in production, `PUSHOVER_ENABLED=true` plus server credentials | Rules/no-op notifier until explicitly configured |

Source, licensing, URL allowlists, cache behavior, and operational limits are
in [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md). Route airport metadata is
resolved through the PostgreSQL catalog, then valid provider coordinates, then
the small bundled fallback catalog.

### Aviation Weather

The optional Aviation Weather integration is server-side only and uses the
official Aviation Weather Center APIs. Enable it explicitly:

```bash
AVIATION_WEATHER_ENABLED=true
AVIATION_WEATHER_USER_AGENT="AirRadar/<version> (+https://example.invalid/contact)"
```

`/api/weather/airport/:icao` and the bounded batch form
`/api/weather/airport?icao=ICAO1,ICAO2` expose canonical-ICAO METAR/TAF data;
`/api/weather/sigmet` exposes current worldwide international SIGMETs plus the
CONUS domestic dataset. The radar SIGMET layer is off by default and loads only
after the operator enables it. Flight-detail weather requests the destination
first and then the origin in one batch request.

The provider uses HTTPS AWC endpoints, a custom User-Agent, bounded timeout,
per-product TTLs (METAR 5 minutes, TAF 10 minutes, SIGMET 5 minutes), bounded
RAM-only caches, negative caching, in-flight coalescing, stale-if-error,
`Retry-After` backoff, and safe handling of `204 No Content`. It never writes
weather to PostgreSQL, changes aircraft SSE payloads, delays readsb, or feeds
history/statistics. Public responses contain canonical normalized fields only;
upstream errors and credentials are not serialized. The provider is subject to
AWC's published request and result limits, so production UI fetches are
on-demand and the SIGMET layer refreshes at a bounded cadence.

Operational counters and cache/provider state are visible on `/system`. See
[`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) for provenance and the complete
configuration list.

## ATC and airport data

Sample ATC is automatic only in demo mode. With a real receiver, imported
PostgreSQL data is used unless `ATC_SAMPLE_ENABLED=true` is explicitly set.
ATC assignments are probable position/altitude/time matches and never claim
the aircraft's actual tuned frequency.

```bash
npm run airports:import -- --dry-run
npm run airports:import
npm run airports:sync -- --dry-run
npm run airports:sync
# reproducible local input:
npm run airports:sync -- --dir ./data/ourairports --dry-run
npm run atc:import -- --dry-run data/atc/cz-atc.json
npm run atc:import -- data/atc/cz-atc.json
npm run atc:sync:cz -- --dry-run
npm run atc:sync:cz
npm run atc:status:cz
```

`airports:sync` downloads the current official OurAirports open-data files
(`airports.csv`, `runways.csv`, `airport-frequencies.csv`, and `navaids.csv`)
with a timeout and AirRadar User-Agent, validates all headers and rows before
opening one database transaction, and supports `--dry-run`. Runways and
frequencies are limited to the selected AirRadar airport catalog; navaids are
kept worldwide. A failed or undersized feed cannot prune existing
infrastructure. The existing `airports:import` remains a backward-compatible
core-only importer and never deletes airport rows.

Airport infrastructure data: OurAirports, Public Domain. The data is
community-sourced and has no guarantee of accuracy or fitness for use. AirRadar
is an informational/reference display, not a certified navigation database;
verify operational aviation data with official sources.

The import and Czech eAIP boundary rules are documented in
[`data/atc/README.md`](data/atc/README.md) and
[`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md). AIM/eAIP, ČÚZK Data50, and BKG
VG25 are sync-time inputs; the live service has no dependency on those hosts.

## Alerts and watchlists

The `/watchlist` page and `/api/watchlist` manage shared server alert rules in
`/var/lib/airradar/alerts.json` in production (`data/alerts.json` locally);
updates are validated and atomically written. Rules support
ICAO hex, registration, callsign, callsign pattern, aircraft type, airline,
and optional maximum distance. Alert transitions use one server-wide cooldown
and bounded asynchronous notification delivery.

The live map's browser watchlist is a separate `localStorage` filter. It is
not a shared server rule and does not send notifications.

## Useful commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:targeted -- tests/aircraft-state.test.ts
npm run test:changed
npm test                         # complete Vitest suite
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:verify
npm run start
```

Use [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for targeted/changed/full
testing and [`docs/RELEASE.md`](docs/RELEASE.md) for production validation.

## Public deployment and security

The configured production hostname is <https://airradar.pomykal.cz>.
The public API is same-origin; no wildcard CORS policy is enabled. Exact
receiver coordinates remain server-side by default. Set
`PUBLIC_RECEIVER_POSITION_MODE` to `approximate` (default), `hidden`, or
`exact` only when deliberately publishing the location. Public DTOs replace
raw provider errors and never expose secrets.

Request/response APIs use bounded fixed-window limiting; `/api/stream` is
excluded so SSE heartbeat/coalescing is not interrupted. The proxy must use
HTTP/1.1, disable buffering/cache for SSE, and set a long read timeout. See
[`deploy/README.md`](deploy/README.md) for systemd installation and the full
Nginx Proxy Manager configuration.

## Production deployment

The service runs as the unprivileged `airradar` user. The systemd unit starts
`scripts/start-production.mjs` directly so systemd tracks the actual Node/Next
process; the wrapper registers graceful shutdown ownership and waits for a
complete build. Do not use `npm run start` as a replacement for the production
unit without understanding that lifecycle contract.

Normal releases use [`deploy/release.sh`](deploy/release.sh), whose
authoritative procedure is [`docs/RELEASE.md`](docs/RELEASE.md). It performs
the full quality gates, migrations, restart, local/public health checks, and
only then creates the automatic version tag. During the release it also
generates [`CHANGELOG.md`](CHANGELOG.md) from commits since the previous
release tag and commits the generated section. It never runs as part of
ordinary development or documentation work.

## Architecture summary

```text
RTL-SDR / readsb → LocalReadsbProvider → AircraftStateService RAM
                 → SSE → Next.js / MapLibre UI
                 → sampled positions → PostgreSQL
```

For the complete current implementation, read
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/RUNTIME-INVARIANTS.md`](docs/RUNTIME-INVARIANTS.md).
