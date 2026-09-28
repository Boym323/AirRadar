# Aircraft Weather Observations V1

AirRadar stores a sparse, quality-controlled stream of aircraft-observed
weather. This is an AirRadar data product, not an official AMDAR feed and not
a claim that AirRadar receives or operates official AMDAR data.

## Sources and provenance

Every weather field keeps its own provenance. `BDS_4_4` means that the field
was decoded from an unambiguous passive Comm-B BDS 4,4 inference with a valid
FOM/source. Values from `aircraft.json` remain `READSB_JSON`; they are not
relabelled as BDS 4,4. Position and altitude provenance remains independent.

BDS 4,4 static air temperature is exposed as `staticAirTemperatureC` and
average static pressure as `staticPressureHpa`. Static pressure is never
presented as QNH. `totalAirTemperatureC` is retained separately and is not
used as the default atmospheric temperature in profiles. Wind direction is
meteorological direction **from** true north, in degrees.

The decoder preserves FOM/source (`INVALID`, `INS`, `GNSS`, `DME/DME`, or
`VOR/DME`), status-bit nullability, categorical turbulence (0 nil, 1 light,
2 moderate, 3 severe), and humidity in percent. BDS 4,5 is out of scope for
V1.

## Ingest, QC and persistence

An observation requires fresh position, altitude, and at least one weather
field. The central pairing limit is 10 seconds and individual field freshness
is 20 seconds. Range checks are deliberately broad; temporal temperature
jumps and implausible wind reversals are rejected. Quality is `HIGH`, `GOOD`,
`LOW`, or `REJECTED`; rejected rows are not normal weather data.

The weather lane uses a bounded per-aircraft in-memory coalescer before
PostgreSQL. `READSB_JSON` uses a 60-second bucket, 1,000 ft altitude-bin
transitions, meaningful weather-change thresholds, and a 120-second heartbeat;
the persisted row remains a real representative observation, not a synthetic
average. `BDS_4_4` is deliberately less aggressive: valid unique frames are
kept and only near-identical repeats inside a short duplicate window are
suppressed. A unique aircraft/time/source key remains a second-line database
safety net rather than the sampling mechanism.

Accumulator state is limited to the latest observation and latest confirmed
persisted summary. Entries expire after 10 minutes of inactivity and the map
is capped at 10,000 aircraft. A normal shutdown makes a bounded best-effort
flush of pending representatives; SIGKILL, OOM, and host failure may lose the
current coalescing window by design. Weather cleanup runs as a periodic,
table-level operation in the history retention lane (currently
`HISTORY_RETENTION_DAYS=30`), never as a per-observation delete.

## Profiles and API

`GET /api/weather/aircraft/observations` supports time, radius, altitude,
source, limit, and offset filters. `GET /api/weather/aircraft/profile` returns
altitude bins (default 2,000 ft) with sample/aircraft counts, freshness, field
availability, and a heuristic confidence.

Profiles first take a median per aircraft and then aggregate across aircraft,
so one aircraft cannot dominate a bin. Temperature uses the median. Wind is
averaged as vector components and converted back to meteorological “from”
direction; 350° and 10° therefore average near 0°, not 180°.

The admin-only endpoint `/api/admin/weather/diagnostics` exposes bounded
counters for candidates, accepted/ambiguous/rejected BDS 4,4 frames, source
counts, persistence reasons, coalescing/exact deduplication, accumulator
entries/evictions/high-water mark, QC, field availability, write failures,
and recent anomaly reasons. No unbounded raw-frame logging is added.

## Production availability baseline

The first production observation window after release on 2026-09-28 showed
`READSB_JSON` as the only persisted weather source: 2,749 rows from 134
aircraft were present in PostgreSQL at 08:00 UTC, with wind in 2,606 rows and
static/total air temperature in 2,740 rows. Static pressure, humidity, and
turbulence were not present in that window. No `BDS_4_4` observation was
accepted or persisted. The live decoder saw 7 BDS 4,4 candidates, 1 ambiguous
Comm-B frame, and 2,860 rejected frames in the corresponding short diagnostic
snapshot. These are receiver-traffic observations, not availability guarantees;
the source remains explicitly provenance-labelled and can change with aircraft
mix and receiver conditions.

## Limitations

Passive Comm-B reception does not identify a register with certainty. The
weather lane prefers false negatives over false-positive weather and drops
ambiguous BDS inference. Coverage is receiver- and aircraft-dependent; the
profile is not a gridded analysis or a model forecast. ICON-EU comparison can
use the shared latitude, longitude, altitude, time, wind, and temperature
fields later, but automated model-bias analysis is not part of V1.
