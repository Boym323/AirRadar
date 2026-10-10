# RXW ACARS Hub integration (V1)

AirRadar can optionally receive **content-free ACARS/VDL-M2 metadata** from a remote instance of
[sdr-enthusiasts/docker-acarshub](https://github.com/sdr-enthusiasts/docker-acarshub).
This adapter targets the Socket.IO `/main` namespace and uses `acars_msg` and
`acars_msg_batch`. It does not require `dumpvdl2`, `acarsdec` or a second SDR receiver.

## Activation

1. **Confirm with the RXW operator** that automated access and reuse of metadata are permitted.
   The public website and open-source application protocol do not constitute API authorization.
2. Set `RXW_HUB_ENABLED=true` on the AirRadar server. It is **false by default**.
3. Optionally set `RXW_HUB_URL=https://hub.rxw.cz` (the default). HTTPS only; no URL credentials.
4. Restart AirRadar. The server starts **one shared Socket.IO connection per Node process**.
5. Open an aircraft detail page. The **Komunikace** section appears when enabled.

When disabled, the integration creates no network connection, writes no records and displays no section.

## Data and privacy policy

The adapter **never stores, republishes or logs message text**, decoded CPDLC/ACARS payloads,
personal information or raw message objects. Only ICAO24, timestamp, protocol, radio
frequency, station identifier, message label and an upstream UID are held in an in-memory
bounded cache. The cache is not persisted; it expires messages after two hours.

Matching requires a valid ICAO24 hex address (not non-ICAO `~` readsb identities or callsign
guesses). Incoming positions are **never merged into the ADS-B map or flight tracks**.
One client connection receives incoming messages and a capped initial batch; public aircraft
API requests only read the local cache. Failures are isolated from the radar runtime.

Bounds: 512 aircraft, 20 messages per aircraft, 12,000 UID records, 100 items per received
batch. An aircraft detail page polls `GET /api/aircraft/{icao24}/communications` every
30 seconds; the endpoint uses the existing public aircraft rate limit.

## Observability and limitations

The API returns `enabled`, `connection`, `lastReceivedAt` and `messages` as a fail-soft,
no-store JSON response. Connection states: disabled, connecting, connected, disconnected,
error, stopped. No database migration is needed.

Only the upstream open-source application protocol was verified. Connectivity and access
rights of **hub.rxw.cz** have not been confirmed; enabling requires operator approval.
Messages may lack ICAO24 and are deliberately dropped instead of making unreliable matches.
History is only process-local for up to two hours, not a durable archive.

Tests: `npx vitest run tests/rxw-hub-store.test.ts`
