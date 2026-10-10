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
frequency, station identifier, message label, structured route observations and
an upstream UID are held in an in-memory bounded cache. The cache is not persisted; it expires messages after two hours.

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

Tests: `npx vitest run tests/rxw-hub-store.test.ts tests/rxw-hub-service.test.ts`

## V2: Structured route evidence

The adapter now parses only upstream structured `depa`, `dsta`, `eta`, and
`flight` fields. It accepts complete **3-letter IATA / 4-letter ICAO**
airport pairs within the same message and a UTC **clock-only** ETA
(`HHMM`, `HH:MM`, or a trailing `Z`). It never derives waypoints from
`text`, `data`, `libacars`, or `decodedText`; no full filed route is claimed.

`GET /api/aircraft/{icao24}/communications?flight=CSA123` returns a
`routeHint` marked `source=rxw-acarshub`, `confidence=reported`,
and timestamped with the original reception time. A hint is selected only
when a **single message** supplies both airports, ICAO24 matches the
aircraft and the ACARS flight identifier exactly matches the requested
live callsign, and the message is at most **45 minutes** old. Reports
without a flight identifier remain visible as historical metadata but
are never promoted into an active-flight route. The API returns null
when these checks fail.

The aircraft detail's **Datová komunikace** section shows the reported
airport pair and ETA separately from the existing ADSBDB/ADSB.lol and
FlightAware route information, explicitly labeled **unverified**.
RXW does **not** overwrite the canonical `FlightRoute`, change
flight-history records, or generate additional FlightAware calls.
The route evidence is kept only in the already-bounded in-memory
message cache (two-hour message retention); it does not introduce DB writes
or new network requests. Access still requires RXW operator permission.

## V3: H1/FPN waypoint plans and radar differentiation

V3 adds a **strict, bounded decoder for the known H1/FPN flight-plan layout**.
This is a separately enabled capability: set both \`RXW_HUB_ENABLED=true\` and
\`RXW_FPN_ENABLED=true\` only after receiving authorization to use the content.
Both flags default to off. \`RXW_FPN_ENABLED\` alone creates no RXW connection.

* The decoder accepts an **entire single** H1 message beginning with \`FPN/\`,
  containing \`DA\`, \`AA\` and a sequence of \`F\` waypoint fixes (or a
  recognizable \`CR\` sequence). The message must end with four hex checksum
  characters; the checksum **is not cryptographically verified**.
* The \`RP\` status means **planned/reported**, not verified as the active
  filed flight plan. \`RI\` invalidates the matching older plan. The decoder
  checks the optional FPN header flight against the ACARS flight identifier.
* Waypoints preserve order, names, optional inbound airways and explicit
  georeferences (\`N01234W123456\` = 1.234°, −123.456°). Unknown coordinates
  stay null. Missing payload chunks are not reconstructed or guessed.
* Full ACARS text and decoded payloads are never cached, logged, published
  in an API, or written to PostgreSQL. The parser only extracts allowlisted
  plan metadata and at most 80 fixes. Plans are bounded to 256 aircraft,
  expire after 45 minutes and are matched by **ICAO24 + exact callsign**.
* \`GET /api/aircraft/{icao24}/communications?flight=... \` now also returns
  \`waypointPlan\` for an exact match. The radar calls
  \`GET /api/aircraft/communications/waypoints\` **once every 60 seconds**
  to retrieve a maximum of 256 aircraft identifiers and their flight
  identities, never per-aircraft route requests.
* Aircraft with a recent matching RP plan receive an amber **FP** indicator
  and subtle ring on the map. For a selected aircraft, a dashed amber
  route/waypoint overlay includes **only adjacent fixes with explicit
  coordinates**. It never interpolates across missing waypoints or
  discontinuities. Existing aircraft icon priority/emergency appearance,
  ADS-B tracks, ADSBDB/ADSB.lol and FlightAware are unchanged.

Only the documented H1/FPN format is supported. Other types such as H1/POS,
ADS-C, multi-part reassembly, SID/STAR synthesis, and file-plan quality
promotion remain future work. Actual RXW availability and operator
authorization remain unverified.

V3 tests: \`npx vitest run tests/rxw-fpn-waypoints.test.ts\`
