# SondeHub V1 – on-demand meteorological sonde overlay

SondeHub radiosonde data is an independent, optional map overlay. Activate explicitly using
\`SONDEHUB_ENABLED=true\` and restart AirRadar. The switch is off by default.

The server calls the published \`GET https://api.v2.sondehub.org/sondes\`
receiver-centered endpoint (\`lat\`, \`lon\`, \`distance=400000\`, \`last=3600\`)
only on the first explicit layer request, then uses process-local shared cache for 20
minutes. Simultaneous calls are coalesced. No background timers, auto-polling,
WebSocket/MQTT connection, additional SSE or database changes are introduced.

SondeHub explicitly advises against repeatedly polling the REST API. V1 is a
**time-stamped snapshot**, not real-time sonde tracking. Future true live updates
should use the documented SondeHub MQTT-over-WebSocket feed, not a short REST timer.

Data is size bounded to 1 MiB, observation results capped to 300 sondes, and the
endpoint restricts center coordinates to the configured receiver (never arbitrary
public client coordinates). Bad position, timestamp and altitude values are dropped.
Upstream failure returns an unavailable state, or last-good stale state for at most
60 minutes; radar traffic and flight history remain fully independent.

The frontend renders distinct radiosonde markers and an accessible detail popup
with serial, observed altitude, ascent/descent rate and observation time. There is
no inferred or fabricated landing prediction in V1. Any future landing prediction
requires documented SondeHub prediction data and explicit confidence/provenance.

Attribution: **SondeHub contributors – Creative Commons BY-SA 2.0**,
https://sondehub.org/ and https://creativecommons.org/licenses/by-sa/2.0/.
Check applicable share-alike and redistribution requirements before publishing
or exporting modified collections.

Tests: \`npx vitest run tests/sondehub-provider.test.ts\`.
