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
| Aircraft & Flight Detail | production | history | Pre-registry | `/aircraft/:hex`<br>`/flights/:id`<br>`/history`<br>`/flights` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/prediction`<br>`/api/aircraft/:hex/photo`<br>`/api/aircraft/:hex/route-weather`<br>`/api/history/:hex`<br>`/api/history/flights`<br>`/api/history/flights/:id` | Aircraft identity, context, photos, route weather, captured flights and sampled history. |
| Airport Intelligence | production | airports | Pre-registry | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao`<br>`/api/airports/:icao/movements`<br>`/api/airports/:icao/operations`<br>`/api/airports/:icao/traffic` | Airport catalog, runway context, observed traffic, and inferred Airport Operations intelligence. |
| ATC & ATS Intelligence | production | atc | Pre-registry | — | `/api/airspace/activity`<br>`/api/atc/sectors`<br>`/api/atc/sectors/:id/history`<br>`/api/atc/sectors/:id/traffic`<br>`/api/atc/sectors/history`<br>`/api/atc/sectors/traffic`<br>`/api/atc/sectors/transitions`<br>`/api/atc/validation`<br>`/api/ats/routes`<br>`/api/procedures` | ATC sectors, transitions, validation, ATS routes, procedures and planned airspace activity. |
| Flight Intelligence | production | intelligence | Pre-registry | `/intelligence` | `/api/intelligence/events`<br>`/api/intelligence/stream` | Lifecycle and transition intelligence event timeline and streaming. |
| FlightAware Usage Administration | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrative usage diagnostics for the optional FlightAware integration. |
| Live Radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/search`<br>`/api/stream` | Local and extended live ADS-B radar, search, aircraft snapshots and SSE streaming. |
| Map Context & Weather | production | weather | Pre-registry | — | `/api/map-context/at`<br>`/api/map-context/aup`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/map-context/wind`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/wind`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Current and historical radar, METAR, wind, SIGMET, AUP/UUP map context and aircraft-observed weather. |
| Navigation Integrity | production | navigation / safety / intelligence | Pre-registry | — | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Conservative ADS-B navigation-integrity observations, bounded regional anomaly candidates, APIs, diagnostics and radar overlay. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Privacy-aware optional OGN/FLARM state and independent SSE stream. |
| Receiver Coverage | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Receiver coverage analysis and dedicated coverage detail. |
| Statistics & Recaps | production | analytics | Pre-registry | `/statistics`<br>`/recap/daily`<br>`/recap/weekly` | `/api/logbook/summary`<br>`/api/recap`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic` | Receiver statistics, traffic intelligence, reception records and daily/weekly recaps. |
| System Observability | production | operations | Pre-registry | `/system` | `/api/health`<br>`/api/system/runtime-history`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version`<br>`/api/admin/altitude/:hex` | Sanitized health, runtime history, provider status and build identity. |
| Time Machine | production | history | Pre-registry | `/time-machine` | `/api/time-machine/range`<br>`/api/time-machine/window` | Bounded historical all-aircraft playback and historical context windows. |
| Watchlist, Alerts & Fleet | production | alerts | Pre-registry | `/watchlist`<br>`/alerts`<br>`/fleet`<br>`/admin/alerts` | `/api/alerts`<br>`/api/watchlist`<br>`/api/watchlist/:id`<br>`/api/watchlist/session`<br>`/api/admin/alerts/delivery`<br>`/api/admin/alerts/fleets`<br>`/api/admin/alerts/fleets/:id`<br>`/api/admin/alerts/fleets/:id/matchers`<br>`/api/admin/alerts/fleets/:id/matchers/:matcherId`<br>`/api/admin/alerts/geofences`<br>`/api/admin/alerts/geofences/:id`<br>`/api/admin/alerts/history`<br>`/api/admin/alerts/rules`<br>`/api/admin/alerts/rules/:id` | Server watchlists, alert history, rule mutations and fleet views. |
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
| `/airports/:icao` | Airport Intelligence V3 operations board with one shared 24h operations/weather controller, receiver-inferred activity, unified movement timeline linked to Flight Story, receiver-vs-wind runway intelligence, plus catalog metadata, runway geometry, METAR/TAF, live nearby ADS-B traffic, navaids, nearby airports and 7/30-day receiver traffic summary. | Production; movement/runway results are bounded inferences from local sampled history and are not authoritative ATC data. |
| `/history` | Bounded flight-instance search/list, sampled position detail, playback map. | Production; PostgreSQL feature, no live-polling dependency. |
| `/time-machine` | Bounded all-aircraft historical radar playback with UTC selection, timeline, event markers, aircraft selection, selected trail, and optional historical radar/METAR/wind/AUP-UUP context. | Production with PostgreSQL `FlightPosition` history; context availability follows bounded archive activation and retention. |
| `/statistics` | Today/7-day/30-day receiver aggregate, current-versus-previous period comparison, trends, coverage visualization, reception records, bounded CSV export, receiver-observed traffic intelligence, and 7/30-day coverage reliability/receiver analytics. | Production core; traffic and range analytics use bounded PostgreSQL reads, while current receiver counters remain RAM-backed. |
| `/watchlist` | Server alert-rule editor with 10/25/50/100 km distance presets, current matching state, enable/disable controls, and the last persisted trigger time for each rule. | Production; shared `/var/lib/airradar/alerts.json` rules plus bounded `/var/lib/airradar/alert-engine-state.json` dedup/trigger state. Read-only state is public and mutations require the server-side admin session. |
| `/alerts` | Bounded history of watchlist appearance/radius transitions, individual 7500/7600/7700 emergency transitions, new-aircraft/reception-record events, and notification outcomes, with server-side event filtering before pagination. | Production; safe append-only `/var/lib/airradar/alert-events.jsonl` ledger, notifier payloads excluded. |
| `/recap/daily` | Daily receiver recap with Prague-local boundaries and partial-day labeling. | Production when PostgreSQL history/aggregates are available. |
| `/recap/weekly` | Seven-day receiver recap with bounded comparison to the preceding seven days. | Production when PostgreSQL history/aggregates are available. |
| `/fleet` | Concrete aircraft from ICAO watchlist rules, live/offline state, recent observed-flight counts, routes/airports, and lazy photos. | Production; non-identity watchlist rules are omitted, PostgreSQL history is optional. |
| `/system` | Sanitized runtime, receiver, persistence, statistics, ATC, weather, OGN, alerts, and airport status. Lazy weather/radar/wind/ADSBDB providers expose `ON DEMAND`/`LOADING` cold-start states and bounded safe reasons for degraded/offline states. | Production read-only diagnostics; it never triggers optional upstream requests. |

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
