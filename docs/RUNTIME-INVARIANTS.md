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
  process. Its local and optional network poll loops share that one state
  owner; the local loop owns local stale cleanup, trails, statistics
  observation, alert transitions, ATC requests, and history sampling.
- Polling must not be duplicated by a second API route, browser timer, worker,
  or external integration. Optional enrichment is asynchronous and failures
  are contained.
- PostgreSQL, catalog, weather, photo, and notifier failures must degrade the
  relevant feature without stopping live readsb refresh.
- Aviation Weather is independent of live state: it may not add work to the
  readsb poller, alter `/api/stream`, enqueue history/statistics writes, or
  persist its RAM cache. Only canonical four-letter ICAO codes may reach its
  airport endpoints; IATA is never guessed into a weather request.
- International SIGMET and AirSIGMET caches are independent. A failed refresh
  may use that dataset's stale-if-error snapshot, but the response rechecks
  advisory validity so expired or future records are never revived. The two
  distinct AWC product namespaces are not deduplicated by text or geometry.

## SSE

- `/api/stream` is Server-Sent Events with named `snapshot` events. It is not a
  WebSocket endpoint and must retain `Content-Type: text/event-stream`, no
  caching/transform, keep-alive, and `X-Accel-Buffering: no` headers.
- Each client gets one subscription, a 15-second keep-alive heartbeat, and an
  abort/cancel cleanup. A slow client keeps only its latest pending snapshot;
  it must never create an unbounded queue.
- A disconnected listener is removed without affecting other listeners or the
  provider loop. Do not apply request rate limiting to this long-lived route.
- Active SSE clients are capped per Node process; capacity rejection is a
  safe bounded `503` with `Retry-After`, and every accepted connection
  releases its slot on abort/cancel/close.
- The live SSE DTO omits full metadata and flight-plan enrichment. Selected
  aircraft detail loads that data lazily; route context required by the map
  remains available in the live DTO.
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

## Extended network coverage

- `AdsbLolProvider` is optional and uses only the public geographic ADSB.lol
  API. It must not use `re-api`, BEAST/TCP, or any second live-ingest path.
- The provider has one in-flight request, bounded timeout/retry/backoff,
  response validation, bounded aircraft/trail state, stale-if-error behavior,
  and safe diagnostics. `Retry-After` is honored for HTTP 429 responses.
- Local and network observations are held in separate maps. The default live
  coverage is local; extended coverage explicitly merges by normalized ICAO
  identity and never mutates the local map or local health state. Extended is
  the true observation union: every local aircraft ID is present in extended,
  including observations without a fresh usable position.
- Merge arbitration is explicit: a position candidate must have valid `lat`
  and `lon` plus fresh `seen_pos`; a fresh usable local position wins before a
  network position is considered, and network is the extended fallback when
  local position is missing or stale. If no fresh candidate exists, the local
  last-known position is retained when usable; an aircraft with no position is
  still retained with nullable coordinates. Source type is only a tie-break
  within an origin. Local descriptive fields and receiver-local RSSI/message
  counters remain authoritative. Network-only aircraft have null local
  measurements.
- Network-only observations are excluded from PostgreSQL history, daily
  statistics/coverage, alerts, metadata enrichment, and ATC resolution. Public
  output includes safe source/provenance and ADSB.lol ODbL attribution, but no
  raw provider errors or exact receiver coordinates by default.

## OGN / FLARM integration

- `OgnProvider` and `OgnStateService` are optional server-side singletons,
  separate from `AircraftStateService`. `OGN_ENABLED=false` is the default;
  disabled mode creates no TCP, DDB refresh, cleanup, or OGN SSE work.
- OGN identity is `addressType + address`; callsign is observation metadata.
  Newer observations replace the canonical target, equal timestamps may add
  receiver provenance, and older packets never roll back position or identity.
- APRS-IS is receive-only with CRLF login, a server-side radius filter, and a
  periodic comment-only `#keepalive`; no aircraft telemetry is sent. The
  bounded line reader accepts no line over 512 bytes including its line ending.
  `OGADSB` is dropped by the local classifier even if the server filter
  delivers it; unknown and unsupported TOCALLs are fail-closed.
- OGN targets are RAM-only and must not reach Prisma, `AircraftStateService`,
  ADS-B history/statistics/reception records, alerts, enrichment, ATC, or
  receiver health. The map uses dedicated GeoJSON source/layers and the UI
  has a separate OGN list/detail selection.
- DDB refreshes are bounded and atomic. While the DDB has no usable snapshot,
  OGN targets are not public. Packet no-tracking and DDB `tracked=N` are
  dropped; DDB misses, `identified=N`, and packet stealth are anonymous. The
  public serializer never sends anonymous address, sender, registration,
  competition number, model, receiver signal, or receiver history.
- OGN targets are stale after 15 seconds, removed after 60 seconds, and
  capped at 5,000. `/api/ogn/stream` has its own initial snapshot, heartbeat,
  abort cleanup, SSE capacity slot, and newest-only pending update.

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
  `atc-transmitters`, `route-airports`, `aviation-sigmet`; layers `range-rings-line`,
  `selected-trail-line`, `atc-sectors-fill`, `atc-sectors-line`,
  `atc-sectors-label`, `atc-transmitters-circle`,
  `route-airports-circle`, `route-airports-label`, `aviation-sigmet-fill`,
  `aviation-sigmet-line`;
- OGN uses source `ogn-targets` and layers `ogn-targets-circle` and
  `ogn-targets-label`; these are GeoJSON layers, not DOM markers, and are
  hidden until the operator enables the separate OGN map toggle.
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
