# AirRadar Agent Guide

## Project purpose

AirRadar is a private ADS-B radar backed by a local `readsb` receiver.

Primary flow:

```text
RTL-SDR / readsb
→ LocalReadsbProvider
→ AircraftStateService RAM
→ SSE
→ Next.js / MapLibre UI
```

History flow:

```text
AircraftStateService
→ sampled positions
→ PostgreSQL
```

Keep this file as compact execution context for coding agents; human-facing
technical documentation is in `README.md`.

## Production and runtime

These are deployment conventions used by the current installation; they are not all defined by repository files:

- Production URL: `https://airradar.pomykal.cz`
- Application path: `/var/www/airradar`
- Runtime: Debian LXC
- Process manager: systemd
- Reverse proxy: Nginx Proxy Manager
- Database: PostgreSQL
- Live source: real `readsb` receiver
- Default UI locale: `cs-CZ`
- Timezone: `Europe/Prague`

Repository-backed deployment artifacts are in `deploy/`. The service runs as the unprivileged `airradar` user and binds Next.js to the production LAN address `192.168.1.142:3000` for the separate reverse proxy.
Normal production releases use `deploy/release.sh`; bypass it only for debugging or recovery.

## Tech stack

- Next.js App Router, React, TypeScript
- MapLibre GL and Tailwind CSS
- PostgreSQL with the Prisma 8 contract workflow
- Server-Sent Events (SSE)
- Vitest
- Node.js `>=22.18.0`, npm `>=10`

## Architecture

- `AircraftProvider` is the server-side provider boundary. The live provider
  is `LocalReadsbProvider`; empty `READSB_BASE_URL` selects the mock provider.
- `AircraftStateService` owns live state in RAM, polling, stale cleanup,
  derived distance/bearing, bounded trails, statistics, enrichment updates,
  ATC resolution, and history sampling.
- The browser consumes AirRadar APIs only. `/api/stream` publishes snapshots
  over SSE; it is intentionally not a WebSocket endpoint.
- PostgreSQL stores sampled history and imported ATC/airport data, not every
  ADS-B update. Live radar must remain useful without PostgreSQL.
- Optional enrichment is server-side and isolated from the readsb polling loop.

## Sources of truth

Prefer the relevant source below instead of searching for duplicated details:

- Human technical documentation: `README.md`
- Environment options: `.env.example`
- Database schema: `prisma/contract.prisma`
- Prisma target and contract output: `prisma.config.ts`
- Database migrations: `migrations/app/`
- Production code: `app/`, `components/`, `lib/`
- User-facing translations: `lib/i18n/`
- Deployment artifacts and proxy/service notes: `deploy/`
- API routes: `app/api/`

Generated files under `generated/` are outputs, not the database schema source of truth. Do not copy complete schemas, API payloads, env files, routes, or test inventories into this guide.

## Core invariants

- ICAO hex is aircraft identity. Callsign is an observation and may change.
- A `Flight` is a flight instance, not a callsign.
- On a continuity gap, close the old flight with `endTime = old lastSeenAt`;
  do not move the old `lastSeenAt` forward. Open the new flight at current
  `recordedAt`.
- On an immediate callsign change, preserve the current implementation: close
  the old instance at current `recordedAt` and open a new instance.
- Derived altitude and vertical rate prefer barometric, then geometric
  fallback; preserve raw barometric and geometric values.
- Live aircraft state belongs in RAM. PostgreSQL stores sampled history, not
  every ADS-B update.
- PostgreSQL or optional enrichment failure must not stop live radar. One slow
  or disconnected SSE client must not affect other clients.
- SSE delivery is bounded/coalesced: slow clients keep only the latest pending
  snapshot rather than building an unbounded queue.
- ATC assignment is probable, based on position/altitude/time; never claim the
  aircraft's actual tuned frequency.
- Sample ATC data is automatic only in demo mode. With a real receiver it must
  be explicitly enabled and never appear silently.
- Imported ATC rows retain source/reference, validity and last-verification
  provenance; `data/atc/` and `npm run atc:import` are the import workflow
  sources.
- Public APIs must not expose exact receiver coordinates unless explicitly
  configured; internal receiver coordinates remain exact for calculations.
- Public DTOs must not contain secrets, raw provider errors, or other internal
  connection details.
- SSE must not be broken by rate limiting or security middleware; preserve
  bounded/coalesced delivery and heartbeat behavior.

## Data providers

### readsb

`LocalReadsbProvider` expects the readsb/tar1090 web-root base URL and reads:

- `/data/aircraft.json`
- `/data/receiver.json`

Do not put either data file path into `READSB_BASE_URL`. The adapter prefers barometric over geometric values while retaining both raw values.

### ADSBDB

Optional, keyless enrichment; enable with `ADSBDB_ENABLED=true`. Metadata is keyed by ICAO hex; route data is keyed by normalized callsign and UTC date. The total concurrency budget for the same ADSBDB provider instance is `6`. Failures and misses are cached and must not break live polling.

### FlightAware

Optional commercial enrichment. It is disabled when `FLIGHTAWARE_API_KEY` is empty and should not be enabled by default. The key is server-side only and requests may incur charges. Concurrency budget is `2`. Route waypoint lookup is best-effort; a `/route` failure must not discard basic FlightPlan data.

## Database and migrations

- `prisma/contract.prisma` is the schema source of truth.
- `prisma.config.ts` defines the Prisma 8 PostgreSQL workflow.
- Use checked-in migrations under `migrations/app/`; the current app migration
  is `migrations/app/20260906T1546_initial/`.
- Generated contract artifacts are disposable outputs and are ignored by git.
- Never reset, recreate, or destructively migrate a production database unless
  explicitly requested.

## Localization

- User-facing UI is Czech by default (`cs-CZ`). Centralize UI strings in `lib/i18n/`; use an existing translation key instead of hardcoding a label.
- Source code, API names, database schema, environment variable names, server
  logs, and technical documentation are English.
- Do not forcibly translate established technical terms such as `ADS-B`,
  `MLAT`, `TIS-B`, `ICAO`, `IATA`, `ATC`, `Squawk`, `RSSI`, `readsb`,
  `ADSBDB`, and `FlightAware`.

## Security and operations

- Keep secrets only in server-side `.env`; never put them in `NEXT_PUBLIC_*` variables.
- Never commit a real `.env`, credentials, database URLs, or API keys.
- `FLIGHTAWARE_API_KEY` is server-side only. Public APIs may expose receiver
  and live-radar information, so security changes require deliberate review.
- For full systemd, Nginx Proxy Manager, and SSE proxy settings, see
  `README.md` and `deploy/README.md`.

## Do not change casually

Do not replace or redesign these without a concrete requirement:

- SSE with WebSockets
- MapLibre or the provider abstractions
- RAM live-state architecture
- Prisma contract workflow
- PostgreSQL sampled-history model
- `lib/i18n/` structure

Do not add Redis, Redux, queues, microservices, or another framework merely as
preventive architecture. A GeoJSON/MapLibre symbol-layer marker optimization
is a future profiling-led change, not a default redesign.

## Quality gates

Run the relevant checks and report exactly what ran:

```bash
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm ci` in a clean environment or before a complete dependency check.
Never claim a gate passed unless it was actually run. If a gate cannot run,
state that clearly.

## Documentation maintenance

Update `AGENTS.md` only when a durable architectural, operational, or
development rule changes. Do not turn it into a changelog; omit temporary
bugs, one-off fixes, commit SHAs, test counts, and incidental implementation
details.

- Env variable change: update `.env.example` and, when user-relevant,
  `README.md`.
- Architecture change: update `README.md`; update this guide if a durable
  invariant or source of truth changes.
- UI translation structure: update this guide only when its rules or source of
  truth changes.
- API change: update the API section in `README.md`.
- Database schema change: update the contract and migrations; update README
  only when the architectural use of the database changes.

`README.md` remains complete human-facing documentation; `AGENTS.md` remains compact agent context and points to sources of truth.
