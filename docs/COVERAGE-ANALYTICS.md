# Coverage analytics

AirRadar coverage intelligence is a receiver-observed analytics view. It is not
an air-traffic authority dataset and it does not claim complete traffic or RF
coverage outside what the local receiver actually observed.

## V1.4B data path

`GET /api/statistics/coverage-intelligence?range=7d|30d` is a page-scoped read.
It does not subscribe to `/api/stream`, start a poller, call an external
provider, or read `FlightPosition`.

The response combines:

- `ReceiverDailyCoverage` for 36 fixed 10-degree azimuth buckets;
- `ReceiverDailyCoverageAltitude` for 36 azimuth buckets × 4 altitude bands;
- `ReceiverDailyStats` for peak concurrent aircraft, farthest reception,
  receiver-message totals and fastest-aircraft records;
- current in-process receiver aggregates when they contain live data;
- bounded `Flight.startTime` rows for local-hour traffic distribution; and
- one bounded `Flight.maxAltitude` ranking for the highest observed flight.

PostgreSQL failure degrades this endpoint to an unavailable response and does
not affect the live radar.

## Coverage reliability

Daily coverage stores one maximum receiver-to-aircraft distance per 10-degree
azimuth bucket. V1.4B therefore calculates robust range statistics across
**daily maxima**, not across individual ADS-B position samples.

For each sector and selected 7-day or 30-day period the endpoint returns:

- number and percentage of days with a positive daily maximum;
- median daily maximum distance;
- nearest-rank P95 and P99 of daily maximum distance; and
- the absolute maximum daily distance.

A sector is marked `reliable` only when it has positive observations on at
least half the selected calendar days: 4 of 7 or 15 of 30. This is an evidence
threshold, not a receiver-uptime calculation. Sparse sectors remain visible
but are not eligible for the headline reliable-P95 range.

The current local day may replace persisted values only when the in-process
statistics singleton has real observations. A newly constructed or empty RAM
aggregate must never erase a valid persisted current-day aggregate.

## Altitude-band coverage

The advanced receiver sidecar records a maximum distance for each of 144 fixed
cells per local day: 36 azimuth sectors × 4 altitude bands.

The band mapping is intentionally stable:

- band 0: 0 <= altitude < 5,000 ft;
- band 1: 5,000 <= altitude < 15,000 ft;
- band 2: 15,000 <= altitude < 30,000 ft;
- band 3: altitude >= 30,000 ft.

Aircraft without a finite non-negative altitude are not included in an
altitude band. The public visualization uses nearest-rank P95 of the daily
maximum distance for each band/sector cell, plus the absolute range maximum.
It never derives this view by scanning `FlightPosition`.

## Receiver messages

The local readsb provider already receives the top-level cumulative
`aircraft.json.messages` counter. The advanced sidecar consumes that same value;
it does not perform another HTTP request.

For each day it persists:

- `receiverMessagesCount`: accumulated daily message deltas; and
- `receiverMessagesRawLast`: the last readsb cumulative value used as the
  restart-safe baseline.

A normal increase adds `current - previous`. If the cumulative value decreases,
AirRadar treats it as a readsb reset and adds the new post-reset value. The
persisted raw baseline allows an AirRadar application restart to continue the
same day's count without double-counting the whole readsb process lifetime.

Existing historical rows remain `NULL`. The first deployment day can be
partial because AirRadar cannot reconstruct the already elapsed part of that
day without scanning another historical source. A local-midnight boundary is
accurate to the normal snapshot cadence.

## Fastest-aircraft record

The speed record is receiver-observed and comes only from the current local
readsb snapshot. A candidate must:

- have a valid local position and receiver distance/bearing;
- be airborne; and
- have finite ground speed from 30 through 800 kt inclusive.

The upper bound prevents one malformed ADS-B value from becoming a permanent
record. Speed, ICAO, registration, callsign and timestamp are stored as one
coherent record. No historical ground-speed scan or backfill is performed.

## Persistence and live-path isolation

Advanced receiver aggregation is a small sidecar fed by the same normalized
local readsb snapshot as the live radar. It has **no timer and no poller**.
Database work is queued asynchronously so `LocalReadsbProvider.getSnapshot()`
does not wait for PostgreSQL.

Writes are opportunistically throttled to the existing 30-second statistics
cadence. `provider.close()` waits for the queue and requests a final flush.
Altitude rows are written only for cells whose maximum increased. The maximum
in-memory altitude state is 144 rows for one day.

The new columns are nullable and the new altitude table is additive. Existing
receiver-statistics writes do not update these new columns, so the two aggregate
lanes cannot erase each other's values.

## Hour-of-day traffic

The hour-of-day chart counts persisted receiver-observed `Flight` instances by
the `APP_TIMEZONE` local hour of `Flight.startTime`. The query window is bounded
to the selected local calendar period and reads at most 20,001 timestamps.

The public result is considered complete only when at most 20,000 rows match.
If the sentinel row is present, hourly bins and the busiest-hour ranking fail
closed instead of presenting a partial dataset as complete.

This metric counts Flight instances, not position samples, messages, official
movements, departures, or arrivals.

## Records

V1.4B exposes range-scoped receiver records without `FlightPosition` scans:

- peak simultaneous aircraft from `ReceiverDailyStats.maxConcurrentAircraft`;
- farthest complete reception from the existing daily distance record;
- fastest plausible local aircraft from the new daily aggregate; and
- highest observed Flight from `Flight.maxAltitude`.

## Migration and rollback

The approved V1.4B schema change is additive:

- one new `ReceiverDailyCoverageAltitude` table with primary key
  `(date, azimuthBucket, altitudeBand)` and a cascading foreign key to
  `ReceiverDailyStats(date)`;
- nullable message-counter fields on `ReceiverDailyStats`; and
- nullable fastest-aircraft fields on `ReceiverDailyStats`.

There is no historical backfill and no new index required for the bounded
altitude query because the composite primary key is date-leading.

Application rollback does not require an immediate database rollback. An older
AirRadar build ignores the new nullable columns and table. If schema cleanup is
ever desired, it should be a separate later migration after the application
rollback is proven stable.
