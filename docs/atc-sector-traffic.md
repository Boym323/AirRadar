# ATC Sector Traffic Context

AirRadar presents Czech eAIP-published sector volumes together with observed
ADS-B traffic from the existing sampled `FlightPosition` history. A traffic
level describes intensity inside a published volume; it is not an operational
ATC status. AirRadar does not currently have a public authoritative source for
the real-time operational sector configuration of Praha ACC.

The traffic API accepts an explicit UTC `at` value for Time Machine requests.
Without it, the current evaluation time is used. A snapshot is classified in
one database window and then matched against the existing `AtcSector`
geometries, including altitude limits. Unknown or non-comparable altitude is
kept conservative by the existing matcher.

`GET /api/atc/sectors/traffic` returns all supported Praha ACC sector
contexts. `GET /api/atc/sectors/:id/traffic` returns one context.
`GET /api/atc/sectors/transitions?at=...&window=1m|5m|15m` counts deduplicated
flight transitions. Unknown observations are not transitions. Short boundary
jitter is collapsed before counting, but transitions are still observational
inferences from sampled history.

The map overlay provides an optional `ATC Sector Traffic` view over the shared
sector source. The `ATC Vertical Traffic` panel currently exposes the verified
SOUTH stack (`LKAAS`, `LKAANSL`, `LKAATB`) in published vertical order. NORTH
and WEST are intentionally not presented until their relationships are
unambiguous across imported AIRAC data. The Sector flows panel uses one
transitions request for the selected 1, 5, or 15 minute window; its entries
represent movement between published volumes, not confirmed ATC handoffs.

The aircraft quick detail reuses the existing point/altitude sector match and
the already loaded batch traffic context. It uses “Published sector” and
“Sector traffic” wording and reports unavailable data as `—` rather than
claiming a current operational assignment. Historical requests use the same
map-time timestamp for traffic, flows, and aircraft context; live requests
refresh traffic at 12 seconds and flows at 15 seconds.

Published frequencies remain owned by the existing `AtcSector` model. No
database migration is required for the current context and transition APIs;
the current model is sufficient for its normalized MHz representation. Channel
designators and 8.33 kHz carrier mapping should not be inferred until the eAIP
import format exposes them explicitly.

Aircraft traffic inside a published sector volume must not be interpreted as
evidence that the sector is currently operated independently.

## Traffic history UI

The `Traffic history` section is lazy-loaded from the historical API and is
not polled with the live map. Ranges map centrally to buckets as follows:
`1h` → `1m`, `6h` → `5m`, `24h` → `15m`, and `7d` → `1h`. Single-sector
history uses one sector request; comparison and SOUTH history use one batch
request for up to three sectors (`TB`, `SL`, and `S`).

The history window ends at the effective Global Map Time. In Time Machine mode
the `at` instant is used rather than the real current time. Missing values are
rendered as gaps/“No data”; they are not converted to zero. Summary values
(peak, average, entries, and exits) are taken from the backend response.
Charts describe aircraft observed within published SOUTH sector volumes and do
not represent the operational ATC sector configuration. Results depend on
AirRadar ADS-B coverage and retained `FlightPosition` data.

## Performance characteristics

`getSectorTrafficHistoryBatch()` performs one read query against
`public.FlightPosition` for the requested half-open `[from, to)` interval. The
current query predicates are `recordedAt >= from` and `recordedAt < to`, with a
hard cap of 200,000 rows. It reads the position fields needed by the current
row model (`flightId`, `recordedAt`, `lat`, `lon`, `altitude`, `groundSpeed`,
and `verticalRate`); the lightweight database collection boundary currently
does not expose a select projection.

Rows are bucketed in memory, then each requested sector applies the existing
point, validity-time, and altitude-aware `matchSector()` matcher. Entries and
exits are inferred from consecutive samples per flight inside each bucket.
Thus the dominant application-side work is proportional to positions ×
requested sectors, with additional per-sector transition grouping and sorting.
No spatial database predicate is used.

The verified `FlightPosition` indexes are `@@index([recordedAt])` and
`@@index([flightId, recordedAt])`. No new index or migration was added. The
timestamp index supports the historical range predicate; the composite index
supports the per-flight transition ordering. There are no verified latitude,
longitude, altitude, or combined spatial indexes.

Live-database benchmark and `EXPLAIN ANALYZE` execution were intentionally not
run in the production-capable checkout because `DATABASE_URL` is configured
and the repository rules prohibit unbounded or potentially load-producing
production diagnostics without an isolated development database. Therefore no
runtime, row-count, memory, query-plan, or response-size figures are claimed
here. A representative benchmark must be run against a separately provisioned
development snapshot before making an optimization decision.

No cache or preaggregation was introduced. At present there is insufficient
isolated benchmark evidence to claim that preaggregation is required or that a
cache would provide a meaningful benefit.

## Historical processing and benchmarking

Historical processing uses sequential half-open time chunks with a
`limit + 1` sentinel per chunk. Dense chunks are recursively split down to a
1-second minimum; a still-too-dense minimum chunk fails explicitly with
`ATC_HISTORY_CHUNK_TOO_DENSE`. A 5,000,000-position request guard fails with
`ATC_HISTORY_PROCESSING_LIMIT`. The response exposes `coverage.complete`,
`coverage.truncated`, `coverage.positionsProcessed`, `chunksProcessed`, and
`adaptiveSplits`. Chunk boundaries use `recordedAt >= start` and
`recordedAt < end`, so boundary rows are neither lost nor duplicated. Cursor
pagination is intentionally not used.

The aggregation now processes each chunk immediately. It retains only bucket
accumulators, per-snapshot `Set<flightId>` values, and the previous sector
state needed for entry/exit detection; raw `FlightPosition` rows are released
after each chunk. DB chunks are sequential and analytics bucket boundaries do
not depend on DB chunk boundaries.

The development-only benchmark helper is
`scripts/benchmark-atc-history.ts`. Run it only with an explicitly verified
non-production `DATABASE_URL` and `ATC_BENCHMARK_NON_PRODUCTION=true`, using
`JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-atc-history.ts`. It is
read-only, is not part of build/test/deploy, and reports actual rows,
completeness, timing, response size, and RSS measurements. No benchmark was
run in this production-capable checkout.
