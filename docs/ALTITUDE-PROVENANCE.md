# Altitude provenance and forensics

AirRadar treats altitude provenance as a field-level concern. A live aircraft
can have position, altitude, telemetry, and catalog data from different paths;
the aircraft-level `source` is not sufficient to explain the altitude.

## Observation and policy

Every new altitude candidate is represented internally by an
`AltitudeObservation` containing its value, source, provider, protocol,
barometric/GNSS type, Beast DF/TC metadata when available, observation time,
receipt time, confidence, and computed freshness age.

The current policy is:

1. fresh local Beast;
2. fresh local `aircraft.json` (`READSB_JSON`);
3. fresh network, MLAT, or TIS-B data;
4. other/unknown data only as a fallback.

Local and network candidates are fresh for 30 seconds. Freshness is calculated
from the altitude observation timestamp, not from an aircraft's unrelated
`lastSeen` message.

Large disagreement is a diagnostic signal, not an absolute-altitude rule.
Candidates differing by more than 12,000 ft produce a bounded anomaly record;
an isolated high altitude is not rejected solely because it is high. A raw
Beast outlier above 80,000 ft is allowed to lose to a corroborated lower
candidate when the disagreement guard is active. A same-source temporal jump
is checked against 24,000 ft/min for gaps shorter than five minutes; first
observations, long gaps, and source changes are handled conservatively.

## Persistence

New `FlightPosition` rows persist nullable `altitudeSource`,
`altitudeProvider`, `altitudeProtocol`, `altitudeType`,
`altitudeObservedAt`, and `altitudeDecisionReason`. These fields are written
from the same decision object as `altitude`, so value and provenance cannot be
selected independently. Historical rows remain NULL; no provenance backfill
is performed.

Significant disagreement and temporal-jump decisions are written sparsely to
`AltitudeAnomaly`. The row stores the ICAO, optional flight, selected value and
source, decision reason, anomaly type, and a bounded candidate JSON snapshot.
The existing periodic history retention lane removes events older than the
configured history retention (30 days by default); normal frames do not write
to the database.

## Diagnostics and security

The process keeps bounded counters, source-switch events, recent anomaly
snapshots, and a 250-entry Beast altitude forensic ring buffer in memory.
Admin system status exposes these diagnostics only after the existing
watchlist admin session check. `/api/admin/altitude/:hex` explains the current
selected value, age, candidates, rejected candidates, reason, and anomaly for
one ICAO. The public aircraft/SSE serializers do not include decision objects
or candidate snapshots.
