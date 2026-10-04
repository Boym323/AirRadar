# Architecture

This document describes the implementation currently in the repository. The
main source files are linked inline; generated Prisma artifacts are outputs,
not schema sources.

## Runtime shape

The Flight Story read boundary (`lib/server/flight-story.ts`) is a separate
read-only composition over history tables and is not connected to live polling
or intelligence write lanes. Flight Story V2 composes its summary and narrative
client-side from that same bounded payload; it does not create another history
query, aircraft stream, EventSource, or playback clock.

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

Command Search V2 remains mounted once from the root layout. The topbar search
control is only a trigger; the root-level palette owns the single debounced
`GET /api/search?q=` interaction lane, keyboard state, and bounded
browser-local recents. The server search boundary can additionally issue
bounded recent Flight-row queries for ordinary searches; it never reads
FlightPosition. Exact smart actions are parsed before live-state readiness or
database access and return existing internal destinations only. The
`flights to <ICAO>` action uses the existing history list with an exact
destination filter. Command Search creates no EventSource, no aircraft
subscription, no LLM lane, and no server-side persistence.
Predictive prospective validation is a separate optional persistence lane
downstream of the existing shadow `PredictiveStateStore`. It writes immutable
`PredictiveObservation` samples through a bounded asynchronous queue only when
`AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true`; it is not part of
the public snapshot/SSE contract and cannot block aircraft ingestion.

Predictive Graduation Readiness is a separate read-only boundary over those
immutable observations and persisted LANDING terminal evidence. Its 30-day
runtime collector is capped at 15,000 predictive observations and 2,500 landing
events, cached for five minutes, and never reads `FlightPosition`. The pure
`predictive-readiness-v1` evaluator produces PASS/WAIT/FAIL per capability.
Incomplete bounded evidence is forced to WAIT. The public aircraft prediction
route consults readiness only when an operator explicitly configures at least
one capability as PUBLIC; otherwise the all-SHADOW hot path performs no
readiness database query. A configured PUBLIC capability whose current
readiness is not PASS is exposed as SHADOW instead. The readiness layer can
block graduation but never promotes a capability automatically.

Predictive ETA Advisory V1 is a presentation boundary on the existing aircraft
prediction route. Public ETA requires effective ETA=PUBLIC, readiness PASS,
fresh non-expired ETA and a calibrated readiness p90 ETA error; the p90 value is
the displayed uncertainty band. A valid admin session may receive a SHADOW
preview with readiness and stale/expired state. Anonymous responses never
contain that preview. Aircraft detail performs one request on mount and adds no
EventSource, polling loop, model, persistence lane or write path.

Predictive Runway Advisory V1 shares that same request and presentation
boundary. Public runway requires effective RUNWAY=PUBLIC, readiness PASS, a
fresh prediction, a non-null runway and known confidence. A valid admin session
may receive a separate SHADOW runway preview with readiness evidence. The
browser expires a rendered runway at the same 45-second freshness boundary.
No second fetch, EventSource, persistence lane, migration or model is added.

Predictive Runway Change Advisory V1 is a separate graduation capability over
the same in-memory prediction state. The engine records the real previous
predicted runway as `changedFrom` and a `changedAt` timestamp; `alternative`
continues to mean the second current candidate. A real transition is retained
in RAM for at most five minutes so an advisory is observable without changing
the prospective-validation write semantics. Public serialization additionally
requires a fresh <=45-second prediction snapshot, RUNWAY_CHANGE=PUBLIC,
readiness PASS, non-expired change provenance and MEDIUM/HIGH confidence.
Authenticated admin output may expose SHADOW/WAIT/FAIL diagnostics. No database
field, migration, stream or extra aircraft-detail request is introduced.

Predictive Trajectory Advisory V1 reuses the same in-memory trajectory state
and readiness boundary. Public serialization requires TRAJECTORY=PUBLIC,
readiness PASS, a <=45-second snapshot, a non-UNKNOWN state and MEDIUM/HIGH
confidence. The prospective lane records `trajectoryState` inside bounded
`evidenceJson` only on state/confidence transitions, so readiness can identify
instrumented observations without changing the database schema. Predictive
Outcome Truth V1 supplies a separate versioned validation source for candidate
outcomes; capability graduation still depends on the readiness thresholds and
never occurs merely because outcome data exists.

Predictive Outcome Truth V1 is intentionally outside the prediction graph. It
reads bounded persisted Flight Intelligence events by type, joins them only by
prospective lifecycle/ICAO/flight identity and time windows, and exposes
scoreable RUNWAY_CHANGE/TRAJECTORY evidence to the readiness evaluator. It
never reads FlightPosition and adds no write path, schema migration, SSE lane,
or predictive-engine input. Per-type event queries are capped at 2,500 rows;
any cap hit marks the readiness collection incomplete and therefore fail-closed.

Predictive Graduation Calibration V1 sits downstream of the runtime readiness
evaluation and is deliberately not part of the prediction or graduation
decision graph. The server passes the same bounded evidence object, the same
PASS/WAIT/FAIL evaluation, and the collection completeness bit into a pure
`buildPredictiveGraduationCalibration()` function. The output only derives
phase, exact evidence deficits, truth requirements, threshold margins and
manual-review eligibility. It cannot mutate policy or turn WAIT/FAIL into PASS.

Predictive Operations Center V1 is a bounded read-only aggregation boundary on
the radar NOW panel. The browser derives at most six ICAO candidates from the
existing prioritized timeline and live highlights, then requests
`/api/operations/predictive` only while the panel is open. The server reads the
existing in-memory predictive state for those aircraft and evaluates one shared
readiness report before serializing ETA/runway/runway-change/trajectory advisories. Anonymous output
contains only PUBLIC + PASS + fresh values; authenticated admin output may add
SHADOW previews and ETA/RUNWAY/RUNWAY_CHANGE/TRAJECTORY readiness decisions. The endpoint is polled at a
bounded 30-second interval and is deliberately separate from the main radar SSE,
prediction engine, persistence, and prospective-validation write paths.
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
- `altitude-provenance.ts` owns field-level altitude observations, source
  priority, freshness, disagreement/temporal guards, bounded diagnostics, and
  the in-memory Beast forensic ring buffer. See
  [ALTITUDE-PROVENANCE.md](ALTITUDE-PROVENANCE.md).
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
browser's watchlist is stored in that browser's `localStorage`; durable V1
fleets, typed matchers, circular geofences, rules, occurrences, and delivery
rows are stored in PostgreSQL. Enabled configuration is loaded into one
replaceable in-memory cache; mutations persist first and invalidate that
cache. The legacy JSON alert store remains only for the older watchlist path.
Positive ADSBDB metadata/routes additionally use the optional bounded,
versioned snapshot `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`; it is a
last-known-good provider fallback, not a source of truth. The metadata and
route maps remain resident in bounded RAM; mutations increment a generation
and mark the cache dirty without serializing or writing. The default durable
checkpoint is one hour after the first mutation in a dirty period, with
bounded five-minute-plus retry backoff on failures. `ADSBDB_CACHE_CHECKPOINT_MS=0`
is shutdown/manual-flush-only mode. Graceful shutdown flushes current RAM
state through the canonical shutdown coordinator; a hard crash or SIGKILL may
lose up to one checkpoint interval of re-fetchable ADSBDB enrichment. Negative
entries and in-flight requests are never persisted.

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
ownership.

Traffic presentation is deliberately separate from the backend models:

```text
AircraftView ─┐
              ├─> lib/radar/traffic-presentation.ts → shared visual semantics
OgnTargetView ┘
```

The adapters share icon families, source badges, label semantics, stale state,
accessibility wording and the drawer hero presentation. The two backend
contracts remain separate; OGN privacy/public serialization and ADS-B
provenance boundaries are not bypassed by the client presentation layer.

`AirRadarApp` remains the owner of the MapLibre instance, animation jobs,
layer data, and cross-feature orchestration. Focused radar boundaries live
under `components/radar/`: `useRadarLiveAircraft` owns the single browser
aircraft-stream subscription plus live refs and React snapshot coalescing;
`RadarMapLayerMenu` owns the layer-menu presentation; `RadarTrafficBrowser`
owns traffic/filter/watchlist presentation and its drawer-local state;
`RadarDrawerDetails` owns selected-target rendering; and
`useRadarDrawerInteractions` owns focus/keyboard drawer effects. The live
controller receives the map-sync scheduler from `AirRadarApp`; it does not
own MapLibre. These boundaries must not create a second map, aircraft stream,
or server live-state owner.
See [Runtime invariants](RUNTIME-INVARIANTS.md#maplibre-namespaces-and-cleanup)
for the complete ownership list and cleanup contract.

Airport infrastructure is an offline maintenance path. OurAirports source
identity (`ourAirportsId` and `ourAirportsIdent`) is kept separately from the
canonical AirRadar `Airport.icao`. Runways and communication frequencies join
through source `ident` and are stored only for selected local airports;
worldwide navaids retain an optional association through the same source key.
The airport page loads core metadata and the three bounded infrastructure
collections server-side; the browser never downloads upstream CSV files.

Airport Intelligence V3 adds one page-scoped client controller for the 24-hour
operations snapshot and airport weather. The Operations Board, unified movement
timeline, runway comparison, and detailed weather panel reuse those two reads.
The previous page-level duplicate 24-hour movement request and duplicate airport
weather request are not started. Airport Live Board V2 moves the existing nearby-aircraft live traffic into one
page-scoped read-only SSE controller. The Live Board and Nearby Aircraft reuse
that same `/api/stream` subscription, so the airport page still owns exactly one
aircraft stream and no new write lane.

Airport Live Board V2 remains inside that same boundary. The controller refreshes
the two shared reads with a 30-second one-shot timer, clearing it and aborting
in-flight work on unmount or manual refresh. The UI derives bounded recent-arrival, recent-departure, operational-event and
runway-usage lanes in memory from the operations response and reuses the same
METAR for a compact weather strip. The shared SSE snapshot additionally feeds
nearest-first NOW inbound/outbound lanes through the existing conservative
airport-traffic classifier. No third API, second EventSource, migration, table
or write path is introduced.

### Aviation Weather

`AviationWeatherProvider` is an optional, independent server-side subsystem.
It reads only official Aviation Weather Center METAR, TAF, and SIGMET
endpoints. The provider has its own bounded in-process hot cache, plus an
optional versioned last-known-good file at
`/var/lib/airradar/weather/weather-cache-v1.json`. The file is validated and
size/entry bounded on load, written by one lazy 30-minute-from-first-dirty
atomic checkpoint (or at graceful shutdown), and is
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
for the current process cgroup when the host exposes them. `/api/system/stream`
publishes the same projected diagnostics over a shared, coalesced SSE refresh
every five seconds so the `/system` page reflects runtime changes without a
manual reload.

Recap pages are page-scoped reads. They merge the existing daily receiver
aggregates with database-side `Flight` aggregates and bounded first/latest
per-aircraft lifetime lookups; the daily recap additionally reads bounded
`Flight.startTime`/`airline` rows plus database-side `FlightEvent`
aggregates and a capped recent event set for deterministic Daily Intelligence.
It never reads `FlightPosition`, starts a poller, or opens an SSE connection.
Daily Intelligence caps the page-scoped reads and marks its highlight set
incomplete when a cap is reached. Recap indexes are additive and remain
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
stores the Flight whose persisted time range covers the event's observation
time when available; database failures remain best-effort.

Source awareness is centralized in `lib/aircraft/source-awareness.ts`.
`LOCAL` and `NETWORK` are provenance memberships, not the dominant `origin`
field: overlap is `seenLocal=true` and `seenNetwork=true`. The same helper
drives classification, counters, and client-side filters. Live LOCAL capture
ratio uses `RECEIVER_COMPARISON_RADIUS_NM` (default 175 NM) and is not stored.

## Navigation Integrity

Navigation Integrity is a bounded, read-only derived lane fed by the existing
local and network ADS-B state snapshots. It preserves field-level provenance,
uses deterministic 0.2° cells and altitude bands, and keeps regional anomaly
state separate from receiver/database health. Its V1 contract, retention,
limitations and API surface are documented in
[NAVIGATION-INTEGRITY.md](NAVIGATION-INTEGRITY.md).
