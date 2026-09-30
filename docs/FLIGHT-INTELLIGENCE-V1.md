# Flight Intelligence V1

Flight Intelligence has one canonical deterministic engine: `FlightIntelligenceDetector`
in `lib/intelligence/detector.ts`, owned by `FlightIntelligenceService` and called
from the single `AircraftStateService` live snapshot lane. Historical replay uses
the same detector through `lib/intelligence/replay.ts`; it does not maintain a
second heuristic implementation.

The normalized input is the existing sanitized `Aircraft` observation plus its
observation timestamp. The detector uses only available fields and rejects stale,
out-of-order, discontinuous, and network-only observations. Its track state is
bounded to 120 samples and is evicted with live aircraft cleanup.

Phases are `GROUND`, `TAKEOFF`, `CLIMB`, `CRUISE`, `DESCENT`, `APPROACH`,
`FINAL`, `GO_AROUND`, `LANDED`, and `UNKNOWN`. Confirmed transitions use
two-observation hysteresis except for strong operational transitions. Events are
sparse semantic rows in the existing `FlightEvent` model, keyed by a stable
flight lifecycle and event identity. Persistence is best effort and cannot stop
live radar operation.

V1 events include `TAKEOFF`, `INITIAL_CLIMB`, `CRUISE_ENTER`, `TOP_OF_DESCENT`,
`APPROACH`, `LANDING`, `GO_AROUND`, and the established project-compatible
holding names `HOLDING`/`HOLDING_ENDED` (candidate events are also retained).
Holding requires sustained bounded racetrack geometry, repeated turns, duration,
altitude stability, and airborne evidence. Go-around requires an established
approach, low-altitude descent, a sustained climb, and movement away from the
closest approach point.

Events expose rule evidence, a non-calibrated confidence level, and
`detectorVersion: flight-intelligence-v1`. Unknown route or airport context is
left unknown; disappearance from coverage never creates landing. A first sample
already airborne is seeded conservatively and cannot create a fictional takeoff.

The existing Airport Operations read model remains a bounded historical movement
projection. Where a persisted canonical `GO_AROUND` or `HOLDING` event is linked
to a flight, Airport Operations consumes that result instead of allowing its
movement projection to contradict it. It retains its sampled-position fallback
for flights without a canonical event.

Time Machine reads persisted events with occurrence-time bounds, so future events
are not shown at an earlier playback instant. Flight detail and replay remain
read-only; no alerts, ETA prediction, ML, or per-position event persistence is
part of V1.

See also: [Time Machine](TIME-MACHINE.md), [Airport Operations](AIRPORT-OPERATIONS.md),
and the [Czech version](cs/FLIGHT-INTELLIGENCE-V1.md).
