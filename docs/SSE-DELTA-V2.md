# SSE Delta V2

`GET /api/stream` remains the V1 full-snapshot feed by default. A client opts
into V2 with `?v=2`; `coverage=local|extended` is negotiated independently.

The first V2 event is a complete public live snapshot:

```json
{
  "protocol": "airradar-sse-v2",
  "sequence": "1",
  "aircraft": []
}
```

Later events are named `delta` events. They carry the current non-aircraft
public snapshot fields plus only changed aircraft and disappeared ICAO hexes.
Sequences are decimal strings and are scoped to one SSE connection. A
reconnect starts with a fresh full snapshot; clients must not coerce sequences
to JavaScript numbers.

Aircraft are always identified by ICAO hex. A changed item replaces the
client's previous item, a new item is included in `changed`, and every item in
`removed` is deleted. The public serialization boundary is shared with V1, so
receiver privacy, provider error sanitization, route context, and coverage
semantics are not bypassed.

The server keeps only one public fingerprint map per active V2 connection.
The map is bounded by the existing SSE client capacity and is released on
stream cancellation, request abort, or enqueue failure. Slow connections keep
only their newest pending internal snapshot; the delta baseline advances only
after that snapshot has actually been queued.

V1 consumers and secondary pages remain unchanged. The main radar client uses
V2 and rejects malformed or out-of-order deltas, reconnecting for a fresh
snapshot rather than mutating an uncertain state.

Sanitized `/api/system/status` runtime diagnostics report V1/V2 active counts,
the most recent V2 snapshot and delta byte sizes, and bounded recent delta
counts/average size. They contain no payload, aircraft identity history, or
private receiver coordinates.
