# Alerts & Fleets V1

AirRadar keeps alert evaluation in the existing single-process
`AircraftStateService` path. The receiver snapshot is the only hot-path input;
fleet matching and geofence state are bounded in memory and no database row is
created for an ADS-B frame, position, or repeated squawk observation.

## Current architecture

- `lib/server/alert-engine.ts` consumes the canonical aircraft transitions and
  canonical `FlightIntelligenceService` events. It does not implement a second
  flight-event detector.
- `lib/server/alerts-fleets-v1.ts` contains the typed V1 matcher, rule,
  circular-geofence, deterministic occurrence-ID, and transition semantics.
- `lib/server/alert-history.ts` is the durable safe event ledger. It stores a
  compact aircraft snapshot and delivery status, with bounded tail reads and
  low-frequency byte-based compaction.
- `lib/server/watchlist-auth.ts` protects configuration mutations using the
  existing single-operator admin token and same-origin check.

## Matching and transition rules

ICAO hex and registration match exactly after normalization. Callsigns use
prefix matching only; no fuzzy matching is performed. Disabled fleets,
matchers, rules, and geofences cannot create new occurrences.

Flight-event occurrence identity is deterministic from `ruleId`, source type,
and canonical `FlightEvent.id`. Re-evaluating an event is therefore safe. The
canonical event remains the source for TAKEOFF, INITIAL_CLIMB, CRUISE_ENTER,
TOP_OF_DESCENT, APPROACH, LANDING, HOLD_ENTER, HOLD_EXIT, and GO_AROUND.

Only transitions into 7500, 7600, or 7700 are actionable. Repeated frames with
the same squawk do not alert. The first aircraft snapshot after restart is a
baseline, so an already-present special squawk does not create a restart storm.
Squawk wording describes an observed code; it is not independent confirmation
of an emergency or unlawful interference.

V1 circular geofences use a bounded radius and a 100 m hysteresis band. A
transition requires two consecutive observations on the new side of the band.
The first observation establishes baseline and does not emit ENTER/EXIT. State
is RAM-only and stale aircraft are evicted.

## Security and delivery

Alert configuration is private to the existing admin surface. Pushover remains
server-side only; credentials are read from environment configuration and are
never included in browser responses, history payloads, or logs. Alert history
is durable even when external delivery is unavailable. HTTP delivery is
retryable but cannot mathematically guarantee exactly-once external delivery
after an acceptance-timeout boundary.

## Product limitations

Alerts depend on locally observed ADS-B samples. Receiver gaps can hide a
boundary crossing, and aircraft outside local coverage cannot trigger a live
local alert. Pushover depends on external network/service availability.

The Czech localization is [available here](cs/ALERTS-FLEETS.md).


## Fleet Explorer V2 (V6-F first delivery)

The existing bounded watchlist-backed fleet response remains canonical; V6-F adds zero-request client-side fleet exploration on the already returned at-most-100 aircraft: total/live/offline counts, 30-day observed flight totals (sum of existing per-aircraft counts, not distinct flights), search across ICAO/registration/operator/callsign/type, live/offline filtering, and stable sorting by last observation, 30-day count or registration. It never implies full worldwide fleet coverage and adds no SQL, stream, API, or provider query. Airport comparison and Airport Live Board are already separate production features; no parallel reimplementation is made here.
