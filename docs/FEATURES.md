# Features and routes

Status describes the current code path, not a transient runtime count or
whether an operator has configured an optional provider.

## Pages

| Route | Purpose | Production status |
| --- | --- | --- |
| `/` | Live MapLibre radar, aircraft list/filtering, selected aircraft detail, live trail, route/airport/ATC overlays, SSE connection state. | Production core; readsb or demo provider. |
| `/aircraft/:hex` | Durable aircraft metadata, recent flight instances, bounded history summary, and optional photo. | Production; PostgreSQL required for durable detail, photo optional. |
| `/airports/:icao` | Airport detail, MapLibre location map, catalog metadata, on-demand weather, and 7/30-day observed receiver traffic summary. | Production; traffic uses persisted Flight instances, catalog fallback works, weather optional. |
| `/history` | Bounded flight-instance search/list, sampled position detail, playback map. | Production; PostgreSQL feature, no live-polling dependency. |
| `/statistics` | Today/7-day/30-day receiver aggregate, trends, and coverage visualization. | Production; today is RAM-backed, ranges use daily PostgreSQL aggregates. |
| `/watchlist` | Server alert-rule editor and current matching state. | Production; shared `data/alerts.json`, no auth/user accounts. |
| `/system` | Sanitized runtime, receiver, persistence, statistics, ATC, weather, alerts, and airport status. | Production read-only diagnostics. |

## APIs

| Method and route | Purpose | Production status |
| --- | --- | --- |
| `GET /api/aircraft` | Current safe snapshot. | Production core. |
| `GET /api/aircraft/:hex` | Safe durable metadata, recent flights, and 7d/30d history summary. | Production when PostgreSQL is configured. |
| `GET /api/aircraft/:hex/photo` | Optional Planespotters photo metadata; returns disabled/empty safely. | Optional, disabled by default. |
| `GET /api/stream` | Coalesced `snapshot` events over Server-Sent Events. | Production core; not WebSocket. |
| `GET /api/history/:hex` | PostgreSQL latest history or bounded RAM trail fallback. | Production/degraded gracefully without DB. |
| `GET /api/history/flights` | Bounded flight list by local range, search, or exact hex. | Production with PostgreSQL. |
| `GET /api/history/flights/:id` | One flight instance and capped sampled positions. | Production with PostgreSQL. |
| `GET /api/airports` | PostgreSQL airport catalog or bundled fallback catalog. | Production with import/fallback. |
| `GET /api/airports/:icao/traffic?range=7d\|30d` | Bounded airport traffic summary from persisted Flights captured by this receiver, including route, aircraft, callsign, and recent-traffic rankings. | Production when PostgreSQL history is configured; default range is 30 days. |
| `GET /api/search?q=` | Bounded global live-aircraft and airport search. | Production. |
| `GET /api/weather/airport/:icao` | Canonical-airport AviationWeather.gov METAR/TAF. | Optional external data; on-demand and cached. |
| `GET /api/atc/sectors` | ATC sectors/transmitters plus provenance metadata. | Production with imported data; demo sample only in demo/explicit opt-in. |
| `GET /api/statistics` | Today or bounded 7d/30d aggregate/trend/coverage response. | Production; ranges need daily DB data. |
| `GET /api/watchlist` | Server alert rules, cooldown, and safe current matches. | Production. |
| `POST /api/watchlist` | Validate and atomically create a server alert rule. | Production. |
| `PATCH /api/watchlist/:id` | Update or enable/disable one rule. | Production. |
| `DELETE /api/watchlist/:id` | Delete one server rule. | Production. |
| `GET /api/health` | Sanitized application/database/readsb/ATC/alert health. | Production health contract. |
| `GET /api/system/status` | Sanitized bounded system overview for `/system`. | Production diagnostics. |
| `GET /api/version` | Safe release/build metadata. | Production release metadata endpoint. |

The browser-only local watchlist filter on `/` is separate from server alert
rules. Optional enrichment and PostgreSQL failures are represented as empty,
stale, unavailable, or degraded feature data rather than taking down the
live radar.
