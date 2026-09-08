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
4. The service notifies listeners with a snapshot. `GET /api/aircraft` waits
   for the first refresh and returns the safe public DTO. `GET /api/stream`
   subscribes once and sends named `snapshot` SSE events.
5. Metadata/routes/flight plans, ATC assignments, statistics, and alerts run
   from the same snapshot flow but are asynchronous and isolated from the
   provider refresh. An enrichment result is applied only if it still belongs
   to the same aircraft observation.

The live radar page creates one `EventSource`, maintains a bounded client-side
live trail, animates MapLibre DOM markers, and reconnects through the browser's
`EventSource` behavior after a network interruption. The statistics page has
its own page-scoped stream for live counters.

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
day, produce daily trends, period summary, and populated-bucket coverage
summary. Statistics never publish exact receiver coordinates.

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
- `GET /api/weather/airport/:icao` first resolves a canonical airport and then
  fetches METAR and TAF from AviationWeather.gov on demand. The provider uses
  separate product TTLs, in-flight coalescing, a bounded airport LRU, and
  stale-if-error behavior; weather is never persisted.
- `GET /api/aircraft/:hex/photo` validates the aircraft identity, looks up
  Planespotters metadata by hex and, only when that is empty, by registration.
  The browser loads the allowed HTTPS thumbnail directly; image bytes do not
  pass through the server cache.
- `/api/airports` serves the PostgreSQL airport catalog when non-empty and the
  bundled six-airport fallback otherwise. `GET /api/search` searches live RAM
  aircraft and the airport catalog with bounded input/results.
- Server alert rules are read from `data/alerts.json`; the watchlist API
  atomically updates the same file and reloads the shared `AlertEngine`.
  Separately, the map's browser watchlist is a localStorage filter and is not
  a server notification rule.
- `/fleet` derives its identities from the same server watchlist, keeping only
  `icaoHex` rules and deduplicating by normalized ICAO hex. Callsign,
  registration, pattern, type, and airline rules are observation filters, not
  Fleet identities. One receiver snapshot supplies live/offline state, while
  one shared 30-day `Flight` query supplies the 7/30-day counts and route
  rankings; no second live poller is created.
