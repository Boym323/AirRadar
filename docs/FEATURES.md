# Features and routes

<!-- feature-registry:start -->
## Feature registry

This table is generated from [`features.registry.json`](features.registry.json).
CI verifies that every Next.js page and API route is owned by at least one
registered feature and that the registry contains no stale routes. “Pre-registry”
means the feature existed before registry adoption and its original release has
not yet been historically attributed.

| Feature | Status | Category | Introduced | Pages | APIs | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| Aircraft & Flight Detail | production | history | Pre-registry | `/aircraft/:hex`<br>`/flights/:id`<br>`/history`<br>`/flights`<br>`/compare/flights` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/prediction`<br>`/api/aircraft/:hex/photo`<br>`/api/aircraft/:hex/route-weather`<br>`/api/history/:hex`<br>`/api/history/flights`<br>`/api/history/flights/:id` | Aircraft identity, context, photos, route weather, captured flights, sampled history, and readiness-gated predictive ETA, runway, runway-change, and trajectory advisories. |
| Aircraft Discovery | production | discovery / spotting | Pre-registry | `/discover` | — | Bounded discovery page for notable aircraft. |
| Airport Intelligence | production | airports | Pre-registry | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao`<br>`/api/airports/:icao/movements`<br>`/api/airports/:icao/operations`<br>`/api/airports/:icao/traffic` | Airport catalog, runway context, observed traffic, inferred Airport Operations intelligence, and a shared-stream Airport Live Board with correlated journeys, arrival sequencing, V8 arrival flow and approach-queue state, runway-flow stability, bounded operational exceptions, and LANDED completion. |
| ATC & ATS Intelligence | production | atc | Pre-registry | `/airspace` | `/api/airspace/activity`<br>`/api/atc/sectors`<br>`/api/atc/sectors/:id/history`<br>`/api/atc/sectors/:id/traffic`<br>`/api/atc/sectors/history`<br>`/api/atc/sectors/traffic`<br>`/api/atc/sectors/transitions`<br>`/api/atc/validation`<br>`/api/ats/routes`<br>`/api/navigation/data`<br>`/api/procedures` | ATC sectors, transitions, validation, ATS routes, procedures, planned airspace activity, and bounded global NAVAID/FIX reference data. |
| Explainable Prediction | production | intelligence / prediction | Pre-registry | `/aircraft/:hex` | — | Why/Proč evidence panels for readiness-gated ETA, runway, runway-change and trajectory advisories using a small capability-specific whitelist from the existing canonical prediction evidence. |
| Flight Intelligence | production | intelligence | Pre-registry | `/intelligence` | `/api/intelligence/events`<br>`/api/intelligence/stream` | Lifecycle and transition intelligence event timeline and streaming, with bounded Event Replay links for notable persisted events. |
| FlightAware Usage Administration | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrative usage diagnostics for the optional FlightAware integration. |
| Live Airport Network | production | airports | Pre-registry | `/airports` | — | Bounded /airports operational network showing favorite and live-route-active airports with canonical Airport Operations, receiver-only approach-queue state, likely runway, next inbound estimate, and direct Live Board navigation. |
| Live Radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/operations/predictive`<br>`/api/search`<br>`/api/stream` | Local and extended live ADS-B radar, search, aircraft snapshots, SSE streaming, selected-aircraft Route Corridor Intelligence, and a bounded readiness-gated Predictive Operations Center for ETA, runway, runway changes, and trajectory state. |
| Map Context & Weather | production | weather | Pre-registry | `/weather` | `/api/aircraft/:hex/weather-fusion`<br>`/api/map-context/at`<br>`/api/map-context/aup`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/map-context/wind`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/pirep`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/wind`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Current and historical radar, METAR, wind, SIGMET, AUP/UUP map context, aircraft-observed weather, bounded PIREP/AIREP enrichment, and explainable multi-source Weather Fusion. |
| Mobile / PWA mode | production | platform | Pre-registry | `/`<br>`/airports/:icao` | `/api/push/vapid-public-key`<br>`/api/push/subscribe` | Installable mobile PWA with offline last-state caching, browser-local favorite airports, and optional Web Push notifications for emergency squawks, watchlist aircraft, and geofence events. |
| Navigation Integrity | production | navigation / safety / intelligence | Pre-registry | — | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Conservative ADS-B navigation-integrity observations, bounded regional anomaly candidates, APIs, diagnostics and radar overlay. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Privacy-aware optional OGN/FLARM state and independent SSE stream. |
| Operational Digital Twin | production | intelligence | Pre-registry | `/aircraft/:hex`<br>`/`<br>`/admin/operational-twin/calibration` | `/api/admin/operational-twin/calibration`<br>`/api/admin/operational-twin/event-outcome`<br>`/api/admin/operational-twin/outcome`<br>`/api/admin/operational-twin/regional-attention-graduation`<br>`/api/admin/operational-twin/regional-attention-outcome`<br>`/api/aircraft/:hex/situation`<br>`/api/operations/situation` | Bounded 30-minute aircraft situation projection with route, weather, Navigation Integrity, a canonical Prediction Timeline V1 on aircraft detail, readiness-gated PUBLIC predictive context, prospective outcome validation, wind timing graduation/promotion, regional multi-aircraft attention with LOCAL outcome calibration and graduation-gated 5/15/30-minute map context, multi-domain truth-first recall, and restart-stable anonymous calibration aggregates. |
| Operations Dashboard | production | operations | Pre-registry | `/operations` | — | Live operational dashboard combining canonical local traffic, airport flow, bounded next-30-minute arrival context, Regional Attention, and Flight Intelligence without creating a parallel intelligence engine. |
| Receiver Coverage | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Receiver coverage analysis and dedicated coverage detail. |
| Route Network Explorer | production | analytics / routes | Pre-registry | `/routes`<br>`/routes/:origin/:destination` | — | Bounded today/7d/30d explorer for persisted receiver-observed Flight route aggregates, including top origin/destination pairs and airport navigation without FlightPosition scans. |
| Statistics & Recaps | production | analytics | Pre-registry | `/statistics`<br>`/recap/daily`<br>`/recap/weekly` | `/api/logbook/summary`<br>`/api/recap`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic`<br>`/api/statistics/heatmap` | Receiver statistics, traffic intelligence, reception records, and daily/weekly recaps with Daily Aviation Story airport, operational-event, rare-aircraft, and quality-controlled aircraft-weather highlights. |
| System Observability | production | operations | Pre-registry | `/system` | `/api/admin/altitude/:hex`<br>`/api/admin/predictive/readiness`<br>`/api/health`<br>`/api/system/runtime-history`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version` | Sanitized health, runtime history, provider status, build identity, ADS-B continuity diagnostics and mass-drop guard state, bounded predictive readiness, independent outcome truth, and admin-only graduation calibration. |
| Time Machine | production | history | Pre-registry | `/time-machine` | `/api/time-machine/range`<br>`/api/time-machine/window` | Bounded historical all-aircraft playback, historical context windows, and ±10-minute Event Replay entry points from Flight Intelligence. |
| Track Fusion Shadow | internal | receiver / intelligence | Pre-registry | `/system` | `/api/admin/track-fusion/:hex`<br>`/api/admin/track-fusion/readiness`<br>`/api/admin/track-fusion/outcome` | Shadow-only per-field multi-source state estimator with readiness graduation plus bounded prospective canonical-vs-fused outcome validation against future LOCAL truth; never alters canonical live state or local receiver persistence. |
| Trajectory Conformance | production | navigation / intelligence | Pre-registry | `/` | — | Selected-aircraft route-conformance state machine with persistent deviation, confirmed rejoin and conservative probable-direct inference over Route Corridor Intelligence. |
| Watchlist, Alerts & Fleet | production | alerts | Pre-registry | `/watchlist`<br>`/alerts`<br>`/fleet`<br>`/admin/alerts` | `/api/alerts`<br>`/api/watchlist`<br>`/api/watchlist/:id`<br>`/api/watchlist/activity`<br>`/api/watchlist/session`<br>`/api/admin/alerts/delivery`<br>`/api/admin/alerts/fleets`<br>`/api/admin/alerts/fleets/:id`<br>`/api/admin/alerts/fleets/:id/matchers`<br>`/api/admin/alerts/fleets/:id/matchers/:matcherId`<br>`/api/admin/alerts/geofences`<br>`/api/admin/alerts/geofences/:id`<br>`/api/admin/alerts/history`<br>`/api/admin/alerts/rules`<br>`/api/admin/alerts/rules/:id` | Server watchlists, integrated rule-scoped activity, alert history, rule mutations and fleet views. |
<!-- feature-registry:end -->

## Receiver Explorer V2

`/receiver/coverage` now combines the existing receiver analytics into one
bounded Explorer surface. Historical 7/30-day data reuses
`/api/statistics/coverage-intelligence` for 10° directional median, P95 and
maximum daily range, altitude-band reach, daily trends, records and the
existing rolling weak-sector health model. The page also keeps the existing
`/api/receiver/coverage` network-reference capture polar as a separately
labelled diagnostic.

Live ADS-B/MLAT source mix is derived only from the existing LOCAL SSE
snapshot and is explicitly presented as current telemetry rather than a
historical source-distribution statistic. The Explorer adds no new upstream
provider, poller, database table, migration or receiver hot-path write.

## Proactive Receiver Monitoring V1

The system status response now includes a bounded `receiver.readsb.monitoring`
projection derived from the existing live receiver quality snapshot. It
classifies `HEALTHY`, `DEGRADED`, `OFFLINE`, or `INSUFFICIENT_DATA`, identifies
sanitized likely causes such as a stale readsb source, low message rate, no
aircraft, or stale positions, and gives the operator a first recommended
check. Demo mode is explicitly marked as insufficient data rather than healthy.

This is a read-only evaluator: it adds no poller, database table, persistence
write, SSE lane, or upstream request. The result is available through the
existing `/api/system/status` and `/api/system/stream` boundaries and is shown
on `/system`. Causes are bounded codes with confidence labels; they are
diagnostic hypotheses, not proof of an antenna or RF fault.

## Map Context V1/V2

The home radar includes optional, persisted-off layers for ČHMÚ weather radar
with a two-hour frame timeline, batched AWC METAR markers, cached DWD ICON-EU
wind aloft at 850/700/500/300/200 hPa, and a dedicated AUP/UUP planned-airspace
view. Public endpoints are `/api/weather/radar/frames`,
`/api/weather/radar/frame/:id`, `/api/weather/metar-map`, and
`/api/weather/wind`. Detailed provider semantics and attribution are in
[MAP-CONTEXT.md](MAP-CONTEXT.md). Time Machine adds Global Map Time V2 with
bounded historical radar, METAR, ICON-EU wind and AUP/UUP context.

Status describes the current code path, not a transient runtime count or
whether an operator has configured an optional provider.

## Pages

| Route | Purpose | Production status |
| --- | --- | --- |
| `/` | Live MapLibre radar, aircraft list/filtering, selected aircraft detail, zoom-aware aircraft labels, live trail, route/airport/ATC overlays, optional receiver range rings and aircraft color modes, keyboard shortcuts, SSE connection state, compact ADS-B logbook summary, opt-in SIGMET, Czech ATS route-intelligence, and planned AUP/UUP airspace context. Optional LOCAL/EXTENDED coverage switch combines local readsb with RAM-only ADSB.lol network observations. Optional separate OGN/FLARM layer, list, and detail panel use a dedicated RAM-only SSE flow. | Production core; readsb or demo provider. OGN, weather, ATS route intelligence, and airspace-activity overlays are independent/fail-soft. |
| `/aircraft/:hex` | Flight-card detail with callsign/registration/type/operator header, live movement and provenance, route/flight-plan context, Prediction Timeline V1 over canonical Operational Twin events, first/last-seen timeline, bounded 30-minute altitude chart from the latest FlightPosition history, full-trail action, durable aircraft metadata, recent flight instances, 7/30-day summary, lifetime Flight-instance statistics, NEW/RARE/RETURNING logbook status, optional photo, and compact destination-first/origin weather. | Production; PostgreSQL required for durable detail, weather/photo optional. |
| `/flights/:id` | Flight Story V2 with an observed-flight summary, clearly labeled airport context, notable-event badges, a narrative first-seen → inferred-event → last-seen timeline, bounded playback, and altitude/speed/vertical-rate profiles synchronized to one playback clock. | Production with PostgreSQL history. |
| `/airports` | Live Airport Network V1 above the searchable airport catalog: favorite and live-route-active airports, unique 24h arrivals/departures, likely runway, receiver-only approach queue, inferred next inbound estimate, and direct Airport Live Board navigation. | Production; bounded to six cards and existing LOCAL stream + canonical Airport Operations, with no new prediction engine or persistence path. |
| `/airports/:icao` | Airport Live Board V2 on the Airport Intelligence V3 foundation: one shared 24h operations/weather controller with 30-second bounded refresh, recent receiver-inferred arrivals/departures, operational events, runway usage + receiver-vs-wind intelligence, compact current weather, unified Flight Story timeline, plus catalog metadata, runway geometry, METAR/TAF, live nearby ADS-B traffic, navaids, nearby airports and 7/30-day receiver traffic summary. | Production; movement/runway results are bounded local-receiver inferences, not airport FIDS or authoritative ATC data. |
| `/operations` | Live Operations Dashboard V1 combining canonical LOCAL traffic, airport origin/destination flow, existing Airport Operations, readiness-gated public ETA with an explicitly inferred terminal-demand fallback, Regional Attention and notable Flight Intelligence events. | Production read-only aggregation; no parallel poller, prediction engine, persistence path or ATC/separation semantics. |
| `/history` | Bounded flight-instance search/list, sampled position detail, playback map. | Production; PostgreSQL feature, no live-polling dependency. |
| `/time-machine` | Bounded all-aircraft historical radar playback with UTC selection, timeline, event markers, aircraft selection, selected trail, and optional historical radar/METAR/wind/AUP-UUP context. | Production with PostgreSQL `FlightPosition` history; context availability follows bounded archive activation and retention. |
| `/statistics` | Today/7-day/30-day receiver aggregate, current-versus-previous period comparison, trends, coverage visualization, reception records, bounded CSV export, receiver-observed traffic intelligence, and 7/30-day coverage reliability/receiver analytics. | Production core; traffic and range analytics use bounded PostgreSQL reads, while current receiver counters remain RAM-backed. |
| `/watchlist` | Server alert-rule editor with 10/25/50/100 km distance presets, current matching state, enable/disable controls, and the last persisted trigger time for each rule. | Production; shared `/var/lib/airradar/alerts.json` rules plus bounded `/var/lib/airradar/alert-engine-state.json` dedup/trigger state. Read-only state is public and mutations require the server-side admin session. |
| `/alerts` | Bounded history of watchlist appearance/radius transitions, individual 7500/7600/7700 emergency transitions, new-aircraft/reception-record events, and notification outcomes, with server-side event filtering before pagination. | Production; safe append-only `/var/lib/airradar/alert-events.jsonl` ledger, notifier payloads excluded. |
| `/recap/daily` | Daily Aviation Story with Prague-local boundaries: unique aircraft and flights, busiest hour/airport, reception record, rare/returning aircraft, go-around/holding/diversion/emergency/unusual-event counts, ranked airlines/routes, and bounded quality-controlled aircraft-weather highlights. | Production when PostgreSQL history/aggregates are available; aircraft-weather highlights fail soft and never claim causal flight impact. |
| `/recap/weekly` | Seven-day receiver recap with bounded comparison to the preceding seven days. | Production when PostgreSQL history/aggregates are available. |
| `/fleet` | Concrete aircraft from ICAO watchlist rules, live/offline state, recent observed-flight counts, routes/airports, and lazy photos. | Production; non-identity watchlist rules are omitted, PostgreSQL history is optional. |
| `/system` | Sanitized runtime, receiver, persistence, statistics, ATC, weather, OGN, alerts, airport status, and process-local ADS-B continuity diagnostics covering omission/recovery, source failover, and mass-drop guard counters. Lazy weather/radar/wind/ADSBDB providers expose `ON DEMAND`/`LOADING` cold-start states and bounded safe reasons for degraded/offline states. | Production read-only diagnostics; it never triggers optional upstream requests. |

## Event Replay V1

Replayable Flight Intelligence events — GO_AROUND, HOLDING, DIVERSION, UNUSUAL_TURN and ORBIT — expose a `Replay ±10 min` action on `/intelligence`. The action opens `/time-machine` centered on the persisted event time, carries the event aircraft identity through `hex` and optional `flightId`, and preselects the matching historical track when it exists.

Normal Time Machine browsing keeps its existing five-minute server window. Event Replay explicitly requests `mode=event-replay`, which permits a bounded 20-minute window (10 minutes before and after the event) under the existing caps for positions, aircraft and events. No new ingest, event detector, database table or persistence path is introduced. Emergency squawks are not folded into Flight Intelligence because they are alert-domain events rather than `FlightEventType` records.

## PIREP / AIREP Intelligence V1

AirRadar can enrich its locally observed ADS-B weather context with bounded
pilot/aircraft reports from the public Aviation Weather Center data API. The
integration is server-side and on-demand; browser clients never call the
upstream service directly.

`GET /api/weather/pirep?lat=&lon=&radiusNm=&hours=&altitudeFt=` accepts a
bounded geographic query (10–300 NM, 1–24 hours, optional 0–60,000 ft level),
uses a five-minute in-memory cache with a bounded stale-if-error window, caps
normalized results, and preserves source provenance as Aviation Weather Center.
No database writes, migrations, background poller, or ADS-B hot-path work are
introduced.

Aircraft Weather shows the external PIREP/AIREP reports only when it has an
explicit map/aircraft center. Turbulence, icing, temperature, wind, aircraft
type, altitude, urgency and observation age are presented separately from
AirRadar's own Mode-S/BDS 4.4 observations. Reports are not automatically
attributed to aircraft captured by the local receiver.

## Aviation Weather Fusion V1

Weather Fusion V1 adds an explainable, on-demand synthesis for a live locally
received aircraft. `GET /api/aircraft/:hex/weather-fusion` combines existing
AirRadar weather products without creating a new ingest or persistence lane:
recent quality-controlled aircraft weather (including Mode-S BDS 4,4),
PIREP/AIREP within 120 NM and six hours, current/projected altitude-relevant
SIGMET context, the nearest available METAR within 120 NM, and the existing
ICON-EU pressure-level wind context.

The result exposes separate TURBULENCE, ICING and CONVECTION signals. Every
positive signal keeps explicit evidence records with source, severity,
confidence, observation time and, where applicable, distance and altitude
difference. Independent agreeing sources can raise confidence; a stronger
altitude-relevant SIGMET can dominate weaker evidence. Missing evidence never
turns into an implicit all-clear: an overall NONE state is emitted only when
all tracked risks are explicitly cleared, otherwise the result remains UNKNOWN.

Observed aircraft wind can be compared with the already-selected nearest
ICON-EU pressure-level/grid value. The comparison reports direction/speed
deltas as AGREE, MIXED or DIVERGENT, but disagreement is not converted into a
weather hazard. Old aircraft observations and stale model snapshots reduce
confidence.

METAR-based icing is intentionally only a LOW-confidence derived signal from
moisture/precipitation near freezing; it is not a diagnosis of in-flight icing.
The aircraft page presents the fused result, source coverage and bounded
evidence separately from the underlying raw products and carries an explicit
non-certified-weather disclaimer.

Fusion is fail-soft across providers and returns PARTIAL/INSUFFICIENT when
sources are missing. It adds no database migration, background poller, SSE
connection or ADS-B hot-path work. Existing provider caches remain authoritative
for upstream request control and the fusion endpoint itself is `no-store`.

## Weather Avoidance Intelligence V1

Weather Avoidance Intelligence V1 upgrades the existing SIGMET trajectory
deviation signal into a conservative multi-layer correlation product for the
currently selected aircraft. It does not infer crew intent.

The signal starts from the existing geometric prerequisite: an earlier
2–10-minute track projection intersected an active SIGMET, the aircraft made a
meaningful course change, and the short current-track projection no longer
enters that advisory. V1 then cross-checks two newer intelligence layers:

- Trajectory Conformance must independently show OFFSET, DEVIATING, REJOINING,
  or PROBABLE_DIRECT before the stronger `POSSIBLE_WEATHER_AVOIDANCE`
  classification is allowed.
- The existing 30-minute Weather Corridor must have usable SIGMET coverage and
  no new entry into the same SIGMET. If the corridor still enters the advisory,
  the result is explicitly `CURRENT_CORRIDOR_EXPOSED` instead.

High confidence requires the original medium-confidence SIGMET deviation,
available/current SIGMET corridor data, a route-aware 30-minute corridor and
non-low Trajectory Conformance confidence. Stale SIGMET data, a kinematic
corridor, low conformance confidence, or missing corridor coverage cap or reduce
the result. Missing evidence fails closed to the weaker
`CORRELATED_DEVIATION` classification.

The radar detail shows the earlier projected exposure, current 30-minute
exposure, route-conformance state and correlation confidence. The feature
reuses the existing selected-aircraft `/api/aircraft/:hex/situation` request
on a bounded 60-second refresh; it adds no database model, persistence path,
SSE stream, upstream weather provider, or ADS-B hot-path work.

The output is informational correlation only. It does not claim why the crew
changed course, whether ATC instructed the maneuver, or whether the maneuver was
a flight-safety decision.

## Weather Corridor Intelligence V1

Weather Corridor Intelligence V1 applies the same conservative weather
semantics to the Operational Digital Twin's 30-minute 4D corridor. It adds no
new browser request, stream, or periodic polling loop: the existing
`GET /api/aircraft/:hex/situation` response now includes a
`weatherCorridor` block alongside the existing future events.

The server performs one bounded PIREP/AIREP query covering 300 NM and six hours
without filtering to the current altitude, so reports can be compared with the
projected altitude of each future corridor sample. Turbulence or icing is only
published when a report is near a future corridor point and not vertically
irrelevant. Confidence accounts for corridor distance, altitude difference,
report age, and stale upstream state.

SIGMET is evaluated at every two-minute corridor point for horizontal,
vertical, and temporal compatibility. V1 emits the first sampled entry and exit
for turbulence, icing, or convection. These times remain deliberately bounded
by corridor sampling and do not claim the exact crossing time between samples.

ICON-EU is requested only for the unique pressure levels required by projected
corridor altitudes. The existing wind provider shares its cache and in-flight
snapshot, so this does not create one upstream request per corridor point. The
UI exposes bounded 0/10/20/30-minute samples and classifies the along-track wind
trend as increasing headwind, increasing tailwind, stable, or variable.

Weather Corridor exposes explicit AVAILABLE/PARTIAL/INSUFFICIENT state plus
per-source availability. Missing PIREP, SIGMET, or ICON-EU evidence never
becomes an implicit weather all-clear. The feature adds no database migration,
background poller, additional SSE connection, or ADS-B hot-path work and
remains informational rather than a certified aviation-weather product.

## Aviation Nav Data V1

AirRadar can load bounded global NAVAID and named FIX/waypoint reference data
from the public Aviation Weather Center Data API.

`GET /api/navigation/data?lat=&lon=&radiusNm=&kinds=NAVAID,FIX` is server-side,
rate-limited and bounded to a 10–250 NM receiver-centered query. The provider
uses only documented `bbox` and `format=json` parameters, caps normalized
results, coalesces identical in-flight requests, caches successful responses for
six hours, and can serve a bounded stale snapshot when the upstream service is
temporarily unavailable.

The radar exposes the data as an optional NAVAID/FIX layer. NAVAIDs and fixes
are visually distinct and labels appear only at higher zoom. This global AWC
reference layer does not replace or override published CZ/SK/AT eAIP ATS routes,
procedures, or their provenance.

No database migration, background poller, new SSE stream, or ADS-B hot-path work
is introduced.

Exact NAVAID/FIX identifiers also participate in global Command Search. Search
uses the documented AWC `ids` parameter, accepts only normalized 2–8 character
identifiers, caps each lookup to eight ids, coalesces concurrent lookups and
reuses the same six-hour server cache policy. AWC failure is non-fatal to the
rest of global search.

Choosing a global NAVAID/FIX search result enables the map layer and centers
the radar on that point. When a selected aircraft has a filed route, the
already-loaded AWC points referenced by that route are highlighted using the
existing Route Intelligence tokenizer. This is display/enrichment only:
AWC points never replace eAIP ATS/procedure geometry or alter route authority.

## Route Corridor Intelligence V1

Route Corridor Intelligence extends the existing Route Intelligence V2 model for
the currently selected aircraft. The browser performs one bounded same-origin
navigation-reference lookup when the filed-route identifier set changes; it
does not add another aircraft stream, timer, or background poller.

Published ATS and procedure geometry remains authoritative. Bounded AWC
NAVAID/FIX coordinates can resolve otherwise-unresolved filed/DCT endpoints,
but that fallback is labeled as schematic `FILED_ROUTE` geometry and never
promoted to published ATS evidence.

The live radar renders resolved route geometry as completed, current and
remaining segments and keeps the previous origin-current-destination line as a
fallback. The aircraft drawer shows progress, next fix, remaining resolved
distance, groundspeed-based ETA, cross-track deviation, expected segment track,
track difference and reconstruction confidence.

A persistent `DEVIATING` state requires three distinct observations with more
than 10 NM cross-track deviation spanning at least 10 seconds; recovery requires
two observations spanning at least five seconds. These are informational
display thresholds, not certified navigation limits or ATC guidance. V1 does
not persist deviation events and adds no database migration.

## Trajectory Conformance V1

Trajectory Conformance V1 is a selected-aircraft state machine over the
existing Route Corridor Intelligence V1 and Route Intelligence V2 outputs. It
adds no aircraft stream, timer, provider, database model or persistence path.

States are `ROUTE_UNKNOWN`, `ROUTE_UNCERTAIN`, `ON_ROUTE`, `OFFSET`,
`DEVIATING`, `REJOINING` and `PROBABLE_DIRECT`. V1 consumes only already
computed route geometry, cross-track state, track difference and ordered
reconstructed route elements.

`REJOINING` is entered only after confirmed `DEVIATING`, and recovery to
`ON_ROUTE` requires two distinct observations spanning at least five seconds.
A probable direct is never inferred from ordinary route progress alone: after
confirmed deviation the aircraft must skip at least two resolved en-route
elements spanning at least 10 NM and stably reacquire a later element. From a
mere `OFFSET` state the evidence requirement is stricter: at least three
elements and 20 NM.

Reconstruction coverage below 50 percent or an unusable dynamic route fails
closed to `ROUTE_UNCERTAIN`. Detection retains only a bounded tracker for the
selected aircraft plus shadow counters; V1 emits no Flight Intelligence events
and writes nothing to PostgreSQL.

The Route Corridor card labels the result explicitly as inferred intelligence.
`PROBABLE_DIRECT` is not proof of ATC clearance and `DEVIATING` is not a
certified navigation or safety alert.

## Airport Live Board V5

V5 keeps the same bounded, shared-data airport architecture and adds no new
network or persistence path. The active journey snapshot from V4 — including
the conservative LANDED state — is folded into a NOW Flow Pulse showing
inbound, final, holding, outbound, go-around and route-conflict counts.
Correlated versus live-only coverage remains visible.

A bounded attention list surfaces only operational exceptions: GO_AROUND,
HOLDING and route conflicts. Ordering is deterministic: go-arounds first,
holding second, route conflicts third, then nearest aircraft; the list is
capped at six. Normal journey rows, including LANDED, are deliberately excluded
from attention.

The pulse and exception list are pure in-memory projections over the existing
single airport SSE plus bounded operations snapshot. Existing journey states,
Flight Story links, recent movements, runway usage, METAR and runway-vs-wind
intelligence remain unchanged. The board is observational/inferred, not FIDS or
ATC guidance.

## Airport Live Board V6

V6 adds a short-term Flow Trend / Pressure panel without changing the existing
shared-data architecture. Receiver-inferred arrivals and departures are compared
across consecutive 15-minute windows; a trend requires a difference of at least
two movements. Recent holding uses the current 15-minute window, while
go-arounds use a 30-minute exception window.

A bounded deterministic pressure level summarizes the existing NOW flow and
clear rising-trend signals. Runway-flow consistency uses the latest 30 minutes
of runway-bearing movement evidence and requires at least three samples; a
dominant runway must reach 75 percent to be labeled STABLE. These values remain
observational/inferred and do not represent airport capacity, delays or ATC
guidance. V6 adds no fetch, EventSource or persistence path.

## Airport Live Board V7

V7 adds Runway Flow / Stability over the existing shared airport data. It
compares consecutive 15-minute runway-evidence windows, deduplicates each flight
to its newest runway-bearing movement, separates current arrival/departure
evidence, and reports reported versus inferred sample counts.

STABLE requires at least three samples in both windows with the same dominant
runway at >=75 percent in each. TRANSITIONING requires at least three samples in
both windows, a changed dominant runway, and >=60 percent support for both the
old and new dominant runway. MIXED and INSUFFICIENT remain explicit fail-closed
states. Current flow is compared with the wind-favoured runway only when runway
evidence is sufficiently strong. No new fetch, SSE, API or persistence path is
introduced.

## Command Search V2

The root-level Command Search palette remains available from every route through
`⌘K` / `Ctrl+K` and the topbar trigger. `GET /api/search?q=` now merges the
existing live aircraft, airport and ATS-point results with bounded historical
Flight matches from the latest seven days. Flight search is enabled from three
characters, reads Flight rows only, never scans FlightPosition, and fails soft
when PostgreSQL is unavailable.

Deterministic smart actions recognize a deliberately small set of exact intents:
today's go-arounds, today's rare aircraft, `<ICAO> operations`, and
`flights to <ICAO>`. Exact smart actions short-circuit before live-state or
database work and navigate only to existing AirRadar surfaces. Historical
destination actions use the exact `destination=` filter on
`GET /api/history/flights`. Keyboard navigation and the five-item internal
browser-local recent list remain unchanged; no LLM or additional live stream is
involved.
## Predictive Graduation Readiness V1

Public predictive capabilities remain opt-in and default to `SHADOW`.
Graduation Readiness adds a versioned, fail-closed evidence gate for ETA,
runway, runway-change and trajectory advisories. The 30-day runtime report is
admin-only on `/system` and `GET /api/admin/predictive/readiness`; it reads
bounded `PredictiveObservation` rows plus independently captured persisted
`LANDING` terminal evidence and never scans `FlightPosition`.

Each capability receives `PASS`, `WAIT` or `FAIL` with stable reason
codes and frozen `predictive-readiness-v1` thresholds. Missing ground truth,
missing instrumentation, or a truncated bounded result yields `WAIT`;
lifecycle integrity conflicts or sufficiently evidenced quality misses yield
`FAIL`. Setting an `AIRRADAR_PREDICTIVE_*_STATUS=PUBLIC` environment value
is not sufficient by itself: the aircraft prediction API applies the readiness
gate and downgrades non-PASS capabilities back to `SHADOW`. No capability is
automatically promoted to `PUBLIC`.

## Predictive ETA Advisory V1

The live aircraft detail reuses
`GET /api/aircraft/:hex/prediction` and renders ETA only when ETA is
explicitly configured `PUBLIC`, the current readiness decision is `PASS`,
the prediction is fresh, the arrival time is still in the future, and the
readiness report contains a calibrated p90 ETA error. That p90 error is shown
as the `±` uncertainty; AirRadar does not invent a heuristic uncertainty.

With a valid admin session the same endpoint may add a SHADOW preview with
readiness/stale/expired state. That preview is never part of an anonymous
response. Aircraft detail performs one page-scoped prediction fetch and adds no
poller, EventSource, or persistence path.

## Predictive Runway Advisory V1

The same page-scoped prediction response now carries a runway advisory without
adding another fetch or stream. Public runway presentation requires
`RUNWAY=PUBLIC`, runtime readiness `PASS`, a prediction no older than 45
seconds, a non-null predicted runway, and known confidence. `WAIT`, `FAIL`,
`SHADOW`, stale, unavailable, and unknown-confidence states render no public
runway.

A valid admin session may receive a separate runway SHADOW preview with
readiness reasons, exact-runway-end accuracy, coverage, confidence and
freshness state. The UI labels the value as predicted rather than observed or
confirmed ATC information and auto-expires an already-rendered value at the
same 45-second freshness boundary. No persistence, migration, model, poller or
EventSource is added.

## Predictive Runway Change Advisory V1

A runway change is a distinct capability from the current runway prediction.
The engine retains the actual previous predicted runway as `changedFrom`; the
ordinary `alternative` field remains the second current runway candidate and
is never used as change provenance. A confirmed prediction transition is held
in RAM for a bounded five-minute advisory window without adding persistence.

Public presentation requires `RUNWAY_CHANGE=PUBLIC`, runtime readiness
`PASS`, a prediction snapshot no older than 45 seconds, a change event no
older than five minutes, explicit `changedFrom` and `changedAt`, and at least
MEDIUM confidence. WAIT, FAIL, SHADOW, stale, expired, LOW and UNKNOWN states
render no public change. A valid admin session may receive a SHADOW preview
with outcome precision, false-positive rate, independent-change-truth status
and readiness reasons. Predictive Outcome Truth V1 can now make change samples
scoreable only when an independent confident APPROACH runway observed before
the prediction matches `changedFrom` and a later LANDING carries a
provider-reported final runway. Availability of that truth does not graduate
the capability by itself; sample-volume and quality thresholds must still pass.
The aircraft detail continues to use its single page-scoped prediction request.

## Predictive Trajectory Advisory V1

Trajectory Advisory exposes the predictive engine's destination-relative
trajectory state through the same aircraft prediction request. Public output is
fail-closed: it requires `TRAJECTORY=PUBLIC`, runtime readiness `PASS`, a
prediction no older than 45 seconds, a non-`UNKNOWN` state, and MEDIUM/HIGH
confidence. LOW-confidence `POSSIBLE_DEVIATION` candidates remain admin-only
diagnostics.

Prospective capture writes the explicit `trajectoryState` into bounded
`evidenceJson` only when trajectory state or confidence changes. Runtime
readiness can therefore distinguish stateful trajectory observations and count
candidate deviations without a schema migration or high-frequency write lane.
Predictive Outcome Truth V1 can validate those candidates from later,
independently persisted Flight Intelligence outcomes; readiness still requires
the configured sample-volume and precision thresholds before it can PASS.

## Predictive Outcome Truth V1

Runtime readiness now has a versioned independent evidence layer,
`predictive-outcome-truth-v1`, separate from
`predictive-readiness-v1` thresholds. It reads only bounded persisted
`FlightEvent` data and never reads `FlightPosition`, mutates historical
events, or adds a prediction write lane.

RUNWAY_CHANGE is scoreable only when a confident independent `APPROACH`
event within two hours before the prediction establishes the same previous
runway captured by the prediction, and a subsequent `LANDING` within six
hours carries a provider-reported final runway. A correct sample predicted the
observed new runway; a false-positive sample is one where the independent
approach and final runway never changed.

TRAJECTORY candidates (`POSSIBLE_DEVIATION` / `DEVIATING`) are positively
validated only by a later confident `DIVERSION`, `GO_AROUND`, `HOLDING`,
`ORBIT`, or `UNUSUAL_TURN` event in the same lifecycle. Negative truth is
deliberately stricter: it requires a ground-confirmed `LANDING` at the same
prospective destination. Missing ground confirmation, a different destination,
identity mismatch, low-confidence evidence, or an out-of-window event remains
UNSCORABLE rather than becoming a false negative.

Each outcome event type is queried independently with a 2,500-row bound. If
any outcome query, the landing query, or the predictive-observation query
reaches its cap, the readiness report is incomplete and the affected public
graduation remains fail-closed at `WAIT`. Truth-source availability alone
never promotes a capability; the existing minimum sample and quality
thresholds still decide PASS/WAIT/FAIL.

## Predictive Graduation Calibration V1

The admin-only readiness report now includes
`predictive-graduation-calibration-v1`, a read-only interpretation layer over
the same evidence, readiness evaluation and threshold version used by the
public graduation gate. It does not recompute predictions, change thresholds,
alter the configured/effective policy, or promote a capability.

Each capability is classified as `READY`, `COLLECTING`,
`TRUTH_BLOCKED`, `QUALITY_BLOCKED`, `HARD_BLOCKED`, or
`COLLECTION_BLOCKED`. The report exposes exact remaining count deficits
(observations, scoreable observations, independent truth flights or validated
candidates), required truth/instrumentation availability, and quality margins
against the active minimum/maximum thresholds. A positive quality margin means
headroom; a negative margin means the metric currently misses its target.

Quality metrics remain preview-only while readiness is still WAIT on evidence
volume or truth. `manualReviewEligible=true` is emitted only when the bounded
collection is complete and the existing readiness decision is PASS. This is a
human/configuration review signal only; PUBLIC exposure still requires an
explicit capability policy change and the runtime readiness gate continues to
fail closed.

## Predictive Operations Center V1

The radar Operations Center adds a bounded predictive outlook for aircraft
already selected by its one-hour NOW timeline and live highlights. The browser
sends at most six ICAO identifiers to
`GET /api/operations/predictive?hexes=` while the panel is open. The server
reads the existing RAM prediction state and evaluates one shared readiness
report for the whole request.

Anonymous responses contain only ETA/runway/runway-change/trajectory advisories that survive the same
PUBLIC + PASS + freshness gates used on aircraft detail. A valid admin session
may additionally receive SHADOW previews plus ETA/RUNWAY/RUNWAY_CHANGE/TRAJECTORY readiness decisions.
The client refreshes the bounded snapshot every 30 seconds and expires rendered
values at the 45-second freshness boundary. Predictive data is not added to the
main radar SSE, and no persistence, migration, model, or new stream is added.

## APIs

| Method and route | Purpose | Production status |
| --- | --- | --- |
| `GET /api/aircraft?coverage=local\|extended` | Current safe snapshot; default is local for backward compatibility. | Production core. |
| `GET /api/aircraft/:hex?coverage=local\|extended` | Safe durable metadata, recent flights, and 7d/30d history summary; selected live enrichment follows the requested coverage view. | Production when PostgreSQL is configured. |
| `GET /api/aircraft/:hex/photo` | Optional Planespotters photo metadata; returns disabled/empty safely. | Optional, disabled by default. |
| `GET /api/stream?coverage=local\|extended[&v=2]` | Coalesced Server-Sent Events; V1 named `snapshot` events remain the default, while explicit `v=2` sends one full public snapshot followed by sequence-aware `delta` events for changed/removed aircraft. Each client receives a selected coverage view from one shared state service. | Production core; not WebSocket. |
| `GET /api/ogn/state` | Current bounded OGN/FLARM snapshot; disabled mode returns an empty snapshot and does not start a provider. | Optional; disabled by default. |
| `GET /api/ogn/stream` | Independent coalesced OGN/FLARM `snapshot` events with heartbeat and bounded backpressure. | Optional; not WebSocket and never part of `/api/stream`. |
| `GET /api/history/:hex` | PostgreSQL latest history or bounded RAM trail fallback. | Production/degraded gracefully without DB. |
| `GET /api/history/flights` | Bounded flight list by local range, search, or exact hex. | Production with PostgreSQL. |
| `GET /api/history/flights/:id` | One flight instance and capped sampled positions. | Production with PostgreSQL. |
| `GET /api/time-machine/range` | Actual min/max persisted `FlightPosition` timestamps. | Production with PostgreSQL; bounded read. |
| `GET /api/time-machine/window?from=&to=` | Maximum five-minute all-aircraft observations plus persistent event markers. | Production with PostgreSQL; 40,000 positions/500 aircraft/200 events per response. |
| `GET /api/map-context/at?at=` | Small temporal manifest for historical map context. | Production; fail-soft per layer. |
| `GET /api/map-context/range` | Bounded traffic and context archive availability ranges. | Production; cheap archive diagnostics. |
| `GET /api/map-context/radar?at=` | Historical radar frame metadata resolved at or before the selected instant. | Production when the archive contains a matching frame. |
| `GET /api/map-context/radar/frame/:id` | Archived validated CHMI PNG frame. | Production when the frame is retained. |
| `GET /api/map-context/metar?at=` | Batched normalized historical METAR observations. | Production when archived observations exist. |
| `GET /api/map-context/wind?at=&level=` | Historical ICON-EU snapshot with model-run and valid-time provenance. | Production when archived snapshots exist. |
| `GET /api/map-context/aup?at=` | Historical planned AUP/UUP revision and validity context. | Production when an as-known revision exists. |
| `GET /api/airports` | PostgreSQL airport catalog or bundled fallback catalog. | Production with import/fallback. |
| `GET /api/airports/:icao` | Canonical airport detail plus locally persisted runways, communication frequencies, and associated navaids. | Production after `airports:sync`; empty infrastructure is a valid response. |
| `GET /api/airports/:icao/traffic?range=7d\|30d` | Bounded airport traffic summary from persisted Flights captured by this receiver, including route, aircraft, callsign, and recent-traffic rankings. The response marks itself incomplete when a safe query cap is exceeded instead of silently presenting partial totals as complete. | Production when PostgreSQL history is configured; default range is 30 days. |
| `GET /api/airports/:icao/movements?period=today\|24h\|7d` | Bounded on-demand movement classifications (approach, likely landing, likely takeoff, departure, overflight) from spatial/time-first sampled `FlightPosition` candidates and runway geometry. Results include evidence, confidence, probable runway only for runway-related classes, runway-relevant/unknown summary counts, and explicit `complete`/`truncated` metadata. | Production when PostgreSQL history is configured; default UI window is 24 hours; all classifications are inferred receiver evidence and overflights never receive a runway. |
| `GET /api/search?q=` | Bounded global live-aircraft and airport search. | Production. |
| `GET /api/weather/airport/:icao` | Canonical-airport AviationWeather.gov METAR/TAF. | Optional external data; on-demand and cached. |
| `GET /api/weather/airport?icao=ICAO1,ICAO2` | Bounded batch canonical-airport METAR/TAF response for route weather. | Optional external data; max 8 ICAO codes. |
| `GET /api/weather/sigmet` | Current validated international and CONUS SIGMET GeoJSON. | Optional external data; fetched only when the map layer is enabled. |
| `GET /api/atc/sectors` | ATC sectors/transmitters plus provenance metadata. | Production with imported data; demo sample only in demo/explicit opt-in. |
| `GET /api/ats/routes` | Published Czech ATS route geometry and provenance used by route intelligence. DCT and unresolved/international continuation remain explicit and are never presented as an ATC clearance. | Production with the validated Czech eAIP route dataset; client loading is fail-soft and retryable after transient failures. |
| `GET /api/airspace/activity` | Planned Czech AUP/UUP allocation context plus separately labeled delayed historical-actual data when available. Planned allocation is never claimed to be confirmed operational activation. | Optional/fail-soft authoritative-source enrichment; browser loading can retry after transient failures. |
| `GET /api/statistics` | Today or bounded 7d/30d aggregate/trend/coverage response. | Production; ranges need daily DB data. |
| `GET /api/statistics/traffic?range=today\|7d\|30d` | Receiver-observed Flight-instance totals and bounded rankings for aircraft types, airlines/operators, routes, origins/destinations, and registration countries. | Production with PostgreSQL history; never reads `FlightPosition`. |
| `GET /api/statistics/coverage-intelligence?range=7d\|30d` | Coverage reliability from daily 10° sector maxima, local-hour Flight-start distribution, and bounded receiver records. P95/P99 are percentiles of daily maxima, not raw position samples. | Production when PostgreSQL receiver aggregates/history are configured; never reads `FlightPosition`. |
| `GET /api/reception-records` | Today, lifetime, and top complete daily maximum-distance records with aircraft, registration, bearing, and timestamp. | Production; historical records require the V1 bearing field, while live memory remains available without PostgreSQL. |
| `GET /api/logbook/summary` | One compact dashboard read for live count, today’s durable NEW/RARE/RETURNING counts, watchlisted live aircraft, interesting aircraft, and reception records. | Production; durable logbook labels require PostgreSQL, live radar remains independent. |
| `GET /api/watchlist` | Server alert rules, cooldown, safe current matches, and persisted last-trigger timestamps. | Production; read-only and `no-store`. |
| `GET /api/watchlist/session` | Safe watchlist admin-session status. | Production; never returns the credential. |
| `GET /api/alerts?filter=all\|watchlist\|emergency\|records` | Safe, bounded alert-event history with explicit event metadata, server-side category filtering, and paginated notification status. | Production; no secrets, provider payloads, or raw delivery errors. |
| `GET /api/recap?range=daily\|weekly` | Receiver daily or seven-day recap from aggregate tables and bounded Flight reads. | Production when PostgreSQL is configured; missing data remains unavailable/null. |
| `POST /api/watchlist` | Validate and atomically create a server alert rule. | Production; authenticated same-origin admin mutation. |
| `PATCH /api/watchlist/:id` | Update or enable/disable one rule. | Production; authenticated same-origin admin mutation. |
| `DELETE /api/watchlist/:id` | Delete one server rule. | Production; authenticated same-origin admin mutation. |
| `GET /api/health` | Sanitized application/database/readsb/ATC/alert health. | Production health contract. |
| `GET /api/admin/predictive/readiness` | Admin-only 30-day bounded Predictive Graduation Readiness report from `PredictiveObservation` plus independent LANDING terminal evidence; never reads `FlightPosition`. | Read-only graduation gate; never auto-promotes a capability to PUBLIC. |
| `GET /api/system/status` | Sanitized bounded system overview for `/system`, including server-known airport/ATC/ATS map-layer counts and source freshness. | Production diagnostics. |
| `GET /api/version` | Safe release/build metadata. | Production release metadata endpoint. |

The server alert engine is evaluated only from the local ADS-B aircraft state. Its bounded cooldown/durable-event state is atomically persisted outside PostgreSQL so a process restart does not reset recent deduplication. The browser-only local watchlist filter on `/` remains separate from server alert rules. Optional enrichment and PostgreSQL failures are represented as empty, stale, unavailable, or degraded feature data rather than taking down the live radar.
# Flight Story V2

Flight detail keeps one bounded playback clock and adds a deterministic summary
plus a narrative timeline. Persisted Flight start/end times are labeled as
observed boundaries; persisted Flight Intelligence events are labeled inferred
with confidence and nearby sampled telemetry. Notable-event badges summarize
GO_AROUND, DIVERSION, HOLDING and related high-attention events without
inventing facts. The map, playback cursor, profile cursor, selected event and
historical Map Context continue to share the same timestamp. Partial data
remains usable and airport route metadata remains context rather than proof of
the flown path.


### Airport Live Board V7 — Arrival Sequence

The V7 airport board also provides a six-aircraft active-arrival sequence. It
reuses the existing aircraft stream and airport 30-second refresh cycle, makes
one bounded predictive batch request, consumes PUBLIC readiness-gated
ETA/runway advisories only, and fails soft to receiver-derived ordering when
predictions are unavailable. Route conflicts are excluded and UNKNOWN routes
need a matching PUBLIC destination. The UI shows ETA uncertainty, median ETA
spacing, predicted-runway stability and observed runway-flow context.


### Airport Live Board V8 — Arrival Flow Intelligence

V8 turns the bounded V7 active-arrival sequence into short-horizon flow
intelligence without adding another data source. It reports PUBLIC ETA demand
inside 5/15/30 minutes, compares equal 0–15 and 15–30 minute windows for flow
trend, detects ETA compression, derives conservative arrival pressure, groups
predicted runway load, and compares the predicted dominant runway with
receiver-observed runway flow when both have enough evidence. Evidence is
labelled PUBLIC_STRONG, PUBLIC_PARTIAL, or RECEIVER_ONLY. The same bounded
sequence also produces an Approach Queue state (EMPTY, LOW_DENSITY, ACTIVE,
BUILDING, COMPRESSED, or HOLDING_PRESENT) without another request, stream or
persistence path.


## Operational Digital Twin V1

The aircraft detail surface includes a bounded 30-minute 4D situation outlook
through `/api/aircraft/:hex/situation`. It combines a route-aware or
kinematic trajectory corridor with waypoint, ATC-sector, planned AUP/UUP,
SIGMET and readiness-gated PUBLIC predictive events. Prediction Timeline V1
renders the same canonical event list chronologically from an observed NOW
anchor, preserving source/reference, provenance and confidence rather than
creating another predictor. Every event retains provenance and confidence. The feature adds no history scan, persistence,
additional SSE stream or periodic browser polling loop. See
[`OPERATIONAL-DIGITAL-TWIN.md`](OPERATIONAL-DIGITAL-TWIN.md).


## Track Fusion Shadow V1

Track Fusion Shadow V1 evaluates a field-level multi-source state estimator
beside the current local/network canonical merge. It scores position, altitude,
groundspeed, track and vertical rate independently using source class,
freshness, protocol provenance and available ADS-B integrity evidence.

The shadow records LOCAL↔NETWORK position residuals, source-transition
accept/reject decisions, bounded six-second dead-reckoning gap fills, per-field
source selections and divergence from today's canonical position. It is visible
through admin-only `/system` diagnostics and
`GET /api/admin/track-fusion/:hex`.

V1 deliberately does not change public radar state, SSE, trails, alerts,
Navigation Integrity, predictive inputs, receiver statistics or PostgreSQL
history. Fused/estimated state is never local receiver evidence. See
[`TRACK-FUSION-SHADOW.md`](TRACK-FUSION-SHADOW.md).


## Track Fusion Readiness / Graduation V1

Track Fusion Shadow now collects bounded 24-hour process-local readiness
evidence in five-minute buckets and produces a versioned PASS / WAIT / FAIL
decision. Admin readiness is available on `/system` and through
`GET /api/admin/track-fusion/readiness`.

The first fail-closed consumer is Operational Digital Twin. Fused input is
disabled by default and requires an explicit flag, readiness PASS and a GOOD
observed fused position for the requested aircraft. Canonical radar, SSE and
receiver persistence remain unchanged.


## Track Fusion Outcome Validation V1

Track Fusion now runs a bounded prospective canonical-vs-fused validation lane.
For eligible freshly evaluated tracks it captures both states, projects them to
5/15/30-second horizons, and later scores them against a future fresh LOCAL
receiver position. The result reports FUSED_BETTER / CANONICAL_BETTER / TIE,
mean position and altitude error, handover-specific outcomes and a separate
PASS / WAIT / FAIL net-benefit decision.

The validator is process-local and in-memory only. It performs no history scan,
database write, upstream request, timer or second fusion pass. See
[`TRACK-FUSION-OUTCOME.md`](TRACK-FUSION-OUTCOME.md).

## Operational Digital Twin V2 — Map Corridor Visualization

The radar renders the selected aircraft's existing situation response as a 30-minute future corridor with an uncertainty envelope, +5/+10/+15/+20/+30 minute markers, and situation/weather event markers. Route-aware projection is solid and the kinematic fallback is dashed. V2 reuses the existing 60-second selected-aircraft situation refresh and adds no request, timer, SSE, API or persistence path.

## Operational Digital Twin Outcome Validation V1

Each successful existing situation calculation captures +5/+15/+30 minute targets without another polling path. Pending samples are later scored only against future LOCAL receiver truth already in RAM. The report measures position and altitude error, stated uncertainty-envelope coverage, error/uncertainty ratio, expired truth, and slices by horizon, corridor mode and input state source. Evidence is process-local, bounded to 24 hours and starts at WAIT; PASS/FAIL is evaluated only after at least two hours and sufficient truth samples.

## Operational Digital Twin Wind-adjusted Timing Shadow V1

Digital Twin now computes an additive shadow timing over the exact same canonical corridor geometry. It derives only a diagnostic still-air proxy from observed groundspeed and the current ICON-EU along-track wind, then re-times the same future distances using the existing wind samples. The result exposes +5/+15/+30 minute checkpoints and waypoint timing deltas. Canonical corridor, events and ETA remain unchanged.

## Operational Digital Twin Event Outcome Validation V2

Predicted waypoint, ATC sector-entry, SIGMET-intersection, arrival-ETA and runway-expectation events are now prospectively compared with future LOCAL receiver truth and independent Flight Intelligence LANDING events. The report measures precision, timing error, missing truth and lead-time slices without claiming recall. The lane is process-local, bounded, and adds no polling, persistence or second Digital Twin calculation.

## Navigation Integrity Corridor V1

The Operational Digital Twin intersects its existing sampled 30-minute corridor with the already-computed process-local Navigation Integrity active anomaly regions. A match requires both grid-cell and altitude-band compatibility; the result preserves severity, confidence, affected-aircraft counts, LOCAL/NETWORK evidence, baseline maturity and audit categories. Zero intersections are not an all-clear, and the feature never claims GNSS jamming, spoofing, or an aircraft navigation fault. No new HTTP request, timer, detector pass, database access or persistence path is added.

## Wind Timing Graduation V1

Event Outcome V2 now compares canonical and wind-adjusted timing for the same waypoint against one identical LOCAL truth observation. The process-local graduation gate is fail-closed: it requires sufficient span, paired sample volume, meaningful wind adjustments and truth coverage; PASS additionally requires at least 5% MAE improvement and a 55% shadow win rate. PASS only marks the model eligible for manual graduation — canonical timing remains active and there is no automatic promotion.

### Explainable Prediction V1

Aircraft predictive advisory cards expose a `Why?` disclosure for ETA, runway, runway-change and trajectory outputs. Evidence comes from the same canonical prediction evaluation and is passed only through the existing readiness-gated advisory builders. A capability-specific whitelist limits public evidence to product-safe inputs such as remaining distance, effective speed, phase, recent runway usage, surface wind, candidate margin and trajectory geometry. No second prediction request or parallel model is introduced.
