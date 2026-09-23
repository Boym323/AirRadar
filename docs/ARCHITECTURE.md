# Architecture

This document describes the implementation currently in the repository. The
main source files are linked inline; generated Prisma artifacts are outputs,
not schema sources.

## Runtime shape

The Flight Story read boundary (`lib/server/flight-story.ts`) is a separate
read-only composition over history tables and is not connected to live polling
or intelligence write lanes.

```text
RTL-SDR / readsb web root
        │  /data/aircraft.json, /data/receiver.json
        ▼
LocalReadsbProvider (or MockReadsbProvider when READSB_BASE_URL is empty)
        ▼
one global AircraftStateService
  ├─ RAM aircraft map, stale cleanup, distance/bearing, bounded live trails
  ├─ optional NetworkFailoverProvider: ADSBHub SBS/30003 + ADSB.lol raw + HTTP
  │    └─ bounded network RAM map (deduplicated union across sources)
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

Receiver coverage analytics is a separate bounded derived lane. Its sampler
reads the local and active network RAM maps, persists only hourly aggregate
counters, and never writes network aircraft to history, local statistics,
FlightPosition, alerts, or trails.

`getAircraftStateService()` stores one service in `globalThis`. `start()` is
idempotent: it loads statistics and starts the first local and network refresh;
the two lanes schedule their later refreshes independently. `subscribe()` and
`waitForReady()` are the entry points used by routes. The production
architecture is intentionally single-process: multiple Node workers would
duplicate polling, alert evaluation, statistics observation, and history
sampling.

The server-side provider boundary is `AircraftProvider`. The configured local
provider fetches the readsb/tar1090 web root; the empty base URL selects the
deterministic demo provider. The frontend never selects a provider.
`NetworkAircraftProvider` is a separate optional boundary for live-only
coverage. `AdsbHubProvider` consumes the generic aggregated SBS/30003 stream
from `data.adsbhub.org:5002`; these rows are not classified as MLAT. The
All enabled network lanes run concurrently and are deduplicated by normalized
ICAO hex with network-source provenance retained.
`AdsbLolRawProvider` consumes the two authorized outbound ADSB.lol streams,
decodes global CPR, and merges BEAST and SBS/MLAT by ICAO.
`AdsbLolProvider` keeps its validated snapshot in RAM. Neither lane enters the local history,
statistics, alert, enrichment, or ATC input lanes.

`OgnProvider` and `OgnStateService` form a second optional live-only boundary.
They are server-side singletons in the same Node process but are not children
of `AircraftStateService`. `OgnProvider` owns one bounded APRS-IS TCP stream,
receive-only login, and comment-only `#keepalive`; `OgnStateService` owns the OGN RAM map, DDB privacy
re-application, stale/capacity cleanup, and an independent listener set for
`/api/ogn/stream`. OGN never calls Prisma or any ADS-B history/statistics,
enrichment, alert, or receiver-health path.

`OgnDdb` may persist only validated DDB resolutions in the versioned local
state file `/var/lib/airradar/ogn-ddb-cache-v1.json` (configurable server-side).
The file is a last-known-good cache, not an authority: it is strictly bounded
and validated on load, preserves each resolution's original timestamp, and is
written through a single debounced atomic writer. It contains no OGN packets,
coordinates, positions, or history. Production systemd already provisions the
default directory with `StateDirectory=airradar`; persistence failures are
best-effort and cannot stop live OGN or ADS-B processing.
When enabled, the same resolver also loads a local SoftRF `ogn.db` read-only
snapshot into a bounded in-memory whitelist. SoftRF is consulted only after
live OGN DDB and the official cache, and its invalid/expired entries never
make an unresolved device public.

## Server ownership

`AircraftStateService` owns the live lifecycle and coordinates the following
independent lanes:

- `LocalReadsbProvider` normalizes raw readsb observations into the shared
  `Aircraft` shape. It prefers barometric altitude/rate, retains geometric
  values, and computes distance/bearing from the internal receiver position.
- The ADSB.lol raw/HTTP network lanes are opt-in and bounded.
  The state service invokes it independently of the local retry loop; raw
  validates BEAST/SBS input and the HTTP fallback validates its public response,
  applies
  timeout/rate-limit/backoff handling, keeps a stale-if-error network snapshot,
  and exposes sanitized diagnostics. Its aircraft are merged with local
  observations only when an extended live snapshot is requested. The state
  service assigns a stable local/network source affinity per ICAO, so a
  temporary outage cannot hand the same aircraft from one feed to the other;
  the selected source owns the displayed observation and its metadata.
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
The local and network maps remain separate until the requested coverage mode is
serialized. Extended coverage is a display/read path only and is the true
local/network identity union; local aircraft are retained even without a fresh
usable position. Network-only aircraft do not affect local daily aggregates,
sampled history, alerts, enrichment, ATC resolution, or local receiver health.

## Persistence boundaries

PostgreSQL is optional for live operation. When configured, it stores:

- durable `Aircraft` identity/catalog rows and `Flight` instances;
- sampled `FlightPosition` rows with retention cleanup;
- imported `Airport`, `AirportRunway`, `AirportFrequency`, `Navaid`, `AtcSector`, and `AtcTransmitter` reference data;
- the optional tar1090 `AircraftMetadataCache` and sync state; and
- `ReceiverDailyStats`, `ReceiverDailyAircraft`, and
  `ReceiverDailyCoverage` aggregates. `ReceiverDailyStats` also stores the
  complete V1 maximum-distance record metadata (bearing and registration when
  available); legacy rows without bearing remain valid aggregate statistics,
  not complete reception records.

Process memory holds live aircraft, trails, bounded enrichment caches, ATC
resolver cache, the hot weather cache, photo metadata cache, reception-record
baselines, and alert deduplication. Tar1090 metadata is indexed in PostgreSQL
and only a bounded hot LRU is held in RAM; synchronization streams and
batch-writes the catalog without materializing the dataset in application
memory. The local tar1090 prefix-block fallback is also bounded to 4,096
entries, 64 MiB, and a 15-minute LRU/TTL window, so repeated source lookups
cannot grow process memory without a practical byte bound. The
browser's watchlist is stored in that browser's `localStorage`; server alert
rules are stored in the runtime state directory (`/var/lib/airradar/alerts.json`
in production), not in PostgreSQL. Alert history is stored as append-only safe
event/status lines in `/var/lib/airradar/alert-events.jsonl` in production and
is read from a bounded tail with bounded pagination. Local development keeps
the equivalent files under `data/`; the tracked `data/alerts.json` is only a
legacy migration source when the production state file does not yet exist.
Positive ADSBDB metadata/routes additionally use the optional bounded,
versioned snapshot `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`; it is a
last-known-good provider fallback, not a source of truth. Negative entries and
in-flight requests are never persisted.

## Browser and API boundary

### Map Context V1/V2

Map Context is an optional enrichment boundary with independent providers for
ČHMÚ radar (`lib/server/weather-radar`), batched AWC METAR, DWD ICON-EU wind,
and the existing Czech AUP/UUP activity provider. These providers feed bounded
HTTP APIs and MapLibre sources; none is connected to `AircraftStateService` or
the aircraft SSE serializer. V2 adds `lib/map-time/` and a bounded archive and
resolver in `lib/server/map-context.ts`. See [MAP-CONTEXT.md](MAP-CONTEXT.md)
and [MAP-TIME.md](MAP-TIME.md).

The browser uses AirRadar APIs only. `toPublicStateSnapshot()` is the full
snapshot boundary for `/api/aircraft`; `toPublicLiveStateSnapshot()` is the
compact SSE boundary. Exact internal receiver
coordinates are rounded, hidden, or published exactly only according to
`PUBLIC_RECEIVER_POSITION_MODE`; raw provider errors are replaced with safe
messages. Request/response routes have bounded per-client fixed-window
limiting. SSE has a separate bounded active-client capacity guard and keeps
only the newest pending snapshot for a slow connection. Selected aircraft use
an explicit quick/full boundary: the live radar drawer calls
`/api/aircraft/[hex]?mode=quick`, which returns only durable identity and locally
available metadata/route context and never invokes the paid FlightAware plan
provider. The dedicated `/aircraft/[hex]` page retains the full detail path and
its on-demand FlightAware enrichment. Route context needed by the map remains
in the compact live snapshot.
`coverage=local|extended` is accepted by the live aircraft, selected-aircraft,
and SSE endpoints. The default is `local`; `extended` includes validated,
fresh ADSB.lol observations and publishes provider status, source provenance,
and ODbL attribution without exposing raw provider errors or exact receiver
coordinates.

The live map is a MapLibre map with DOM markers keyed by ICAO hex and GeoJSON
overlays. Route visualization is a separate Route V2 namespace. High-frequency
SSE aircraft deltas update the live aircraft refs and schedule MapLibre marker
work directly, independently of the main React render cadence. React-facing
snapshot consumers receive the newest coalesced snapshot on a bounded 200 ms
UI interval; full SSE snapshots commit immediately. This split does not change
the SSE protocol, confirmed-position motion semantics, or MapLibre marker
ownership. See [Runtime invariants](RUNTIME-INVARIANTS.md#maplibre-namespaces-and-cleanup)
for the complete ownership list and cleanup contract.

Airport infrastructure is an offline maintenance path. OurAirports source
identity (`ourAirportsId` and `ourAirportsIdent`) is kept separately from the
canonical AirRadar `Airport.icao`. Runways and communication frequencies join
through source `ident` and are stored only for selected local airports;
worldwide navaids retain an optional association through the same source key.
The airport page loads core metadata and the three bounded infrastructure
collections server-side; the browser never downloads upstream CSV files.

### Aviation Weather

`AviationWeatherProvider` is an optional, independent server-side subsystem.
It reads only official Aviation Weather Center METAR, TAF, and SIGMET
endpoints. The provider has its own bounded in-process hot cache, plus an
optional versioned last-known-good file at
`/var/lib/airradar/weather/weather-cache-v1.json`. The file is validated and
size/entry bounded on load, written by one debounced atomic writer, and is
best-effort: corruption or disk failure cannot stop the provider or application.
The cache also has request timeout, negative entries, in-flight coalescing,
stale-if-error policy, and rate-limit backoff. Persistent METAR entries are
retained for at most 2 hours by default; TAF and SIGMET entries for at most 24
hours. SIGMET features are filtered by their own
`validFrom`/`validTo` on every response, independently of dataset age. Weather
is not part of `AircraftStateService`, readsb polling, aircraft serialization,
SSE, history, statistics, or PostgreSQL persistence.

The weather API accepts only canonical airport ICAO codes. The browser renders
normalized METAR/TAF data in airport and flight detail, while the optional
SIGMET GeoJSON is fetched on demand into the `aviation-sigmet` MapLibre source.
The SIGMET layer is disabled initially and its DOM popups use text-only safe
properties. Weather diagnostics are read-only and are included in `/system`
without probing the upstream provider.

System diagnostics retain the legacy four-state `status` for API consumers and
also expose a bounded `operationalState`: `on_demand`, `loading`, `ok`,
`degraded`, `offline`, or `disabled`. Radar, wind, weather, and ADSBDB use
fixed `reasonCode` values for non-healthy states. Cold-start lazy providers are
therefore not reported as offline/disabled, and recovered providers are not
held degraded by lifetime failure counters.

`/api/system/status` exposes sanitized process RSS/heap/external/ArrayBuffer
metrics, kernel RSS splits, the active SSE count and limit, metadata cache
counts, the byte-bounded tar1090 fallback cache, and the cgroup memory values
for the current process cgroup when the host exposes them.

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

## Time Machine

`/time-machine` is a separate read-only historical context. The historical
repository in `lib/server/time-machine.ts` reads bounded windows from
`FlightPosition`, joins `Flight`/`Aircraft` metadata and `FlightEvent` markers,
and exposes safe DTOs. The browser reconstructs aircraft state through
`lib/time-machine/playback.ts` and uses the namespaced MapLibre sources
`time-machine-aircraft` and `time-machine-selected-trail`; it never uses the
live state service, SSE, or live trail store.

Flight Intelligence loads the imported PostgreSQL airport catalog once into a
bounded runtime index; it does not scan a sample/world list on each aircraft
poll. Track memory is limited to 120 samples and a five-minute holding window,
and stale aircraft tracks are removed with live-state cleanup. Event persistence
stores the newest matching Flight's `flightId` when available; database failures
remain best-effort.

Source awareness is centralized in `lib/aircraft/source-awareness.ts`.
`LOCAL` and `NETWORK` are provenance memberships, not the dominant `origin`
field: overlap is `seenLocal=true` and `seenNetwork=true`. The same helper
drives classification, counters, and client-side filters. Live LOCAL capture
ratio uses `RECEIVER_COMPARISON_RADIUS_NM` (default 175 NM) and is not stored.
