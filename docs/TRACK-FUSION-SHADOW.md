# Track Fusion Shadow V1

Track Fusion Shadow V1 is a bounded, in-memory validation layer for a future
multi-source canonical aircraft state. It runs beside the existing
local/network merge and source-affinity continuity logic. V1 never replaces the
canonical `Aircraft` object, never changes the radar SSE payload, and never
writes fused or estimated positions to PostgreSQL.

## Why shadow first

AirRadar currently has strong source-boundary protections:

- local receiver observations remain authoritative for receiver history,
  statistics and reception records;
- network ADS-B/MLAT stays RAM-only;
- source affinity prevents local/network marker flapping;
- continuity guards defer suspicious mass disappearance;
- per-source plausible-position checks reject impossible jumps.

Those protections intentionally prefer stability and provenance over aggressive
fusion. Track Fusion Shadow measures whether a field-level estimator can improve
continuity without weakening those guarantees.

## Observation model

Each retained local or network `Aircraft` becomes a normalized field-level
observation for position, altitude, groundspeed, track and vertical rate.

Every candidate keeps source class, concrete origin, ADS-B/MLAT source, field
observation time, protocol provenance when available, ADS-B integrity values,
freshness age, deterministic quality score and confidence.

The score favors fresh local ADS-B but does not force every field to come from
the same source. LOCAL may remain the position source while NETWORK fills a
missing groundspeed.

## Shadow estimator

For each ICAO identity V1 selects the best candidate independently for position,
altitude, groundspeed, track and vertical rate.

When both LOCAL and NETWORK positions exist, the engine records their great-
circle residual. A source transition is checked against a constant-velocity
projection of the previous fused shadow state. A transition outside the bounded
uncertainty envelope is rejected in shadow. When no credible observed position
remains, V1 may dead-reckon for at most six seconds.

Held non-position fields are bounded to ten seconds. Estimated state is marked
explicitly and carries increasing uncertainty.

Position uncertainty starts from ADS-B containment/NAC information when
available, otherwise from conservative ADS-B/MLAT defaults, then grows with
observation age.

## Diagnostics

Admin system diagnostics expose active GOOD / DEGRADED / ESTIMATED /
NO_POSITION tracks, overlap count, LOCAL↔NETWORK residuals, accepted/rejected
source transitions, gap fills, canonical divergences, per-field source
selection counters and a bounded list of recent disagreements.

Authenticated inspection endpoint:

`GET /api/admin/track-fusion/:hex`

returns only shadow state and is `no-store`.

## Runtime boundary

Track Fusion Shadow is not a new ingest path. It reads the already-retained
local/network maps, owns no timer/socket/EventSource/upstream request, performs
no database I/O, does not call enrichment providers and never serializes fused
state into the public radar snapshot.

The feature is enabled by default and can be disabled with
`AIRRADAR_TRACK_FUSION_SHADOW_ENABLED=false`.

## Critical provenance invariant

A fused or estimated position is not local receiver evidence.

```text
LOCAL observation   -> receiver history/statistics/FlightPosition
NETWORK observation -> RAM network context
FUSED/ESTIMATED     -> display/intelligence only
```

A future rollout may consume fused state in Digital Twin or route-conformance
logic only after shadow evidence is reviewed. V1 performs no promotion.

## Suggested graduation path

1. collect real overlap residual and transition evidence;
2. validate false-rejection and gap-fill rates;
3. add bounded outcome reports for source handovers;
4. promote fused state only to an opt-in display path;
5. evaluate Digital Twin input separately;
6. keep durable local-receiver evidence unchanged.
