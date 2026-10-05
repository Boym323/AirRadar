# Operational Digital Twin V1

Operational Digital Twin V1 is AirRadar's bounded prospective situation layer.
It combines existing live and published context into one 30-minute aircraft
outlook. It does not introduce a new traffic source and it is not an ATC
clearance, certified flight-management trajectory, separation product, or
safety assessment.

## Product contract

The public endpoint is:

`GET /api/aircraft/:hex/situation`

The response contains:

- the current observed aircraft identity and observation timestamp;
- a 30-minute 4D corridor sampled every two minutes;
- route-aware waypoint estimates when usable Route Intelligence V2 geometry is
  available;
- future ATC airspace changes derived from the published ATC/ATS dataset;
- time-valid AUP/UUP plan intersections;
- time-valid and altitude-compatible SIGMET intersections;
- readiness-gated PUBLIC ETA, runway and trajectory advisories;
- one ordered situation timeline with provenance and confidence;
- explicit model limitations.

The aircraft detail page consumes the endpoint on demand. There is no additional
SSE connection or periodic browser polling loop in V1.

## Corridor

The corridor starts at the current live aircraft position. When Route
Intelligence reports usable geometry and the aircraft is not `OFF_ROUTE`, the
horizontal path follows the remaining published/interpreted route. Otherwise it
falls back to a current-track/current-groundspeed kinematic projection.

The projection is intentionally bounded:

- horizon: 30 minutes;
- display/intersection sample step: 2 minutes;
- targets on ground or below 30 kt are not projected;
- vertical-rate extrapolation is applied for at most 10 minutes and then held,
  with altitude clamped to 0–60,000 ft;
- horizontal uncertainty grows with horizon and is larger for kinematic or
  partial route geometry.

The corridor is a situational estimate. It does not model future ATC vectors,
speed clearances, level clearances, turns not present in the interpreted route,
or aircraft performance.

## Situation events

V1 can emit:

- `WAYPOINT`
- `ATC_SECTOR_ENTRY`
- `PLANNED_AIRSPACE`
- `SIGMET_INTERSECTION`
- `ARRIVAL_ETA`
- `RUNWAY_EXPECTATION`
- `TRAJECTORY_STATE`

All future events are restricted to the 30-minute horizon.

### Provenance

Events retain one of the following semantics:

- `OBSERVED` — direct current observation;
- `PUBLISHED` — published static route/reference evidence;
- `PLANNED` — AUP/UUP planned allocation only;
- `PREDICTED` — a future AirRadar projection or readiness-gated public
  prediction;
- `INFERRED` — derived context not directly published as the event itself.

AUP/UUP is never relabelled as confirmed real-time activation. Historical
actual activation data is deliberately not fetched by this endpoint.

## Weather Corridor Intelligence V1

The same response now contains a `weatherCorridor` block that applies weather
evidence to the future 4D corridor instead of only to the aircraft's current
position.

V1 uses:

- one bounded PIREP/AIREP query covering 300 NM and six hours;
- the same turbulence/icing severity mapping as Weather Fusion V1;
- report distance from future corridor samples plus projected altitude
  difference;
- temporal, horizontal and vertical SIGMET compatibility;
- ICON-EU only for the unique pressure levels required by the 30-minute
  projection.

PIREP/AIREP is never automatically attributed to the tracked aircraft. A report
is only weather evidence near the projected future path. SIGMET entry/exit is a
sampled estimate with two-minute resolution, not an exact crossing time.

ICON-EU is not presented as hazard prediction. Weather Corridor exposes bounded
wind samples along the corridor plus the along-track trend. A missing provider
degrades the result to PARTIAL/INSUFFICIENT and never becomes an implicit
all-clear.

## Data and runtime boundaries

The server assembler reads the already-running live aircraft RAM state. It does
not:

- query `FlightPosition` or scan historical flight data;
- start or alter the readsb/ADS-B polling loop;
- perform on-demand paid FlightAware enrichment;
- create a database table or write any Digital Twin state;
- expose predictive admin/SHADOW previews.

ATC/ATS context uses the existing dataset loader. Procedure data is read from
the validated local generated procedure repository. AUP/UUP uses a plan-only
cache accessor, avoiding the delayed historical-activation fetch. SIGMET uses
the existing bounded Aviation Weather provider/cache. Weather Corridor also
reuses the existing PIREP cache and shared ICON-EU wind snapshot; it does not
create one upstream request per corridor point. Predictive inputs use the
same readiness enforcement and PUBLIC advisory builders as the existing public
prediction surfaces.

Provider failures are fail-soft. Missing ATC, AUP/UUP, SIGMET or PUBLIC
prediction evidence removes only the affected event classes; a kinematic
corridor can remain available when the live aircraft state itself is usable.

## Current limitations and next phases

V1 provides the domain seam for later Digital Twin phases but intentionally
does not yet persist or calibrate corridor outcomes.

Natural follow-ups are:

1. map rendering of the uncertainty corridor and intersection markers;
2. outcome truth for sector/waypoint/weather crossing timing;
3. route-aware wind-adjusted speed/time propagation;
4. navigation-integrity region intersections;
5. regional multi-aircraft situation graphs and operational alerts.
