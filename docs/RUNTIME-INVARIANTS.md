# Runtime invariants

These are behavior and safety contracts for changes to the current system.

## Identity and flight semantics

- ICAO hex is the aircraft identity. Normalize it before live-map lookup,
  history persistence, alerts, and public links. readsb's `~` six-digit
  non-ICAO identifier remains a valid stable identifier where the existing
  route accepts it.
- A callsign is an observation and may change. `Flight` is a flight instance,
  not a callsign.
- When both old and new callsign observations are present and differ, close
  the old open flight at the current `recordedAt` and open a new instance.
- On a continuity gap, close the old flight at its old `lastSeenAt`; do not
  move that timestamp forward to the cleanup time. Open the new instance at
  current `recordedAt`.
- Aircraft detail/history must not attach a slow enrichment response to a
  newer observation of the same hex.

## Observation values

- Derived altitude and vertical rate prefer barometric values and fall back to
  geometric values. Preserve raw barometric and geometric values in the
  normalized aircraft shape.
- Invalid coordinates are nullable. `(0, 0)` is not useful receiver/aircraft
  coverage data. Internal distance and bearing calculations use exact receiver
  coordinates; public DTOs use the configured safe position mode.
- A route line is a schematic visualization between resolved airport points
  and current position, not proof of a filed route. The observed ADS-B trail
  remains a separate overlay.

## Single state owner

- `getAircraftStateService()` returns one `globalThis` service per Node
  process. Its one poller owns RAM live state, stale cleanup, trails,
  statistics observation, alert transitions, ATC requests, and history
  sampling.
- Polling must not be duplicated by a second API route, browser timer, worker,
  or external integration. Optional enrichment is asynchronous and failures
  are contained.
- PostgreSQL, catalog, weather, photo, and notifier failures must degrade the
  relevant feature without stopping live readsb refresh.

## SSE

- `/api/stream` is Server-Sent Events with named `snapshot` events. It is not a
  WebSocket endpoint and must retain `Content-Type: text/event-stream`, no
  caching/transform, keep-alive, and `X-Accel-Buffering: no` headers.
- Each client gets one subscription, a 15-second keep-alive heartbeat, and an
  abort/cancel cleanup. A slow client keeps only its latest pending snapshot;
  it must never create an unbounded queue.
- A disconnected listener is removed without affecting other listeners or the
  provider loop. Do not apply request rate limiting to this long-lived route.
- Public serialization must remove raw provider errors and must not expose
  exact receiver coordinates unless `PUBLIC_RECEIVER_POSITION_MODE=exact` is
  deliberately configured.

## History

- Live state belongs in RAM; PostgreSQL stores sampled positions and durable
  reference data, not every ADS-B update.
- The history queue is coalesced and its writer is single-lane. Per-aircraft
  writes have bounded concurrency; one failed aircraft does not reject other
  samples or mark the receiver offline.
- `FlightPosition` is sampled only for valid positions and is capped by the
  API when returned. Retention cleanup is periodic and non-destructive to the
  application schema.
- A history/database outage must leave live radar available. The per-hex
  history endpoint may use the current in-memory trail as its fallback.

## Statistics and coverage

- Daily boundaries use `APP_TIMEZONE`, not UTC by accident. The RAM aggregate
  rolls over at the local-day boundary and startup merges the persisted current
  day without replacing live observations.
- Coverage has exactly 36 fixed buckets of 10 degrees. Each bucket stores the
  maximum valid receiver-to-aircraft distance; zero/unpopulated buckets do not
  reduce the populated-bucket average.
- Statistics persistence is throttled, writes changed rows only, is best
  effort, and flushes during orderly shutdown. Current live aircraft count and
  messages/second remain process/live values.

## ATC

- ATC assignment is a probable candidate based on aircraft position,
  comparable altitude, and observation time. It never claims the aircraft's
  actual tuned frequency.
- Point-on-boundary matches are explicit. AGL limits cannot be compared with
  MSL aircraft altitude without terrain data, so altitude confidence becomes
  `unknown`; this must not be silently presented as a matched altitude.
- Imported rows retain source, reference, validity, altitude references, and
  last-verification metadata. No authoritative transmitter locations are
  invented when the Czech eAIP sync cannot provide them.
- Sample ATC is automatic only with no configured real receiver. A real
  receiver must explicitly opt in with `ATC_SAMPLE_ENABLED=true`; production
  default is imported PostgreSQL data or an empty layer.
- Czech eAIP rows without a durable authoritative ID are blocking by default.
  Only explicitly audited source-limited rows may be classified as
  `source_limitation`; they remain blocking when history is unknown or the same
  object was previously imported. Annotation values are provenance, not IDs.
- Czech boundary reconstruction uses ČÚZK Data50 for national borders and
  BKG VG25 for the Germany–Poland international border. Endpoint snapping is
  production-safe only at or below 0.5 km; unresolved, ambiguous,
  disconnected, or invalid geometry fails before the import transaction. No
  straight-line guess is allowed.

## MapLibre namespaces and cleanup

The `AirRadarApp` map owns its map instance, controls, DOM markers, animation
frames, event listeners, and dynamic source data. Its generic IDs are:

- sources `range-rings`, `selected-trail`, `atc-sectors`,
  `atc-transmitters`, `route-airports`; layers `range-rings-line`,
  `selected-trail-line`, `atc-sectors-fill`, `atc-sectors-line`,
  `atc-sectors-label`, `atc-transmitters-circle`,
  `route-airports-circle`, `route-airports-label`;
- Route V2 constants in `lib/route-visualization.ts`: sources
  `selected-route-v2` and `selected-route-airports-v2`; layers
  `selected-route-completed`, `selected-route-remaining`,
  `selected-route-airports-v2-circle`, and
  `selected-route-airports-v2-label`.

Route V2 must stay disjoint from `selected-trail`; switching/deselecting a
  live aircraft clears both overlays without crossing identities. DOM markers
  are keyed by ICAO hex, and MapLibre retains ownership of marker positioning;
  application CSS applies visual effects to child elements.

`AirRadarApp` cleanup cancels animation frames, removes receiver and aircraft
markers, clears trail/animation maps, and calls `map.remove()`. `AirportMap`
owns and removes its own map and airport marker. `HistoryMap` owns and removes
its history map, playback marker, and dynamic history layers through
`map.remove()`. A new map resource must be added and cleaned up by the
component that created it.

## Graceful shutdown and build/start coordination

- The coordinator owns SIGTERM/SIGINT once, removes Next's exit-based
  handlers, runs a bounded cleanup budget, then re-delivers the signal so the
  process exits with the original signal semantics.
- Cleanup order is state stop/history drain, statistics close, provider close,
  then database close. Repeated shutdown calls join one promise. Work still
  running after a phase timeout is observed/logged without blocking later
  phases indefinitely.
- Production starts the direct Node entrypoint under systemd as `MainPID`.
  `NEXT_MANUAL_SIG_HANDLE=1` leaves one signal owner and `KillMode=control-group`
  lets systemd clean the process group.
- Production builds hold `/run/lock/airradar-build.lock`. The start wrapper
  waits for that lock and requires `.next/BUILD_ID` before importing Next. A
  build/start lock change must preserve this race-prevention contract.
