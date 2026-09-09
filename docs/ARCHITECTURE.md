# Architecture

This document describes the implementation currently in the repository. The
main source files are linked inline; generated Prisma artifacts are outputs,
not schema sources.

## Runtime shape

```text
RTL-SDR / readsb web root
        │  /data/aircraft.json, /data/receiver.json
        ▼
LocalReadsbProvider (or MockReadsbProvider when READSB_BASE_URL is empty)
        ▼
one global AircraftStateService
  ├─ RAM aircraft map, stale cleanup, distance/bearing, bounded live trails
  ├─ async enrichment and ATC resolution
  ├─ async sampled history persistence
  ├─ daily ReceiverStatistics aggregate
  ├─ page-scoped logbook summary read
  ├─ AlertEngine
  │   └─ append-only alert event ledger (`/var/lib/airradar/alert-events.jsonl` in production)
  └─ listeners
        ├─ GET /api/aircraft
        ├─ GET /api/stream (SSE)
        └─ health, statistics, search, watchlist and UI consumers
```

`getAircraftStateService()` stores one service in `globalThis`. `start()` is
idempotent: it loads statistics and starts the first refresh; later refreshes
are scheduled by a single `setTimeout`. `subscribe()` and `waitForReady()` are
the entry points used by routes. The production architecture is intentionally
single-process: multiple Node workers would duplicate polling, alert
evaluation, statistics observation, and history sampling.

The server-side provider boundary is `AircraftProvider`. The configured local
provider fetches the readsb/tar1090 web root; the empty base URL selects the
deterministic demo provider. The frontend never selects a provider.

## Server ownership

`AircraftStateService` owns the live lifecycle and coordinates the following
independent lanes:

- `LocalReadsbProvider` normalizes raw readsb observations into the shared
  `Aircraft` shape. It prefers barometric altitude/rate, retains geometric
  values, and computes distance/bearing from the internal receiver position.
- `EnrichmentService` invokes configured metadata, route, and flight-plan
  providers asynchronously. It uses normalized keys, positive/negative TTLs,
  in-flight coalescing, and bounded concurrency.
- `AtcSectorService` loads one cached sector dataset and matches point,
  altitude, and validity time. Results are attached asynchronously and are
  explicitly estimates.
- `ReceiverStatistics` maintains the current local-day aggregate in RAM and
  persists only changed aggregate, aircraft, and coverage rows.
- `logbook-summary.ts` builds one bounded dashboard response from the current
  day’s Flight identities plus one batched lifetime read. It is requested once
  by the home page and is not part of SSE serialization or the poll loop.
- `history.ts` turns snapshots into `Aircraft`, `Flight`, and
  `FlightPosition` records at the configured sampling interval. It is not a
  per-ADS-B-message log.
- `AlertEngine` evaluates server rules on snapshot transitions and sends
  bounded, asynchronous notifications. It also records detected events and
  notification outcomes separately in a safe append-only JSONL ledger. Durable
  NEW events are accepted only from successful first-Flight history writes;
  reception-record events are compared after persisted statistics startup.

The live snapshot is built from the RAM map and is sorted by distance. A
provider failure clears message-rate availability, removes stale aircraft, and
uses bounded retry backoff; it does not discard still-fresh aircraft or stop
the process.

## Persistence boundaries

PostgreSQL is optional for live operation. When configured, it stores:

- durable `Aircraft` identity/catalog rows and `Flight` instances;
- sampled `FlightPosition` rows with retention cleanup;
- imported `Airport`, `AtcSector`, and `AtcTransmitter` reference data;
- the optional tar1090 `AircraftMetadataCache` and sync state; and
- `ReceiverDailyStats`, `ReceiverDailyAircraft`, and
  `ReceiverDailyCoverage` aggregates. `ReceiverDailyStats` also stores the
  complete V1 maximum-distance record metadata (bearing and registration when
  available); legacy rows without bearing remain valid aggregate statistics,
  not complete reception records.

Process memory holds live aircraft, trails, bounded enrichment caches, ATC
resolver cache, weather cache, photo metadata cache, reception-record
baselines, and alert deduplication. Tar1090 metadata is indexed in PostgreSQL
and only a bounded hot LRU is held in RAM; synchronization streams and
batch-writes the catalog without materializing the dataset in application
memory. The
browser's watchlist is stored in that browser's `localStorage`; server alert
rules are stored in the runtime state directory (`/var/lib/airradar/alerts.json`
in production), not in PostgreSQL. Alert history is stored as append-only safe
event/status lines in `/var/lib/airradar/alert-events.jsonl` in production and
is read from a bounded tail with bounded pagination. Local development keeps
the equivalent files under `data/`; the tracked `data/alerts.json` is only a
legacy migration source when the production state file does not yet exist.

## Browser and API boundary

The browser uses AirRadar APIs only. `toPublicStateSnapshot()` is the full
snapshot boundary for `/api/aircraft`; `toPublicLiveStateSnapshot()` is the
compact SSE boundary. Exact internal receiver
coordinates are rounded, hidden, or published exactly only according to
`PUBLIC_RECEIVER_POSITION_MODE`; raw provider errors are replaced with safe
messages. Request/response routes have bounded per-client fixed-window
limiting. SSE has a separate bounded active-client capacity guard and keeps
only the newest pending snapshot for a slow connection. Full metadata and
flight plans are loaded lazily for selected aircraft; route context needed by
the map remains in the compact live snapshot.

The live map is a MapLibre map with DOM markers keyed by ICAO hex and GeoJSON
overlays. Route visualization is a separate Route V2 namespace. See
[Runtime invariants](RUNTIME-INVARIANTS.md#maplibre-namespaces-and-cleanup)
for the complete ownership list and cleanup contract.

Recap pages are page-scoped reads. They merge the existing daily receiver
aggregates with database-side `Flight` aggregates and bounded first/latest
per-aircraft lifetime lookups; they never read `FlightPosition`, start a
poller, or open an SSE connection. Recap indexes are additive and remain
pending until an explicitly authorized deployment applies them.

## Process lifecycle

Production systemd starts `scripts/start-production.mjs` directly. The wrapper
waits for the production build lock, verifies `.next/BUILD_ID`, registers the
AirRadar shutdown coordinator, disables Next's competing signal handler, and
then starts Next. Shutdown stops the state service and drains history before
closing statistics, provider, and PostgreSQL within the bounded coordinator
deadline. The release procedure is defined only in [RELEASE.md](RELEASE.md).
