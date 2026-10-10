# SondeHub V3 – server-side MQTT batch extension

SondeHub publishes WSS MQTT endpoint URLs via
`https://api.v2.sondehub.org/sondes/websocket`, and recommends MQTT topic
`batch` over repeated polling of the public REST API. The signed URL is used
server-side only and never exposed to clients.

Enable `SONDEHUB_ENABLED=true` and `SONDEHUB_MQTT_ENABLED=true`. Both are
disabled by default. On the first map-layer request, AirRadar lazily creates
one process-local MQTT 3.1.1 client with the required `mqtt` WebSocket
subprotocol. Only validated AWS IoT signed WSS URLs are accepted. Each
connection uses a unique client ID. The bounded consumer subscribes to the
preferred `batch` telemetry feed.

Incoming messages are size-validated (up to 1 MiB), decoded incrementally,
normalized by the existing SondeHub validator, and restricted to a 450 km
radius around the configured receiver. The process holds no more than 300
active observations (15-minute freshness), with no database, ADS-B, OGN,
alerts, or SSE traffic changes. The socket disconnects after five minutes
without map-layer clients and retries no more often than every 90 seconds.
Only the public AirRadar `/api/sondes` endpoint is refreshed by the active
frontend every 20 seconds; the upstream `/sondes` REST snapshot continues
to use a separate 20-minute cache.

The MQTT connection is a best-effort enhancement. If upstream WSS, signed
URL, or stream data fails, the existing on-demand SondeHub REST snapshot and
selected-serial prediction remain available. MQTT position freshness must
not be confused with an aircraft state or actual balloon landing. Landing
coordinates remain labeled as SondeHub/Tawhiri model predictions.

Attribution and licensing: SondeHub contributors, CC BY-SA 2.0.
https://sondehub.org/ ; https://creativecommons.org/licenses/by-sa/2.0/.
Ensure sharing obligations are satisfied when redistributing derived data.

Unit tests: `npx vitest run tests/sondehub-mqtt.test.ts`.
