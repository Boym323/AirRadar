# Data flows

## Live ingest to browser

Receiver coverage sampling periodically evaluates the active network snapshot
against the local map using the same fresh-position, radius, normalized-ICAO
eligibility semantics as the live capture ratio. `AVAILABLE` counts eligible
network observations and `CAPTURED` counts same-snapshot fresh local matches.
Outages skip a sample. Aggregates are flushed hourly-bucket deltas; raw
network observations are not persisted.

## Map Context V1/V2

Map Context is a separate optional read path. Radar catalog/frame requests,
batch METAR, ICON-EU wind, and AUP/UUP activity are independently cached and
serialized into bounded map DTOs. Their browser state is isolated from
`/api/stream`; provider failures leave live aircraft and other map layers
usable. The radar uses observed frames, wind uses model valid times, METAR uses
latest observations, and AUP/UUP uses validity intervals.

V2 publishes one Global Map Time instant from Time Machine to the context
resolver. A single-process archive service samples radar, METAR, wind and
AUP/UUP into bounded persistent files. Reconstructable METAR and wind
mutations are coalesced in RAM and flushed through atomic snapshot replacement
at a bounded time/count threshold; shutdown drains pending archive buffers.
Manifests stay small; layer payloads
use independent APIs and fail independently.

1. `LocalReadsbProvider` fetches `<READSB_BASE_URL>/data/aircraft.json` on
   the poll interval and refreshes `/data/receiver.json` less often. A missing
   `READSB_BASE_URL` uses `MockReadsbProvider` for demo mode.
2. `normalizeAircraftResponse()` validates the six-hex-character aircraft
   identifier (including readsb's `~` non-ICAO form), converts fields, keeps
   barometric and geometric values, derives altitude/vertical rate, and
   calculates distance and bearing.

The optional local Beast lane accepts short and long Mode-S frames and dispatches
DF0/4/5/11/16/17/18/20/21 after parity handling. DF20/21 Comm-B MB payloads
are passed through a bounded BDS inference layer for BDS 4,0, 4,4, 5,0 and 6,0;
ambiguous candidates are rejected as telemetry. Beast receiver timestamps are
used as a monotonic observation clock when valid (including 48-bit wrap), with
receive time as the safe fallback after restart/discontinuity. The raw Beast
signal byte is retained as receiver-local `beastSignal` and is never treated as
network RSSI. Fresh local fields win over `aircraft.json` field-by-field; JSON
only fills missing, invalid, or older values.
3. `AircraftStateService.applySnapshot()` ignores observations older than the
   stale threshold, updates the RAM map by ICAO identity, appends a changed
   position to a bounded trail, and removes aircraft absent from the current
   snapshot. A failed poll removes only entries that have become stale.
4. When enabled, the service first consumes ADSBHub SBS/30003:
   `data.adsbhub.org:5002` → AirRadar. The independent feeder contribution is
   `192.168.1.50:30002` → `data.adsbhub.org:5001`; AirRadar does not manage it.
   The consumer uses arrival-time freshness, bounded tracks, field-aware MSG
   merging, and publishes only positioned aircraft inside the configured
   radius. Its origin is `adsbhub`, never `local` or MLAT. Enabled ADSBHub,
   outbound ADSB.lol raw (`out.adsb.lol:1365` BEAST plus `:1366` SBS/MLAT), and
   the geographic HTTP provider run concurrently. Their snapshots are
   deduplicated by ICAO into one bounded network map while retaining source
   provenance. These failures never mark the local
   receiver offline.
5. The service notifies listeners with a snapshot. `GET /api/aircraft` waits
   for the first refresh and returns the safe public DTO. `GET /api/stream`
   remains a V1 full-snapshot SSE feed by default; `?v=2` opts into one full
   public snapshot followed by sequence-aware changed/removed deltas. The V2
   baseline is per connection, bounded by SSE capacity, and discarded on
   disconnect. `coverage=extended` explicitly merges the local and network RAM
   maps; `coverage=local` remains the default. See [SSE Delta V2](SSE-DELTA-V2.md).
   Extended snapshots also carry compact source counters and a non-persistent
   LOCAL capture ratio. Its denominator is fresh, positioned NETWORK traffic
   inside `RECEIVER_COMPARISON_RADIUS_NM`, not the full network radius.
6. Metadata/routes/flight plans, ATC assignments, statistics, and alerts run
   from the same snapshot flow but are asynchronous and isolated from the
   local provider refresh. An enrichment result is applied only if it still
   belongs to the same local aircraft observation. Network-only observations
   are not persisted, enriched, assigned ATC, or evaluated by alerts.

Prospective predictive validation is downstream of the shadow predictive
evaluation. At capture time it stores the immutable prediction and the
Flight-Intelligence lifecycle key. Offline validation tooling may join bounded
Flight/FlightPosition terminal evidence; predictive output is never an input to
Ground Truth classification. The lane is feature-off by default, bounded and
fail-soft.

Predictive Graduation Readiness is a lighter runtime read path. The admin-only
`GET /api/admin/predictive/readiness` reads at most 15,000
`PredictiveObservation` rows and 2,500 persisted `LANDING` FlightEvents from
the latest 30 days. It correlates by lifecycle key (with bounded flight-id
fallback), uses factual ground-confirmation timestamps and independently
reported arrival runway evidence when available, computes only aggregate
metrics, and never reads `FlightPosition`. Results are cached for five
minutes. A cap hit marks the report incomplete and every otherwise passing
capability remains WAIT.

The public `GET /api/aircraft/:hex/prediction` path does no readiness DB work
while the configured policy is entirely SHADOW/DISABLED. If an operator
explicitly configures any capability PUBLIC, the read-only readiness report is
consulted and any non-PASS capability is downgraded to SHADOW for serialization.
There is no automatic PUBLIC promotion and no readiness write path.

Predictive ETA Advisory V1 reuses this same aircraft prediction response. For
anonymous callers the response adds an `etaAdvisory` only when ETA remains
effectively PUBLIC after readiness enforcement, the readiness decision is PASS,
the prediction is no more than 45 seconds old, the ETA is still in the future,
and the readiness report contains a finite p90 ETA absolute error. That p90
error is rounded up to minutes and becomes the displayed ± uncertainty band.
No heuristic uncertainty is invented. A valid admin session may additionally
receive `adminPreview` for SHADOW/PUBLIC diagnostics; this field is omitted
for anonymous callers. The aircraft detail reads the endpoint once on mount and
does not create a second live stream or polling loop.

Predictive Runway Advisory V1 adds `runwayAdvisory` to the same response only
when RUNWAY remains effectively PUBLIC after readiness enforcement, readiness
is PASS, the prediction is at most 45 seconds old, the runway is non-null and
confidence is known. A valid admin session may additionally receive
`runwayAdminPreview` with readiness reasons, exact-runway-end accuracy,
coverage and freshness state. Anonymous callers never receive this preview.
The aircraft detail still performs one prediction fetch and creates no second
stream or polling loop.

Predictive Runway Change Advisory V1 adds `runwayChangeAdvisory` and, for a
valid admin session, `runwayChangeAdminPreview` to that same response. A
transition stores `changedFrom` and `changedAt` in the bounded RAM prediction
state. Subsequent evaluations may carry that event for up to five minutes while
the predicted runway remains the same; prospective RUNWAY_CHANGE observations
are still emitted only on a real previous-runway != current-runway transition.
Public output also requires the current prediction snapshot to remain within
the 45-second freshness boundary.

Predictive Trajectory Advisory V1 adds `trajectoryAdvisory` and authenticated
`trajectoryAdminPreview` to the same response. Prospective trajectory rows
are emitted only when state or confidence changes and carry
`trajectoryState` in bounded `evidenceJson`. Readiness ignores legacy
metadata-only trajectory rows when counting instrumented observations and
candidate deviations.

Predictive Outcome Truth V1 combines immutable `PredictiveObservation`
snapshots with bounded, read-only persisted `FlightEvent` outcome queries.
RUNWAY_CHANGE uses a pre-prediction APPROACH runway plus a later
provider-reported LANDING runway. TRAJECTORY uses later confident abnormal
Flight Intelligence events as positive truth and only a ground-confirmed
landing at the same prospective destination as negative truth. Missing or
ambiguous evidence remains UNSCORABLE. Each event-type query is capped at 2,500
rows; truncation makes the whole readiness collection incomplete. The flow
never reads FlightPosition and does not write or update truth onto prediction
rows.

Predictive Graduation Calibration V1 is produced inside the same admin
readiness request after evidence collection and PASS/WAIT/FAIL evaluation.
There is no additional database query. The calibration builder consumes only
the already-built `PredictiveReadinessEvidence`, evaluation result and
collection-complete flag, then returns count deficits, truth requirements and
quality margins. The browser renders this data only on the authenticated
System Status page; public aircraft and Operations Center serializers do not
consume calibration output.

Predictive Operations Center V1 reuses the same advisory builders through
`GET /api/operations/predictive?hexes=`. The caller provides at most six
already-relevant ICAO identifiers. The server normalizes and deduplicates the
list, reads one readiness report, then builds ETA/runway/runway-change/trajectory public advisories or
authenticated SHADOW previews from the existing RAM state. No prediction is
recomputed by the endpoint. The radar client refreshes this bounded response
every 30 seconds only while Operations Center is open and locally expires
rendered values at 45 seconds. This flow never enters the main aircraft SSE.

ADSBDB metadata and route persistence is a recovery cache only. Runtime RAM is
authoritative: `set`/`delete` mutate bounded maps and generation counters
immediately, while a single checkpoint serializes the current maps at the
first-dirty deadline (default 60 minutes). A successful atomic rename advances
the persisted generation; mutations during a save remain dirty. The existing
fsync, temporary file, mode `0600`, validation, and atomic rename safeguards
remain in force. Normal operation therefore keeps current values in RAM,
graceful shutdown persists them, and hard crash/power loss can omit up to one
hour of newly fetched enrichment without affecting ADS-B ingest, history, or
FlightPosition data.

## Alerts and alert history

Server watchlist, emergency, new-aircraft, and reception-record transitions
are evaluated by the shared `AlertEngine`. A detected event is first written
as safe metadata to the append-only runtime-state ledger
(`/var/lib/airradar/alert-events.jsonl` in production). Notifier
delivery is a separate asynchronous lane and appends `attempted`, `delivered`,
`failed`, or `disabled` status lines; raw provider payloads, credentials, and
delivery errors are not persisted. `GET /api/alerts` folds the status lines
into a bounded paginated DTO.

The NEW transition is emitted only by `recordAircraftSnapshot()` after a
successful transaction creates the aircraft's first durable `Flight` instance.
An in-memory restart or an `Aircraft` row without a Flight cannot create a NEW
alert. Reception-record transitions are evaluated only after the daily
statistics aggregate is ready and compare the current daily maximum with the
loaded daily/lifetime baselines. Stable event IDs prevent the same record from
being emitted twice in one process.

The live radar page creates one `EventSource`, maintains a bounded client-side
live trail, animates MapLibre DOM markers, and reconnects through the browser's
`EventSource` behavior after a network interruption. Confirmed-position
interpolation owns a presentation-only visual heading on each animation job:
it follows the marker's rendered A → B movement when that displacement is at
least 25 m, then falls back to confirmed position heading, reported track, and
last known track. The reported ADS-B track remains the source for prediction
and data semantics. The original heading bug came from using that reported
track during interpolation even when the marker was visibly correcting along a
different confirmed-position path. The statistics page has its own page-scoped
stream for live counters.

## OGN / FLARM live flow

When `OGN_ENABLED=true`, `OgnProvider` connects to the official OGN APRS-IS
endpoint using the canonical receiver latitude/longitude and configured
radius. APRS-IS server-side filtering requests `r/.../.../... -u/OGADSB`, but
the local classifier still drops every `OGADSB` packet. A bounded 512-byte
line reader handles CRLF framing, comments, TNC2 envelopes, and reconnects;
the provider sends only a periodic `#keepalive` comment and no aircraft
telemetry. No browser or Prisma connection is involved.

Accepted aircraft positions go through nearest-day timestamp validation,
future tolerance, a 120-second age limit, source-specific TOCALL
classification, and an identity key of `addressType + address`. Newer
observations replace the canonical position; equal timestamps may add receiver
provenance; older observations never roll back the target. The OGN DDB resolver
uses a bounded RAM cache of exact `device_type:device_id` resolutions.
At process startup, `OgnDdb` first loads the validated version-1 local
last-known-good cache from `OGN_DDB_CACHE_FILE` when persistence is enabled;
this is local-only and performs no network request. Successful targeted
`FOUND`/`MISSING` batches mark the bounded RAM snapshot dirty and persist it
later through one debounced atomic writer. The original `resolvedAt` is kept,
so the existing positive refresh/max-stale and negative TTL rules continue to
apply across restarts. The persistent file contains no APRS packets or
positions and cannot make an unresolved device public.
`OgnDdb.start()` does not download the full table: an accepted packet enqueues
its device identity, and the resolver debounces unique IDs into bounded
targeted requests using `?j=1&t=1&device_id=...`. It allows only one in-flight
batch, enforces a minimum request interval, and applies a global
`Retry-After` gate after `429`. The official `?j=1` base representation is a
same-batch fallback for allowed rich-representation/server failures; a
network/schema failure requeues the requested identities as unresolved. A
valid targeted empty response creates a short-lived negative/missing
resolution. DDB responses are indexed only by exact device type and ID, so a
same-ID record under another type is not used. The old full-table loader
remains only as an explicit compatibility/debug `refresh()` path.

When an official resolution is unavailable, the resolver may consult an
explicitly enabled local SoftRF `ogn.db` SQLite snapshot. Its required
`ogn.db.meta.json` sidecar supplies the trusted UTC `generatedAt` timestamp and a
lowercase SHA-256 hash of the exact database; mtime is used only to detect replacement.
AirRadar validates the read-only
`devices` schema, metadata age, row count, and privacy flag types once,
then keeps only `type + id` rows with `track=1` and `ident=1` in memory. The
SoftRF dataset is a whitelist below live OGN DDB and the official persistent
cache; it supplies no metadata, is never queried per APRS packet, and expires
after its configured TTL. A bad refresh leaves the prior valid in-memory
snapshot intact.

APRS `CSE/SPD` speed is already in knots and is stored directly in
`groundSpeedKt`, regardless of source TOCALL. Privacy is fail-closed per
device while its resolution is unresolved, with packet no-tracking and DDB
tracked/identified choices applied before public serialization. Existing
privacy-valid cache entries remain visible through their maximum stale window
even if another device or the upstream DDB is unavailable.

`/api/ogn/state` returns the current bounded snapshot and `/api/ogn/stream`
delivers an initial snapshot plus coalesced updates and heartbeats. OGN has no
effect on `/api/stream`, local aircraft filters, local history, statistics,
alerts, or the main receiver status. Stale targets are marked after 15 seconds
and removed after 60 seconds; the target map is capped at 5,000 entries.

## Aviation weather

`AviationWeatherProvider` loads a bounded, validated in-process cache and then
serves on-demand METAR, TAF, international SIGMET, and AirSIGMET requests.
Successful normalized values update memory and mark the bounded cache dirty.
A lazy recovery checkpoint writes `/var/lib/airradar/weather/weather-cache-v1.json`
30 minutes after the first dirty mutation by default
(`AVIATION_WEATHER_CACHE_CHECKPOINT_MS`; `0` is shutdown-only). The complete
snapshot is materialized only at checkpoint time, and generation tracking
preserves mutations during an asynchronous write. Failures never write provider
errors or stop live weather. The versioned file is written through a temporary
file, `fsync`, and atomic rename. A missing, oversized, malformed, wrong-version,
or partially invalid file is ignored entry-by-entry and cannot prevent startup.

At process startup, valid persistent entries become stale-capable fallbacks
and a live request is still attempted when the product TTL has elapsed. A
persisted fallback is bounded by a product-specific maximum age (2 hours for
METAR, 24 hours for TAF and SIGMET), separate from the normal in-memory
stale-if-error window. Empty successful METAR/TAF
responses are retained as negative entries, and an empty SIGMET dataset clears
the previous dataset. SIGMET responses always re-check each feature's
`validFrom` and `validTo`; a stale dataset can therefore correctly return zero
active features after all advisories expire.

Weather responses expose `cacheSource` (`live`, `memory-cache`, or
`persistent-cache`), `fetchedAt`, `snapshotAgeMs`, and `stale`. A persistent
entry is explicitly marked stale until a live refresh succeeds. Development and
test processes do not enable the `/var/lib` writer unless persistence is
explicitly configured.

RAM remains authoritative during normal runtime, so checkpoint timing does not
change product TTLs, provider cadence, or stale-if-error behavior. The canonical
shutdown coordinator flushes the latest state. A hard crash may lose up to one
checkpoint interval of newly acquired recovery data, which is fetched again
after restart.

## History persistence

Airport Intelligence reads nearby aircraft from one page-scoped subscription
to the existing local aircraft SSE and filters positioned, recent ADS-B
observations within a 30 km radius. Airport Live Board V5 and Nearby Aircraft
consume that same in-memory snapshot; the page does not open a second airport
aircraft stream. No weather, airport, or history query is triggered by an SSE
update. Airport Intelligence V3 separately issues one page-scoped
`GET /api/airports/:icao/operations?period=24h` and one airport-weather read;
the Operations Board, unified movement timeline, runway comparison, and
detailed weather panel reuse those two results instead of starting another
24-hour movement request or duplicate weather request. The operations response
propagates the bounded movement query's `complete`/`truncated` state. Runway
usage remains receiver-inferred; the client compares it with wind components
from the observed METAR without inferring why they may differ. Timeline rows
link to the existing Flight Story detail. OGN is not included in these airport
features.

Airport Live Board V5 refreshes only the operations/weather reads every 30
seconds using a one-shot timer. The client sorts valid movement timestamps
newest-first, deduplicates recent arrival/departure lanes by Flight ID, bounds
each lane to six items, keeps GO_AROUND/HOLDING as a separate bounded
operational-events lane, and displays at most four runway-usage rows. The shared aircraft SSE updates only the NOW traffic snapshot; the existing
airport-traffic classifier derives bounded nearest-first inbound/outbound lanes
from distance trend, track and vertical rate. V3 joins each active observation
against `operations.recentMovements` in memory only. The join requires the same
ICAO identity, non-conflicting callsigns, a movement compatible with inbound or
outbound direction, and a timestamp within 20 minutes (plus two minutes of
future clock-skew tolerance). The join can add an existing Flight Story link;
it never triggers a per-aircraft history or intelligence request. V4 then derives journey stage from the correlated movement and current distance/vertical-rate guards; route origin/destination is evaluated independently as confirmed/unknown/conflict and cannot override that stage. A live on-ground observation can enter the arrival lane only when the same bounded operations snapshot supplies a fresh correlated LANDING, producing LANDED; other on-ground observations are excluded. V5 folds the resulting bounded active snapshot into NOW flow counts and an attention list. The attention list includes only GO_AROUND, HOLDING, or route-conflict rows, is capped at six, and is ordered by exception priority then distance; LANDED stays part of normal inbound flow. V6 reuses that flow plus the same bounded `operations.recentMovements` array to compare consecutive 15-minute arrival/departure windows, count recent holding/go-around exceptions, calculate a deterministic pressure level, and summarize 30-minute runway consistency. V7 reads the same in-memory array again only as a runway projection: runway-bearing movements are split into consecutive 15-minute windows, deduplicated to the newest movement per Flight, summarized into overall/arrival/departure runway evidence, and compared with the already-computed wind-favoured runway when the current evidence passes its sample/share guard. V7 Arrival Sequence batches at most six approaching ICAOs into the existing predictive-operations read on the same airport refresh cycle and keeps only readiness-gated PUBLIC ETA/runway values. V8 then derives demand, compression, pressure, runway-load/alignment and the Approach Queue state entirely in memory from that bounded sequence plus existing V6/V7 evidence. Invalid/stale
positions remain excluded and an SSE update does not trigger database, weather
or operations reads.

Every successful provider refresh replaces the pending history snapshot. A
single history writer drains that coalesced queue. For each aircraft with a
valid position, `persistHistory()` writes only when its last sample is older
than `HISTORY_SAMPLE_INTERVAL_MS` (minimum enforced by config). Writes run with
bounded concurrency and each aircraft failure is isolated.

The transaction upserts the `Aircraft` row by ICAO hex, finds the current open
`Flight`, updates or creates the flight instance, and inserts one
`FlightPosition`. When both callsign observations are present and differ, a
new instance is created; a continuity gap closes the old instance at its last
seen time. Missing PostgreSQL returns a
memory-backed success result for sampling bookkeeping, while
`GET /api/history/:hex` falls back to the current bounded RAM trail when the
database has no usable result.

Maintenance periodically closes stale open flights and deletes position rows
older than `HISTORY_RETENTION_DAYS`. It never resets the database. Flight list
and detail endpoints query PostgreSQL with bounded limits; flight detail caps
positions and reports truncation.

## Airport traffic summary

`GET /api/airports/:icao/traffic` resolves the canonical airport, then reads
only persisted `Flight` instances whose `startTime` falls inside the selected
7-day or 30-day calendar window in `APP_TIMEZONE` (30 days by default). Two
bounded route predicates cover origin and destination; rows are deduplicated by
`Flight.id`, so a flight cannot inflate the total when both fields reference
the airport. The response aggregates departures, arrivals, unique aircraft by
ICAO identity, active local days, first/last capture, top callsigns, and capped
route/aircraft/recent-flight lists.

Route airport metadata is loaded in batched ICAO/IATA queries with the bundled
catalog as a fallback. Missing route metadata is omitted from route rankings,
not inferred from `FlightPosition`; the summary never reads `FlightPosition`
and never calls an external provider. Recent links use canonical airport ICAO,
aircraft ICAO hex, and the existing flight-history detail route. This is
receiver-observed traffic, not a complete airport traffic count. Both route
predicates use a 500-row sentinel-bounded query; when either is truncated,
`complete: false` is preserved, but totals, active days, heatmap, and all
rankings are still calculated from the deduplicated truncated row set. That is
a known performance/data-quality limitation for busy airports and should be
addressed with database-side aggregates in a future batch.

Aircraft detail lifetime statistics read only the aircraft's `Flight` rows via
the existing `(aircraftId, startTime)` index. They count retained Flight
instances, local active days, callsigns, resolved origins/destinations, and
routes. They deliberately do not scan `FlightPosition`; sampled positions
remain owned by the bounded per-flight playback endpoint.

The aircraft detail NEW label is based on the first persisted Flight
instance's local `APP_TIMEZONE` day matching the current day. RAM presence is
not used, so restarting the process cannot create a false first observation.
The RARE label is shown for a non-new aircraft with one to three retained
Flight instances. The RETURNING label is shown when the latest persisted Flight
starts at least 30 full days after the previous Flight's last observation.
These thresholds are explicit V1 rules, and the detail tooltip explains the
stored evidence behind each label; no provider inference is involved.

## Statistics and coverage

`ReceiverStatistics.observe()` runs after each applied snapshot. It counts
unique ICAO identities for the local day selected by `APP_TIMEZONE`, tracks
maximum concurrent aircraft, maximum distance, and type/airline breakdowns.
Valid positions produce a maximum-distance value in one of 36 fixed 10-degree
azimuth buckets. Invalid `(0, 0)` positions and invalid receiver coordinates
are excluded from coverage.

Only dirty rows are flushed to PostgreSQL on a throttle and again during
shutdown. Startup loads the current local-day aggregate. Range responses for
`7d` and `30d` read the three daily statistics tables, merge the current RAM
day, produce daily trends, period summary, populated-bucket coverage summary,
and a comparison against the immediately preceding equal-length local period.
Comparison fields remain unavailable when that specific aggregate is missing;
statistics never publish exact receiver coordinates.

The maximum-distance observation also retains its normalized ICAO hex, bearing,
timestamp, and registration when available. `/api/reception-records` reads up
to ten persisted daily rows with a valid V1 bearing and merges the current RAM
day. It returns the best daily records and lifetime maximum without scanning
`FlightPosition`; legacy daily rows that predate the bearing field are excluded
from the complete-record list and called out in the UI.

## Extended coverage

The optional ADSB.lol HTTP provider is a live display source only. With
`ADSBLOL_BASE_URL=https://re-api.adsb.lol` it uses the feeder-authorized
`?circle={lat},{lon},{radius}` readsb endpoint; the public API variant uses
`/v2/lat/{lat}/lon/{lon}/dist/{radius}`. Both use a bounded radius/poll interval,
request timeout, maximum aircraft count, stale threshold, and exponential
retry capped by configuration. A 429 response honors `Retry-After` when
present. The merger deduplicates by normalized ICAO hex and treats an
observation as a position candidate only when both coordinates are valid and
`seen_pos` is fresh. Aircraft existence is separate from position usability:
the extended result is the full local/network identity union, so local
aircraft without a fresh position are retained. The state service assigns
each ICAO a source affinity, tracks latest provider membership separately from
retained observations, and keeps the last good preferred position through the
bounded stale/affinity grace window. When the preferred feed remains absent,
handoff to a live alternate occurs directly without a positionless snapshot.
If the preferred observation is absent or cannot supply a usable position,
position arbitration may use the fresh alternate immediately. Within the
selected source, a fresh position is preferred and its last-known usable
position is retained when necessary; coordinates otherwise remain null. Displayed
network-only aircraft are marked with source provenance; they do not enter
history, local daily statistics, alerts, metadata enrichment, ATC resolution,
or the local receiver health state. Public UI/API output includes ADSB.lol and
ODbL 1.0 attribution.

A successful local or network snapshot also passes through Continuity Guard V2.
The guard compares aircraft count with the preceding established membership
baseline. By default, a loss of at least 50% from a baseline of at least 20
aircraft defers destructive stale pruning for one cycle. A second similarly low
snapshot confirms the collapse; recovery cancels the pending guard. Provider
errors remain governed by the existing stale/retry path and can seed the next
successful comparison from retained local state. Process-local continuity
diagnostics are exposed through system status under `localAdsb.continuity`;
they include omission/recovery, stale-expiry, quick-reappearance, source-
failover, and mass-drop counters and are not persisted.

## ATC flow

`GET /api/atc/sectors` returns the active sector/transmitter dataset. In demo
mode, or when `ATC_SAMPLE_ENABLED=true`, it uses the explicitly marked sample
constants. With a configured real receiver and sample disabled, it reads
imported PostgreSQL rows only; empty/unavailable tables produce an empty
layer.

For each aircraft with a position, the state service throttles repeated lookup
keys and asks `AtcSectorService` for the best point-in-polygon, altitude, and
validity-time match. Sector metadata and frequencies are copied into a
probable assignment. Relevant-frequency summaries aggregate already-resolved
assignments by frequency/service/callsign and include confidence counts. No
path reports the aircraft's actual tuned frequency.

## Auxiliary flows

- `ADSBDB` metadata is keyed by aircraft hex. ADSBDB route data is keyed by
  aircraft hex, normalized callsign, and UTC date, so a callsign reuse cannot
  silently share a route across aircraft or days. The RAM cache keeps the
  existing 24-hour metadata and 6-hour route TTLs; positive ADSBDB values are
  also hydrated from the optional bounded version-1 snapshot at
  `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`. Metadata has a 7-day
  persistent stale limit and routes 24 hours. Persistent values are used only
  after a provider error; a valid provider miss never revives stale data.
  Negative results remain RAM-only. FlightAware flight-plan data is keyed by
  callsign and observed time. All are server-side enrichment with
  cache/concurrency limits.
- ADSBDB route airport objects pass through `AirportResolver`: PostgreSQL
  exact ICAO, then IATA, then valid provider coordinates, then the small
  bundled catalog. This resolves display metadata; the provider's route code
  remains the route identity unless a canonical catalog ICAO is available.
- Aviation Weather is an independent optional flow. `GET
  /api/weather/airport/:icao` and the bounded `?icao=ICAO1,ICAO2` form resolve
  canonical ICAO airports before fetching METAR/TAF from AviationWeather.gov.
  `GET /api/weather/sigmet` combines the worldwide international SIGMET feed
  with the CONUS domestic feed, validates Polygon/MultiPolygon GeoJSON, filters
  to currently valid records, and returns a safe normalized FeatureCollection.
  International and AirSIGMET have separate bounded cache entries and are
  merged at response time, so one feed can refresh or fail without discarding
  the other feed's fresh/stale data. Dataset diagnostics expose fresh/stale/
  unavailable state. Separate product TTLs, negative entries, in-flight
  coalescing, bounded RAM caches, stale-if-error, timeout, and `Retry-After`
  backoff protect the upstream. Weather is never persisted or included in
  aircraft SSE.
- `GET /api/aircraft/:hex/photo` validates the aircraft identity, looks up
  Planespotters metadata by hex and, only when that is empty, by registration.
  The browser loads the allowed HTTPS thumbnail directly; image bytes do not
  pass through the server cache.
- `/api/airports` serves the PostgreSQL airport catalog when non-empty and the
  bundled six-airport fallback otherwise. `GET /api/search` searches live RAM
  aircraft, the airport catalog, bounded ATS point data, and at most a bounded
  candidate set of Flight rows from the latest seven days. Historical Flight
  search begins at three characters and never reads `FlightPosition`. Exact
  Command Search V2 smart actions are parsed before live-state readiness or DB
  access and therefore perform no search reads. The root-level client keeps the
  same 220 ms debounce for ordinary search queries. Recent selections remain
  capped browser-local `localStorage` entries restricted to internal AirRadar
  paths; they do not enter server persistence or any live-data lane.
- `GET /api/history/flights` additionally accepts exact normalized
  `origin=` and `destination=` ICAO filters. These are composed with the
  existing bounded range/query filters and are used by smart destination
  actions; the endpoint still reads Flight rows only.
- Alerts & Fleets V1 configuration is persisted in PostgreSQL through the
  server repository (`AlertFleet`, `AlertFleetMatcher`, `AlertGeofence`, and
  `AlertRule`). Enabled rows are loaded into a replaceable in-memory cache;
  CRUD writes persist first and then invalidate the cache. The legacy JSON
  watchlist path remains separate and is not used for durable V1 configuration.
  Separately, the map's browser watchlist is a localStorage filter and is not
  a server notification rule.
- `/fleet` derives its identities from the same server watchlist, keeping only
  `icaoHex` rules and deduplicating by normalized ICAO hex. Callsign,
  registration, pattern, type, and airline rules are observation filters, not
  Fleet identities. One receiver snapshot supplies live/offline state, while
  one shared 30-day `Flight` query supplies the 7/30-day counts and route
  rankings; no second live poller is created.

The home-page logbook summary is a separate, page-scoped `GET
/api/logbook/summary` fetch. It uses the current state service snapshot for
live and watchlist counts, then batches today’s persisted Flight identities and
their lifetime Flight rows to classify NEW/RARE/RETURNING aircraft. It is not
called for each SSE event and shows zero durable labels when PostgreSQL is
unavailable rather than treating a process restart as a new observation.

## Receiver recaps

`GET /api/recap?range=daily|weekly` is a page-scoped read in Europe/Prague
local time. It reads the selected date range from `ReceiverDailyStats` and
`ReceiverDailyAircraft`, computes Flight counts/routes/types in the database,
and fetches at most first/latest lifetime rows per aircraft for labels. The
daily response also derives deterministic Daily Intelligence from bounded
`Flight.startTime`/`airline` rows, database-side `FlightEvent` type
aggregates, a capped recent `FlightEvent` set, and the already bounded alert
history. These inputs provide busiest hour, top airlines, operational event
counts and a bounded high-value timeline; the response reports
`dailyIntelligence.complete=false` when a source cap is reached. Weekly
comparison reads the preceding seven aggregate windows without lifetime
enrichment or Daily Intelligence. Missing aggregate rows remain missing in the
response rather than becoming zeroes. Recaps do not scan `FlightPosition`,
make provider requests, create another EventSource, or add another polling loop.

## Time Machine historical flow

`GET /api/time-machine/range` reads the actual first/last
`FlightPosition.recordedAt` values. `GET /api/time-machine/window` validates a
maximum five-minute UTC window, reads at most 40,000 positions and 500 flight
identities, then joins persistent metadata and read-only `FlightEvent` markers.
The browser keeps one bounded window and reconstructs the selected instant
locally. Historical reads never invoke intelligence detection, alerts,
notifications, or live polling.
## Navigation Integrity flow

The aircraft state service submits each local and network snapshot to the
Navigation Integrity lane. Fresh, positioned observations with usable
field-level provenance are deduplicated, retained in a bounded process store,
and evaluated on a slower cadence into cell summaries and hysteretic anomaly
candidates. Optional database writes are asynchronous and best effort; the
read APIs expose bounded current, aircraft, history and diagnostic views.

# Flight Story

`/flights/[id]` reads a bounded Flight Story containing Flight identity,
full-span sampled positions, persisted FlightEvents, and route context. Flight
Story V2 derives the summary and narrative entirely from that payload: the
persisted Flight start/end values are observed boundaries, the sampled path
provides bounded distance/max-speed metrics, and FlightEvents remain explicitly
inferred with confidence plus nearest sampled telemetry. One playback timestamp
drives map, narrative seek, profile, event selection, and Map Context V2. No
second stream or history query is opened and no detector, alert, or notification
write path runs during playback.
## Altitude provenance flow

Beast, local `aircraft.json`, and optional network observations are normalized
into typed field-level altitude observations. The centralized altitude policy
uses source priority, observation freshness, confidence, disagreement, and a
temporal vertical-rate guard to produce one `AltitudeDecision`. The selected
value and decision metadata travel together into sampled `FlightPosition`
rows; only significant conflicts create bounded `AltitudeAnomaly` rows. The
full decision is available to protected admin diagnostics, while global SSE
payloads remain unchanged. Historical positions are intentionally left with
NULL provenance.
