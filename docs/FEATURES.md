# Features and routes

Status describes the current code path, not a transient runtime count or
whether an operator has configured an optional provider.

## Pages

| Route | Purpose | Production status |
| --- | --- | --- |
| `/` | Live MapLibre radar, aircraft list/filtering, selected aircraft detail, zoom-aware aircraft labels, live trail, route/airport/ATC overlays, optional receiver range rings and aircraft color modes, keyboard shortcuts, SSE connection state, compact ADS-B logbook summary, opt-in SIGMET, Czech ATS route-intelligence, and planned AUP/UUP airspace context. Optional LOCAL/EXTENDED coverage switch combines local readsb with RAM-only ADSB.lol network observations. Optional separate OGN/FLARM layer, list, and detail panel use a dedicated RAM-only SSE flow. | Production core; readsb or demo provider. OGN, weather, ATS route intelligence, and airspace-activity overlays are independent/fail-soft. |
| `/aircraft/:hex` | Flight-card detail with callsign/registration/type/operator header, live movement and provenance, route/flight-plan context, first/last-seen timeline, bounded 30-minute altitude chart from the latest FlightPosition history, full-trail action, durable aircraft metadata, recent flight instances, 7/30-day summary, lifetime Flight-instance statistics, NEW/RARE/RETURNING logbook status, optional photo, and compact destination-first/origin weather. | Production; PostgreSQL required for durable detail, weather/photo optional. |
| `/flights/:id` | Standalone captured-flight detail with aircraft and airport links, clearly labeled observed sampled path versus airport route context, bounded playback, and altitude/speed/vertical-rate profiles synchronized to the playback timeline. | Production with PostgreSQL history. |
| `/airports/:icao` | Airport Intelligence detail with catalog metadata, source runway geometry, decoded/raw METAR and TAF, wind-favored runway calculations, live nearby ADS-B traffic, bounded inferred movement intelligence, observed movement evidence, associated navaids, nearby airports, and 7/30-day receiver traffic summary. | Production; movement results are inferred from local sampled history and are not authoritative ATC data. |
| `/history` | Bounded flight-instance search/list, sampled position detail, playback map. | Production; PostgreSQL feature, no live-polling dependency. |
| `/statistics` | Today/7-day/30-day receiver aggregate, current-versus-previous period comparison, trends, coverage visualization, reception records, bounded CSV export, receiver-observed traffic intelligence, and 7/30-day coverage reliability/receiver analytics. | Production core; traffic and range analytics use bounded PostgreSQL reads, while current receiver counters remain RAM-backed. |
| `/watchlist` | Server alert-rule editor with 10/25/50/100 km distance presets, current matching state, enable/disable controls, and the last persisted trigger time for each rule. | Production; shared `/var/lib/airradar/alerts.json` rules plus bounded `/var/lib/airradar/alert-engine-state.json` dedup/trigger state. Read-only state is public and mutations require the server-side admin session. |
| `/alerts` | Bounded history of watchlist appearance/radius transitions, individual 7500/7600/7700 emergency transitions, new-aircraft/reception-record events, and notification outcomes, with server-side event filtering before pagination. | Production; safe append-only `/var/lib/airradar/alert-events.jsonl` ledger, notifier payloads excluded. |
| `/recap/daily` | Daily receiver recap with Prague-local boundaries and partial-day labeling. | Production when PostgreSQL history/aggregates are available. |
| `/recap/weekly` | Seven-day receiver recap with bounded comparison to the preceding seven days. | Production when PostgreSQL history/aggregates are available. |
| `/fleet` | Concrete aircraft from ICAO watchlist rules, live/offline state, recent observed-flight counts, routes/airports, and lazy photos. | Production; non-identity watchlist rules are omitted, PostgreSQL history is optional. |
| `/system` | Sanitized runtime, receiver, persistence, statistics, ATC, weather, OGN, alerts, and airport status. | Production read-only diagnostics. |

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
| `GET /api/airports` | PostgreSQL airport catalog or bundled fallback catalog. | Production with import/fallback. |
| `GET /api/airports/:icao` | Canonical airport detail plus locally persisted runways, communication frequencies, and associated navaids. | Production after `airports:sync`; empty infrastructure is a valid response. |
| `GET /api/airports/:icao/traffic?range=7d\|30d` | Bounded airport traffic summary from persisted Flights captured by this receiver, including route, aircraft, callsign, and recent-traffic rankings. The response marks itself incomplete when a safe query cap is exceeded instead of silently presenting partial totals as complete. | Production when PostgreSQL history is configured; default range is 30 days. |
| `GET /api/airports/:icao/movements?period=today\|24h\|7d` | Bounded on-demand movement classifications (approach, likely landing, likely takeoff, departure, overflight) from sampled `FlightPosition` trajectories and runway geometry. Results include evidence, confidence, probable runway where unambiguous, and explicit `complete`/`truncated` metadata. | Production when PostgreSQL history is configured; default UI window is 24 hours; all classifications are inferred receiver evidence. |
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
