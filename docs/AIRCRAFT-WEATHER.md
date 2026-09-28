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

The weather lane is sparse: it samples at most once per aircraft per 20 seconds
unless a meaningful movement, altitude, or weather change occurs. A unique
aircraft/time/source key prevents duplicate rows. Retention follows the
configured database retention policy; cleanup should be implemented as a
scheduled table-level cleanup when production storage requires it, not as a
per-observation delete.

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
counts, persistence, QC, deduplication, field availability, and recent anomaly
reasons. No unbounded raw-frame logging is added.

## Limitations

Passive Comm-B reception does not identify a register with certainty. The
weather lane prefers false negatives over false-positive weather and drops
ambiguous BDS inference. Coverage is receiver- and aircraft-dependent; the
profile is not a gridded analysis or a model forecast. ICON-EU comparison can
use the shared latitude, longitude, altitude, time, wind, and temperature
fields later, but automated model-bias analysis is not part of V1.
