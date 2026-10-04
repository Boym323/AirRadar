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
| Aircraft & Flight Detail | production | history | Pre-registry | `/aircraft/:hex`<br>`/flights/:id`<br>`/history`<br>`/flights` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/prediction`<br>`/api/aircraft/:hex/photo`<br>`/api/aircraft/:hex/route-weather`<br>`/api/history/:hex`<br>`/api/history/flights`<br>`/api/history/flights/:id` | Aircraft identity, context, photos, route weather, captured flights, sampled history, and readiness-gated predictive ETA, runway, runway-change, and trajectory advisories. |
| Airport Intelligence | production | airports | Pre-registry | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao`<br>`/api/airports/:icao/movements`<br>`/api/airports/:icao/operations`<br>`/api/airports/:icao/traffic` | Airport catalog, runway context, observed traffic, inferred Airport Operations intelligence, and a shared-stream Airport Live Board with correlated journeys, flow pulse, short-term flow pressure, runway consistency, bounded operational exceptions, and LANDED completion. |
| ATC & ATS Intelligence | production | atc | Pre-registry | — | `/api/airspace/activity`<br>`/api/atc/sectors`<br>`/api/atc/sectors/:id/history`<br>`/api/atc/sectors/:id/traffic`<br>`/api/atc/sectors/history`<br>`/api/atc/sectors/traffic`<br>`/api/atc/sectors/transitions`<br>`/api/atc/validation`<br>`/api/ats/routes`<br>`/api/procedures` | ATC sectors, transitions, validation, ATS routes, procedures and planned airspace activity. |
| Flight Intelligence | production | intelligence | Pre-registry | `/intelligence` | `/api/intelligence/events`<br>`/api/intelligence/stream` | Lifecycle and transition intelligence event timeline and streaming. |
| FlightAware Usage Administration | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrative usage diagnostics for the optional FlightAware integration. |
| Live Radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/operations/predictive`<br>`/api/search`<br>`/api/stream` | Local and extended live ADS-B radar, search, aircraft snapshots, SSE streaming, and a bounded readiness-gated Predictive Operations Center for ETA, runway, runway changes, and trajectory state. |
| Map Context & Weather | production | weather | Pre-registry | — | `/api/map-context/at`<br>`/api/map-context/aup`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/map-context/wind`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/pirep`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/wind`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Current and historical radar, METAR, wind, SIGMET, AUP/UUP map context, aircraft-observed weather, and bounded PIREP/AIREP enrichment. |
| Navigation Integrity | production | navigation / safety / intelligence | Pre-registry | — | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Conservative ADS-B navigation-integrity observations, bounded regional anomaly candidates, APIs, diagnostics and radar overlay. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Privacy-aware optional OGN/FLARM state and independent SSE stream. |
| Receiver Coverage | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Receiver coverage analysis and dedicated coverage detail. |
| Statistics & Recaps | production | analytics | Pre-registry | `/statistics`<br>`/recap/daily`<br>`/recap/weekly` | `/api/logbook/summary`<br>`/api/recap`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic` | Receiver statistics, traffic intelligence, reception records and daily/weekly recaps. |
| System Observability | production | operations | Pre-registry | `/system` | `/api/admin/altitude/:hex`<br>`/api/admin/predictive/readiness`<br>`/api/health`<br>`/api/system/runtime-history`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version` | Sanitized health, runtime history, provider status, build identity, bounded predictive readiness, independent outcome truth, and admin-only graduation calibration. |
| Time Machine | production | history | Pre-registry | `/time-machine` | `/api/time-machine/range`<br>`/api/time-machine/window` | Bounded historical all-aircraft playback and historical context windows. |
| Watchlist, Alerts & Fleet | production | alerts | Pre-registry | `/watchlist`<br>`/alerts`<br>`/fleet`<br>`/admin/alerts` | `/api/alerts`<br>`/api/watchlist`<br>`/api/watchlist/:id`<br>`/api/watchlist/activity`<br>`/api/watchlist/session`<br>`/api/admin/alerts/delivery`<br>`/api/admin/alerts/fleets`<br>`/api/admin/alerts/fleets/:id`<br>`/api/admin/alerts/fleets/:id/matchers`<br>`/api/admin/alerts/fleets/:id/matchers/:matcherId`<br>`/api/admin/alerts/geofences`<br>`/api/admin/alerts/geofences/:id`<br>`/api/admin/alerts/history`<br>`/api/admin/alerts/rules`<br>`/api/admin/alerts/rules/:id` | Server watchlists, integrated rule-scoped activity, alert history, rule mutations and fleet views. |
<!-- feature-registry:end -->
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
| `/aircraft/:hex` | Flight-card detail with callsign/registration/type/operator header, live movement and provenance, route/flight-plan context, first/last-seen timeline, bounded 30-minute altitude chart from the latest FlightPosition history, full-trail action, durable aircraft metadata, recent flight instances, 7/30-day summary, lifetime Flight-instance statistics, NEW/RARE/RETURNING logbook status, optional photo, and compact destination-first/origin weather. | Production; PostgreSQL required for durable detail, weather/photo optional. |
| `/flights/:id` | Flight Story V2 with an observed-flight summary, clearly labeled airport context, notable-event badges, a narrative first-seen → inferred-event → last-seen timeline, bounded playback, and altitude/speed/vertical-rate profiles synchronized to one playback clock. | Production with PostgreSQL history. |
| `/airports/:icao` | Airport Live Board V2 on the Airport Intelligence V3 foundation: one shared 24h operations/weather controller with 30-second bounded refresh, recent receiver-inferred arrivals/departures, operational events, runway usage + receiver-vs-wind intelligence, compact current weather, unified Flight Story timeline, plus catalog metadata, runway geometry, METAR/TAF, live nearby ADS-B traffic, navaids, nearby airports and 7/30-day receiver traffic summary. | Production; movement/runway results are bounded local-receiver inferences, not airport FIDS or authoritative ATC data. |
| `/history` | Bounded flight-instance search/list, sampled position detail, playback map. | Production; PostgreSQL feature, no live-polling dependency. |
| `/time-machine` | Bounded all-aircraft historical radar playback with UTC selection, timeline, event markers, aircraft selection, selected trail, and optional historical radar/METAR/wind/AUP-UUP context. | Production with PostgreSQL `FlightPosition` history; context availability follows bounded archive activation and retention. |
| `/statistics` | Today/7-day/30-day receiver aggregate, current-versus-previous period comparison, trends, coverage visualization, reception records, bounded CSV export, receiver-observed traffic intelligence, and 7/30-day coverage reliability/receiver analytics. | Production core; traffic and range analytics use bounded PostgreSQL reads, while current receiver counters remain RAM-backed. |
| `/watchlist` | Server alert-rule editor with 10/25/50/100 km distance presets, current matching state, enable/disable controls, and the last persisted trigger time for each rule. | Production; shared `/var/lib/airradar/alerts.json` rules plus bounded `/var/lib/airradar/alert-engine-state.json` dedup/trigger state. Read-only state is public and mutations require the server-side admin session. |
| `/alerts` | Bounded history of watchlist appearance/radius transitions, individual 7500/7600/7700 emergency transitions, new-aircraft/reception-record events, and notification outcomes, with server-side event filtering before pagination. | Production; safe append-only `/var/lib/airradar/alert-events.jsonl` ledger, notifier payloads excluded. |
| `/recap/daily` | Daily receiver recap with Prague-local boundaries and partial-day labeling. | Production when PostgreSQL history/aggregates are available. |
| `/recap/weekly` | Seven-day receiver recap with bounded comparison to the preceding seven days. | Production when PostgreSQL history/aggregates are available. |
| `/fleet` | Concrete aircraft from ICAO watchlist rules, live/offline state, recent observed-flight counts, routes/airports, and lazy photos. | Production; non-identity watchlist rules are omitted, PostgreSQL history is optional. |
| `/system` | Sanitized runtime, receiver, persistence, statistics, ATC, weather, OGN, alerts, and airport status. Lazy weather/radar/wind/ADSBDB providers expose `ON DEMAND`/`LOADING` cold-start states and bounded safe reasons for degraded/offline states. | Production read-only diagnostics; it never triggers optional upstream requests. |

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
