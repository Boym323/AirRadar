# Data flows

## Live ingest to browser

1. `LocalReadsbProvider` fetches `<READSB_BASE_URL>/data/aircraft.json` on
   the poll interval and refreshes `/data/receiver.json` less often. A missing
   `READSB_BASE_URL` uses `MockReadsbProvider` for demo mode.
2. `normalizeAircraftResponse()` validates the six-hex-character aircraft
   identifier (including readsb's `~` non-ICAO form), converts fields, keeps
   barometric and geometric values, derives altitude/vertical rate, and
   calculates distance and bearing.
3. `AircraftStateService.applySnapshot()` ignores observations older than the
   stale threshold, updates the RAM map by ICAO identity, appends a changed
   position to a bounded trail, and removes aircraft absent from the current
   snapshot. A failed poll removes only entries that have become stale.
4. When enabled, the service runs the `AdsbLolProvider` network lane on its own
   schedule, independent of local readsb retries. The provider polls the public
   ADSB.lol geographic endpoint using the receiver position and configured
   radius, validates and normalizes the response into a separate bounded
   network map, and retains only a bounded stale network snapshot after
   timeout, HTTP, malformed-response, or rate-limit failures. These failures
   never mark the local receiver offline.
5. The service notifies listeners with a snapshot. `GET /api/aircraft` waits
   for the first refresh and returns the safe public DTO. `GET /api/stream`
   subscribes once and sends named `snapshot` SSE events. `coverage=extended`
   explicitly merges the local and network RAM maps; `coverage=local` remains
   the default.
6. Metadata/routes/flight plans, ATC assignments, statistics, and alerts run
   from the same snapshot flow but are asynchronous and isolated from the
   local provider refresh. An enrichment result is applied only if it still
   belongs to the same local aircraft observation. Network-only observations
   are not persisted, enriched, assigned ATC, or evaluated by alerts.

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
`EventSource` behavior after a network interruption. The statistics page has
its own page-scoped stream for live counters.

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
provenance; older observations never roll back the target. The OGN DDB is
refreshed atomically in bounded RAM and is never fetched per packet. Privacy is
fail-closed while DDB is unusable, with packet no-tracking and DDB tracked/identified
choices applied before public serialization.

`/api/ogn/state` returns the current bounded snapshot and `/api/ogn/stream`
delivers an initial snapshot plus coalesced updates and heartbeats. OGN has no
effect on `/api/stream`, local aircraft filters, local history, statistics,
alerts, or the main receiver status. Stale targets are marked after 15 seconds
and removed after 60 seconds; the target map is capped at 5,000 entries.

## History persistence

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
receiver-observed traffic, not a complete airport traffic count.

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

The optional `AdsbLolProvider` is a live display source only. It uses
`/v2/lat/{lat}/lon/{lon}/dist/{radius}`, with a bounded radius/poll interval,
request timeout, maximum aircraft count, stale threshold, and exponential
retry capped by configuration. A 429 response honors `Retry-After` when
present. The merger deduplicates by normalized ICAO hex and treats an
observation as a position candidate only when both coordinates are valid and
`seen_pos` is fresh. Aircraft existence is separate from position usability:
the extended result is the full local/network identity union, so local
aircraft without a fresh position are retained. A fresh usable local position
wins before network freshness is considered; network position is the extended
fallback. If neither source has a fresh position, the local last-known
position is retained when usable, otherwise coordinates remain null. Displayed
network-only aircraft are marked with source provenance; they do not enter
history, local daily statistics, alerts, metadata enrichment, ATC resolution,
or the local receiver health state. Public UI/API output includes ADSB.lol and
ODbL 1.0 attribution.

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

- `ADSBDB` and tar1090 metadata are keyed by aircraft hex; ADSBDB route data
  is keyed by normalized callsign and UTC date. FlightAware flight-plan data
  is keyed by callsign and observed time. All are server-side enrichment with
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
  aircraft and the airport catalog with bounded input/results.
- Server alert rules are read from the runtime state directory
  (`/var/lib/airradar/alerts.json` in production); the watchlist API atomically
  updates that file and reloads the shared `AlertEngine`. Local development
  uses `data/alerts.json`, and the production loader can read that tracked file
  only as a one-time legacy fallback before migration. The two files are never
  used as concurrent writable stores.
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
and fetches at most first/latest lifetime rows per aircraft for labels. Weekly
comparison reads the preceding seven aggregate windows without lifetime
enrichment. Missing aggregate rows remain missing in the response rather than
becoming zeroes. Recaps do not scan `FlightPosition`, make provider requests,
create another EventSource, or add another polling loop.
