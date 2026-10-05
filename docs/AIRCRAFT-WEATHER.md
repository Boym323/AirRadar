# Aircraft Weather Observations V1

## Aircraft Weather UI V1

The radar map exposes a lazy-loaded **Aircraft Weather** panel from the Weather
layer group. It uses the configured receiver position as its default area and
offers 15/30/60 minute windows, 40/80/120/200 km radii, altitude filtering,
SAT temperature and wind vertical profile modes, a compact live observation
list, a shared observation detail view, and a representative latest-per-aircraft
map layer. The panel is responsive as a desktop map overlay and a mobile
bottom sheet. Weather requests, profile rendering, and the weather map source
are not initialized until the panel is opened. Refresh keeps the panel and
filters in place.

The profile uses actual returned bins only. `sampleCount` is displayed as
**observations** and never as raw measurements; `aircraftCount` is shown beside
it because the backend aggregates per aircraft before profile weighting.
Confidence and freshness are shown as text as well as styling. SAT is the
primary environmental temperature; TAT is shown only in observation detail.
Static pressure is labelled “Static pressure”, never QNH. Sources are labelled
as “Aircraft / local readsb” or “Mode-S BDS 4,4 weather”.

Wind direction follows the meteorological convention (where the wind comes
from). The map/profile airflow arrow is rotated by 180° to show destination;
the panel states this convention directly. Humidity and turbulence appear only
when the API returns them. Rejected observations are not exposed.

### Weather Fusion V1 and observed vs ICON-EU

The Aircraft Weather profile still does not pretend that an arbitrary model
level is a physical replacement for a same-time aircraft observation. Weather
Fusion V1 adds a separate, explicitly approximate consistency check: the latest
accepted aircraft wind is compared with the existing ICON-EU context selected
by aircraft altitude and the nearest allowed model grid point. Direction and
speed deltas are exposed as AGREE, MIXED or DIVERGENT. Model disagreement is
not converted into turbulence, icing or any other hazard, and stale aircraft or
model data reduce confidence.

Weather Fusion separately combines bounded evidence for turbulence, icing and
convection from recent aircraft observations, PIREP/AIREP, altitude-relevant
SIGMET context and the nearest available METAR. Each conclusion retains source,
freshness and spatial/vertical context. Missing evidence remains UNKNOWN rather
than being promoted to an all-clear. The result is informational and is not a
certified aviation weather product.

AirRadar stores a sparse, quality-controlled stream of aircraft-observed
weather. This is an AirRadar data product, not an official AMDAR feed and not
a claim that AirRadar receives or operates official AMDAR data.

## Sources and provenance

## V1.1 integration

The latest accepted aircraft observation is a secondary enrichment in the
radar aircraft drawer's **Situation** tab. It is fetched lazily with the
bounded aircraftHex=<hex>&limit=1 observations query, is cancellable when
the selected aircraft changes, and never blocks the primary aircraft detail.
Only fields returned by the observation are shown. Aircraft-observed wind
remains labelled separately from ICON-EU model wind. Weather Fusion V1 now adds
a separate bounded consistency comparison without changing the original
aircraft-observation product or its provenance.

System status exposes a traffic-dependent Aircraft Weather summary. NO DATA
means that no accepted aircraft weather is currently available and does not
degrade AirRadar. Persistence failures are DEGRADED. The summary contains
bounded runtime counters only; it does not expose raw frames or payloads.

npm run audit:aircraft-weather writes
artifacts/aircraft-weather-quality.json. The audit reads at most 20,000
accepted persisted rows from the last seven days and reports source/aircraft
coverage, field availability, altitude and quality distributions, time
windows, BDS counters and likely gaps. Its sample is bounded and is not a
global availability estimate.
If the production database is unavailable, persisted analysis fields are
reported as `null` with an explanation; process-local runtime diagnostics are
reported separately and must not be read as persisted counts.

The live Radar and Time Machine use the same OpenFreeMap dark vector base style
and AirRadar tint. Time Machine overlays initialize on style.load, so
historical aircraft, trail, METAR, wind, radar and AUP/UUP layers do not depend
on remote basemap tile completion. Historical Aircraft Weather playback remains
out of scope; a future historical layer can use the same context-layer
initialization boundary without coupling to the live panel.

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
