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
| ACARS/VDL2 Communications (RXW Hub) | optional | aircraft / communications | Pre-registry | `/aircraft/:hex` | `/api/aircraft/:hex/communications` | Optional RXW Hub ACARS/VDL2 metadata and structured airport-pair route hints, backed by bounded in-memory caches. H1/FPN live decoding and radar overlays are retired; legacy archive rows remain readable. Disabled by default and subject to provider authorization. |
| Aircraft & Flight Detail | production | history | Pre-registry | `/aircraft/:hex` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/photo`<br>`/api/history/:hex` | Retained live aircraft detail, altitude/time-series observations, telemetry and receiver context without public historical-flight listing or Flight Story routes. |
| Airport Intelligence | production | airports | Pre-registry | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao` | Published airport catalog, runways, navaids, nearby airports and current METAR/TAF; rejected arrival/departure live board and traffic analytics endpoints are no longer public. |
| ATC & ATS Intelligence | production | atc | Pre-registry | `/navigation` | `/api/atc/sectors`<br>`/api/ats/routes`<br>`/api/navigation/data` | Published ATC map geometry and retained ATS route/navaid references; standalone traffic, sector-transition, prediction-validation and AUP/UUP endpoints are removed. |
| FlightAware Usage Administration | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrative usage diagnostics for the optional FlightAware integration. |
| Live Radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/search`<br>`/api/stream` | Local and extended live ADS-B radar, search, aircraft snapshots, live SSE transport and selected-aircraft map/route context without predictive dashboards. |
| Map Context & Weather | production | weather | Pre-registry | `/weather` | `/api/map-context/at`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Current radar imagery, METAR/TAF and SIGMET, observed aircraft weather and navigation safety overlays. |
| Mobile / PWA mode | production | platform | Pre-registry | `/`<br>`/airports/:icao` | `/api/push/vapid-public-key`<br>`/api/push/subscribe` | Installable mobile PWA with offline last-state caching and an optional Web Push subscription transport. Retired rule-based alerts no longer produce notifications. |
| Navigation Integrity | production | navigation / safety / intelligence | Pre-registry | `/navigation-integrity` | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Conservative ADS-B navigation-integrity observations, bounded regional anomaly candidates, APIs, diagnostics and radar overlay. |
| Notification Delivery (L11/L12) | internal | alerts | Pre-registry | — | `/api/watchlist/session`<br>`/api/admin/alerts/delivery-health` | Web Push subscriptions and VAPID endpoint, durable Pushover delivery worker and admin delivery-health diagnostics. Legacy AlertEngine rules, watchlists, fleets, and Notification Center are retired. Existing queued/historical delivery records remain; transports do not themselves generate new alerts. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Privacy-aware optional OGN/FLARM state and independent SSE stream. |
| Receiver Coverage | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Receiver coverage analysis and dedicated coverage detail. |
| Statistics & Recaps | production | analytics | Pre-registry | — | `/api/logbook/summary`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic` | Receiver live/aggregate statistics, coverage, traffic and compatible reception/logbook summaries; historical heatmap and traffic-profile APIs are retired. |
| System Observability | production | operations | Pre-registry | `/system` | `/api/admin/altitude/:hex`<br>`/api/health`<br>`/api/system/runtime-history`<br>`/api/system/runtime-performance`<br>`/api/system/integrations`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version` | Sanitized health, runtime history, provider status, build identity, ADS-B continuity diagnostics, and receiver mass-drop guard state. |
<!-- feature-registry:end -->

## Supported page routes

| Route | Scope |
| --- | --- |
| `/` | Live local/extended ADS-B radar, map, source state and aircraft selection |
| `/aircraft/:hex` | Aircraft identity, current telemetry and retained history |
| `/airports` | Airport catalog and search |
| `/airports/:icao` | Airport detail, geometry, nearby traffic and METAR/TAF |
| `/navigation` | Navigation, ATC map geometry and ATS reference data |
| `/navigation-integrity` | Integrity observations and diagnostics |
| `/receiver/coverage` | Receiver coverage explorer |
| `/system` | Runtime, source, receiver and integration diagnostics |
| `/weather` | Weather layers, airport products and observed aircraft weather |

The JSON feature registry above is the machine-validated source of truth for API routes; do not restore endpoints solely because they appear in older changelogs.

## Retired features

Legacy AlertEngine, its Watchlist/Fleet/Geofence rule APIs, notification-center UI, predictive intelligence, Flight Intelligence, standalone Route Corridor Intelligence, Trajectory Conformance, Digital Twin, historical recap pages and standalone ATC/airport intelligence dashboards have been removed from this branch.

**L11/L12 retention:** Web Push VAPID/subscription routes, Pushover durable delivery worker, delivery health diagnostics, and the existing delivery database tables remain. The `/api/watchlist/session` compatibility endpoint currently authenticates protected system and delivery diagnostics. No rules are evaluated by live ingest and transports alone do not originate new alerts. Historical records are preserved; this reduction does not apply destructive database migrations.

## Constraints

- Keep historical aircraft and reception data and selected receiver statistics API consumers.
- Keep navigation-integrity observations, ATC geometry needed on the map, ATS references, and selected weather products.
- New code must not reintroduce rule evaluation, prediction work or synchronous third-party requests in the ADS-B polling hot path.
- This documentation describes the draft PR; it does not imply a production deployment.
