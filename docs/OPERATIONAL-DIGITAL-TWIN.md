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

1. event-outcome truth for sector/waypoint/weather crossing timing beyond the corridor-position V1;
2. route-aware wind-adjusted speed/time propagation;
3. navigation-integrity region intersections;
4. regional multi-aircraft situation graphs and operational alerts.


## Track Fusion graduation input

Operational Digital Twin can optionally consume the Track Fusion state, but the
integration is fail-closed and disabled by default.

`AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED=true` only becomes effective when
the process-local Track Fusion readiness report is `PASS` and the requested
aircraft has a GOOD observed fused position. Dead-reckoned position is excluded
from this first rollout. Estimated numeric fields also fall back to canonical
live values.

The situation response identifies the input with
`aircraft.stateSource = CANONICAL | TRACK_FUSION` and reports the current
Track Fusion readiness decision. If the per-aircraft fusion gate is not met,
the endpoint remains local-canonical and does not silently expand to a
network-only canonical aircraft.

## Map Corridor Visualization V2

The live radar now renders the already-fetched selected-aircraft situation
response as a dedicated MapLibre projection. V2 does not add another situation
request, browser timer, EventSource, server route, persistence path, or
prediction pass.

The map visualization includes:

- the 30-minute projected corridor;
- a geodesic uncertainty envelope built from each trajectory point's
  `uncertaintyNm`;
- a solid route-aware corridor and a dashed kinematic fallback corridor;
- interpolated +5/+10/+15/+20/+30 minute milestone markers;
- existing Digital Twin situation events at their projected coordinates;
- Weather Corridor turbulence, icing and SIGMET entry/exit markers;
- click popups carrying time offset, evidence type, confidence/provenance and
  source metadata.

The projection is visible only for the currently selected, visible aircraft and
only while its existing `/api/aircraft/:hex/situation` response is available.
Clearing or changing the selection clears the GeoJSON source. The source and
layers are registered on MapLibre `style.load`, matching the radar's existing
overlay lifecycle.

The uncertainty polygon is visualization of model uncertainty, not protected
airspace, containment, separation, or a safety boundary. Weather markers remain
evidence from Weather Corridor Intelligence and are not hazard clearances or
avoidance instructions.

## Outcome Validation V1

Operational Digital Twin now has a bounded prospective calibration lane for the
same corridor that is already returned to the selected-aircraft situation
surface. Validation is request-driven: when an existing
`/api/aircraft/:hex/situation` calculation succeeds, the validator captures
the projected position, altitude and uncertainty at +5, +15 and +30 minutes.

The aircraft state service later resolves those pending samples only against
future LOCAL receiver observations already present in RAM. It prefers the
closest local trail/current observation within a ±20 second truth tolerance and
never substitutes network, merged-canonical, database or historical truth.

The report exposes:

- mean horizontal position error in NM;
- mean projected uncertainty in NM;
- mean position-error / uncertainty ratio;
- share of truth observations that fell inside the stated uncertainty
  envelope;
- mean absolute altitude error when both sides have altitude;
- 5/15/30 minute slices;
- route-aware versus kinematic slices;
- canonical-input versus Track-Fusion-input slices;
- missing-truth expiry rate;
- PASS / WAIT / FAIL calibration state.

The evidence store is process-local and bounded to 24 hours in five-minute
aggregate buckets. A process restart intentionally resets evidence. Capture is
deduplicated per aircraft for 55 seconds and pending truth is capacity bounded.

The first threshold set requires at least two hours of process-local evidence,
90 completed samples overall and 20 per horizon before a quality decision can
leave WAIT. Once complete, PASS requires at least 60% uncertainty-envelope
coverage, mean error no greater than mean stated uncertainty, and no more than
35% expired truth. These are calibration gates, not safety or certification
claims.

Protected inspection is available at:

`GET /api/admin/operational-twin/outcome`

The System page also exposes the same bounded report for authenticated admin
diagnostics.

## Wind-adjusted Timing Shadow V1

The canonical corridor remains untouched. After Weather Corridor has produced
its existing ICON-EU along-track wind samples, a separate shadow model infers a
bounded still-air-speed proxy from the observed groundspeed and the current
along-track wind, then re-times the same corridor distances.

The shadow reports +5/+15/+30 minute checkpoint timing deltas and waypoint
timing deltas. It is fail-closed when current wind, enough unique wind samples,
or a plausible observed groundspeed are unavailable. Stale wind can still
produce a result, but it is explicitly marked STALE.

This model does not alter corridor geometry, canonical event times, PUBLIC ETA,
radar position, history, or outcome truth. Its purpose is to establish an
independent timing candidate that later Event Outcome Validation can compare
against the canonical baseline before any graduation is considered.

## Event Outcome Validation V2

Digital Twin now validates predicted future events separately from V1 corridor
position calibration. The V2 lane is request-driven and captures only events
that were already produced by the existing situation calculation.

Scoreable event classes are:

- `WAYPOINT` — truth is a future LOCAL receiver position within 3 NM of the
  published/interpreted waypoint;
- `ATC_SECTOR_ENTRY` — truth is a future LOCAL receiver observation inside
  the exact published sector geometry and compatible vertical context captured
  by the situation request;
- `SIGMET_INTERSECTION` — truth is a future LOCAL receiver observation inside
  the exact captured SIGMET geometry, validity window and vertical limits;
- `ARRIVAL_ETA` — truth is an independent Flight Intelligence `LANDING`
  event, destination-aware when both sides provide an airport;
- `RUNWAY_EXPECTATION` — truth requires the landing event's independent
  provider-reported arrival runway from terminal evidence. Inferred runway
  geometry is not substituted.

Each captured prediction is evaluated inside a bounded event-specific time
window. Successful observations report signed and absolute timing error.
Runway/destination mismatches and continuously observed spatial/arrival
predictions that fail to occur inside the allowed window become false
positives. Missing receiver continuity or missing provider runway truth remains
separate as `expiredNoTruth` / `unscoreableTruth` and is never converted into
a false positive.

The report includes overall, per-event-type and lead-time slices
(`0_5`, `5_15`, `15_30` minutes), prediction precision, mean timing error,
two/five-minute timing coverage, and truth availability. Evidence is bounded to
24 process-local hours in five-minute buckets and pending predictions are
capacity bounded.

V2 deliberately does **not** publish recall. The validator starts from captured
predictions and therefore cannot claim that every real event which occurred had
a corresponding prediction. A later truth-first lane would be required for a
valid missed-event/recall metric.

PASS/WAIT/FAIL is fail-closed. The first threshold version requires at least two
hours of evidence, 60 scoreable samples, 30 observed timing samples, and at
least two event types with 10 scoreable samples each. Once complete, PASS
requires precision >=70%, mean absolute timing error <=240 seconds, and missing
truth <=40%.

Protected inspection:

`GET /api/admin/operational-twin/event-outcome`

The validator adds no persistence, FlightPosition/history read, upstream
request, timer, EventSource, second Digital Twin calculation or modification of
the canonical corridor.

## Navigation Integrity Corridor V1

The Digital Twin now intersects its existing sampled 30-minute corridor with already-computed active Navigation Integrity regional anomalies. An intersection requires both grid-cell and altitude-band compatibility. The result preserves severity, confidence, affected-aircraft counts, LOCAL/NETWORK evidence, baseline maturity and audit categories. Zero intersections are not an all-clear, and the feature never claims GNSS jamming, spoofing, or an aircraft navigation fault. It adds no HTTP request, timer, detector pass, database access or persistence.

## Wind Timing Graduation V1

Event Outcome Validation V2 now carries a paired waypoint-timing graduation
lane for the existing Wind-adjusted Timing Shadow V1. The same captured
waypoint prediction stores both the canonical event time and the wind-adjusted
shadow time. When one future LOCAL waypoint truth observation resolves the
event, AirRadar scores both timings against that exact same truth point.

Only `AVAILABLE` wind shadows are admitted. `STALE` and `INSUFFICIENT`
wind timing never enter graduation evidence. The comparison is waypoint-only
because Wind-adjusted Timing Shadow V1 currently re-times waypoint/checkpoint
distance along the unchanged corridor geometry; it does not independently
re-time sector, SIGMET, runway or arrival events.

The report exposes:

- paired waypoint samples;
- unresolved/unpaired outcomes and truth coverage;
- canonical and shadow mean absolute timing error;
- mean and relative MAE improvement;
- shadow wins, canonical wins and ties;
- shadow win rate;
- mean absolute wind timing adjustment;
- meaningful-adjustment sample volume;
- PASS / WAIT / FAIL graduation state.

The first threshold set requires at least two hours of process-local evidence,
30 paired waypoint samples, 20 paired samples with at least a 30-second timing
adjustment, and 60% truth coverage. Once those evidence gates are complete:

- PASS requires at least 5% relative MAE improvement and at least 55% shadow
  win rate;
- FAIL requires a material regression of at least 5% MAE or a shadow win rate
  of 45% or less;
- intermediate evidence remains WAIT as inconclusive.

PASS is **not** automatic promotion. The report explicitly returns
`autoPromotion=false`, `manualPromotionEligible=true` only after PASS, and
`canonicalTimingRemainsActive=true` in all states. Canonical corridor/event
timing is therefore unchanged by this phase.

The paired comparison is returned inside the existing protected Event Outcome
report and is also visible on the authenticated System page. It adds no timer,
poller, database persistence, FlightPosition read, second truth observer or
second Digital Twin calculation.

## Regional Situation Graph V1

The regional situation graph is the first bounded multi-aircraft Digital Twin
surface. `GET /api/operations/situation` reads one existing LOCAL
`AircraftStateService` snapshot and derives at most 80 fresh airborne nodes
and 160 contextual relations. It creates no poller, timer, database read/write,
provider request, or second live-state authority.

Relations are intentionally operational context only. V1 can connect aircraft
that share the same resolved destination and aircraft whose simple 5/15/30
minute kinematic projections enter the same broad contextual volume. Projection
uses current track/groundspeed and a vertically bounded continuation of the
observed vertical rate. It does not consume ATC clearances, infer intent, or
model separation minima.

The graph always carries explicit `NOT_SEPARATION_PRODUCT` and
`NO_ATC_CLEARANCE_INFERENCE` limitations. An `ELEVATED` relation means only
that the bounded contextual thresholds are tighter; it is not a collision,
conflict, TCAS, STCA, or safety alert. A later attention layer may summarize
these relations without changing that boundary.

## Operational Attention V1

Operational Attention V1 is a deterministic summary over Regional Situation
Graph V1. It is returned by the same `GET /api/operations/situation` request
under `attention`; no second live snapshot, poller, persistence path or
provider call is introduced.

The bounded list currently highlights two explainable patterns: an elevated
projected co-presence relation already present in the regional graph, and a
resolved-destination cluster containing at least three live aircraft. Items are
ordered and capped at 12. `WATCH` and `ATTENTION` are product-priority
labels only.

Every response preserves `OPERATIONAL_CONTEXT_ONLY`,
`NOT_COLLISION_WARNING` and `NOT_SEPARATION_PRODUCT`. The feature does not
calculate loss of separation, collision probability, TCAS/STCA logic, or issue
navigation/ATC instructions.

## Truth-first Event Validation V1

Event Outcome V2 is prediction-first and therefore cannot measure recall. The
Truth-first V1 lane adds the inverse accounting for independent terminal truth:
every destination-resolved Flight Intelligence `LANDING` is treated as an
`ARRIVAL_ETA` truth event, and a landing with independent provider-reported
arrival runway also becomes a `RUNWAY_EXPECTATION` truth event. The validator
then asks whether a semantically matching Digital Twin prediction had already
been captured during the preceding bounded 35-minute window.

The existing protected event-outcome report now includes `truthFirst` with
truth counts, predicted truth, missed truth, recall and timing error. Evidence
is process-local, 24-hour bounded and deduplicated by landing lifecycle key.
The initial quality gate remains WAIT until at least two hours and 20 scoreable
truth events exist; afterwards recall below 70% is FAIL.

V1 deliberately reports
`WAYPOINT_SECTOR_WEATHER_RECALL_UNAVAILABLE`. A valid recall denominator for
those event classes requires an independent truth universe, so prediction
captures are not reused as fake truth. No public prediction policy changes as a
result of this report.

## Wind Timing Promotion V1

Wind Timing Promotion V1 adds the explicit manual transition that the graduation
gate intentionally did not perform. The default remains
`AIRRADAR_DIGITAL_TWIN_WIND_TIMING_POLICY=CANONICAL`. An operator may set
`WIND_GRADUATED`, but it becomes effective only while Wind Timing Graduation
is `PASS`, manual promotion is eligible and the current wind shadow is
`AVAILABLE`.

Only Digital Twin `WAYPOINT` presentation times are replaced with their
graduated wind-adjusted counterparts. Corridor geometry, PUBLIC ETA, runway
advisories, live state and history are unchanged. If readiness falls back to
WAIT/FAIL, wind evidence becomes unavailable, or the current waypoint set
cannot be paired, the effective policy immediately fails closed to
`CANONICAL`.

Calibration remains deliberately canonical even while presentation is promoted:
the canonical situation is captured by Outcome/Event Outcome validators before
the returned response applies wind timing. The response exposes
`windTimingPromotion` with configured/effective policy, graduation decision,
promoted waypoint count and fail-closed reason.

## Calibration Persistence V1

Calibration Persistence V1 keeps completed Digital Twin calibration evidence
stable across normal process restarts without persisting aircraft-level
predictions or truth. PostgreSQL stores anonymous five-minute aggregate buckets
for the corridor-outcome and event-outcome lanes, keyed only by lane, validator
version and bucket start.

The persisted payload contains counters and numeric sums used to reconstruct
the existing 24-hour calibration windows. It deliberately excludes ICAO,
callsign, registration, coordinates, raw truth points, pending predictions and
individual event descriptors. Rows are loaded before the first live refresh,
flushed on a bounded delay and pruned after 26 hours.

Persistence is fail-soft. If PostgreSQL is unavailable or hydration rejects a
malformed/stale bucket, the Digital Twin continues with fresh process-local
evidence. Promotion/readiness thresholds are unchanged; persistence preserves
evidence, it does not weaken graduation gates.

## Regional Operations Center V1

Regional Operations Center V1 surfaces the existing bounded Regional Situation
Graph and Operational Attention summary in the live radar Operations Center.
The browser polls `/api/operations/situation` every 30 seconds only while the
panel is open; the server still reads one existing LOCAL
`AircraftStateService` snapshot and starts no additional receiver poller,
provider request loop or persistence path.

The surface prioritizes destination clusters and elevated projected co-presence,
shows the affected aircraft, and links each aircraft back to the existing radar
focus query. It deliberately uses contextual `WATCH` / `ATTENTION`
terminology. It is not a collision-warning or separation product. Snapshots
older than the bounded freshness window are visibly marked stale and endpoint
failure is fail-soft for the rest of the Operations Center.

## Regional Operations Center V1.1

Regional Operations Center V1.1 keeps the existing bounded regional-situation request and adds an operator-facing 5/15/30-minute projection filter, localized evidence detail, and a graduation status derived from the existing Regional Attention Graduation report. The public situation endpoint exposes only a compact readiness projection; it does not mutate calibration policy or public WATCH/ATTENTION semantics.

Map highlighting is fail-closed. A co-presence pair can be highlighted only when Regional Attention Graduation is `PASS` and `manualPromotionEligible=true`. The overlay connects the pair's current LOCAL radar positions as contextual orientation only; it does not draw a protected area, predicted collision path, loss-of-separation boundary, TCAS/STCA alert, or ATC instruction. Closing the Operations Center or losing graduation/current positions clears the overlay.

V1.1 adds no provider loop, receiver poller, database path, or second live-state authority. Destination clusters remain outside graduation and cannot unlock map highlighting.

## Truth-first Validation V2

Truth-first Validation V2 expands recall measurement beyond terminal outcomes.
It keeps the existing independent landing/runway truth and adds three
independent later-observation lanes:

- `WAYPOINT`: an observed Route Intelligence progress transition from one
  next point to the following point,
- `ATC_SECTOR_ENTRY`: the debounced Flight Intelligence
  `AIRSPACE_ENTRY` event,
- `SIGMET_INTERSECTION`: a later observed aircraft position entering the
  valid SIGMET geometry and vertical band.

The observation step runs before the current request's future events are
captured, so a newly generated prediction cannot satisfy truth from the same
instant. Matching is aircraft + event type + semantic identity and remains
bounded to the prior 35 minutes. Waypoint and SIGMET truth are request-driven
because they reuse the existing Digital Twin request context and add no poller
or provider loop. The report stays process-local and requires both sufficient
truth volume and at least two represented truth domains before it can leave
`WAIT`.

## Regional Attention Outcome Validation V1

Regional Attention Outcome Validation V1 prospectively validates
`REGIONAL_COPRESENCE` attention items against later canonical LOCAL receiver
pair state. Capture is request-driven from the existing
`/api/operations/situation` response and does not add a receiver poller,
provider loop or public alert path.

Only genuinely prospective co-presence items with at least one minute of lead
time are scoreable. The outcome lane records whether both aircraft later enter
the same elevated regional context (within 10 NM and 4,000 ft), precision,
missing-truth rate, timing MAE, observed horizontal/vertical spacing, and
5/15/30-minute horizon slices. Truth requires fresh LOCAL positions and usable
altitudes for both aircraft.

`DESTINATION_CLUSTER` remains explicitly unscored in V1 because sharing a
resolved destination is not by itself an independent future outcome. Immediate
co-presence (lead below one minute) is also tracked separately rather than
inflating prospective calibration.

Completed calibration is stored only as anonymous five-minute aggregates in the
existing `OperationalTwinCalibrationBucket` table under the
`REGIONAL_ATTENTION_OUTCOME` lane. No aircraft identity, pair identity,
position or raw pending prediction is persisted. The readiness result is
`WAIT/PASS/FAIL` only and does not change WATCH/ATTENTION behavior.

## Digital Twin Calibration Center V1

The admin page at `/admin/operational-twin/calibration` consolidates the
existing calibration/readiness lanes into one read-only operational view. It
uses one admin-only no-store endpoint,
`/api/admin/operational-twin/calibration`, and does not create a second
calibration engine or background poller.

The center shows corridor outcome quality, event outcome precision/timing,
Truth-first V2 recall, wind timing graduation evidence, Regional Attention
outcome quality, and restart-stable calibration persistence health. Regional
Attention includes its 5/15/30-minute horizon slices and explicitly reports
unscored destination clusters.

The page is diagnostic only. It cannot change graduation policy, public
prediction policy, WATCH/ATTENTION semantics, thresholds, or persisted
calibration data.

## Regional Attention Graduation V1

Regional Attention Graduation V1 converts restart-stable
`REGIONAL_COPRESENCE` outcome evidence into a formal readiness report. The
gate requires a four-hour observation span, at least 80 scoreable samples,
coverage across every 5/15/30-minute horizon, at least 70% LOCAL truth
coverage, at least 75% precision, and timing MAE no worse than 240 seconds.

Insufficient evidence returns `WAIT`. Complete evidence that misses quality
thresholds returns `FAIL`; only complete evidence that clears all thresholds
returns `PASS`. A PASS sets `manualPromotionEligible=true`, but V1 has
`autoPromotion=false` and does not alter public WATCH/ATTENTION semantics.

The scope remains regional operational context only.
`DESTINATION_CLUSTER`, collision-warning semantics, and separation-product
semantics are explicitly ineligible for graduation.

## Aircraft Operational Focus V1

The selected-aircraft Digital Twin response now includes an additive
`operationalFocus` summary. It is a deterministic prioritization over evidence
already computed by the same `GET /api/aircraft/:hex/situation` request; it
does not add a provider call, browser poller, database read/write, history scan,
or second prediction pass.

V1 can surface four bounded context classes:

- high-severity corridor weather with usable confidence as `ATTENTION`;
- degraded/severe regional Navigation Integrity corridor intersections with
  usable confidence as `ATTENTION`, while reduced or low-confidence evidence
  remains `WATCH`;
- AUP/UUP `PLANNED_AIRSPACE` intersections as `WATCH` only;
- a non-normal readiness-gated PUBLIC `TRAJECTORY_STATE` as `WATCH` only.

Routine waypoint, sector-entry, ETA and runway events remain on the existing
timeline and are not promoted into Operational Focus. Weather exits and
low-severity weather evidence are also omitted. Items are ordered by product
priority, then lead time and confidence, and capped at eight.

`NORMAL` means only that no focus item was produced from the currently
available bounded evidence. It is not an all-clear. AUP/UUP remains planned
allocation rather than confirmed activation, Navigation Integrity remains a
regional heuristic with unknown cause, and trajectory state remains predictive
context. The response therefore carries explicit
`OPERATIONAL_CONTEXT_ONLY`, `NOT_SAFETY_ALERT`,
`NO_ATC_CLEARANCE_INFERENCE`, `SOURCE_SEMANTICS_PRESERVED`, and
`NO_ALL_CLEAR_INFERENCE` limitations.

The aircraft detail UI renders this summary ahead of the individual weather, navigation-integrity and event timelines. The presentation preserves the backend level and source semantics, shows the bounded ATTENTION/WATCH counts, and repeats the no-all-clear / no-safety-alert limitation instead of deriving a stronger UI-only state.

Each rendered focus item links back to the live radar with the aircraft identity and focus item ID. The radar reuses its already-loaded Operational Digital Twin response, highlights only the projected corridor segment up to that focus offset, marks the source evidence position when available, and centers the camera once. Missing or stale focus IDs fail closed and do not create a synthetic map target or another provider/API polling path.
