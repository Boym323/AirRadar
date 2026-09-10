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
- `ReceiverDailyStats` for peak concurrent aircraft and complete farthest
  reception metadata;
- the current RAM `ReceiverStatistics` day when it contains live data;
- bounded `Flight.startTime` rows for local-hour traffic distribution; and
- one bounded `Flight.maxAltitude` ranking for the highest observed flight.

PostgreSQL failure degrades this endpoint to an unavailable response and does
not affect the live radar.

## Coverage reliability

Existing daily coverage stores one maximum receiver-to-aircraft distance per
10-degree azimuth bucket. V1.4B therefore calculates robust range statistics
across **daily maxima**, not across individual ADS-B position samples.

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

V1.4B exposes range-scoped records that already have durable aggregate support:

- peak simultaneous aircraft from `ReceiverDailyStats.maxConcurrentAircraft`;
- farthest complete reception record from the existing daily distance record;
- highest observed Flight from `Flight.maxAltitude`.

The implementation does not query historical ground speed from
`FlightPosition`, so it does not expose a fastest-flight record yet.

## Deferred schema-dependent analytics

The current schema cannot persist altitude-band coverage, historical receiver
message counters, or a safe range-scoped fastest-flight record without adding
new aggregate fields/tables. Those features are intentionally deferred until a
separate additive schema/migration design is reviewed and approved.

A future design should continue to aggregate during normal snapshot processing
rather than deriving dashboards by scanning retained `FlightPosition` rows.
