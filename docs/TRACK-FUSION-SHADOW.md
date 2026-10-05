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


## Readiness / Graduation V1

Track Fusion readiness is process-local and fail-closed. Shadow diagnostics are
sampled into bounded five-minute aggregate buckets covering at most 24 hours.
No database table or background timer is introduced.

A process restart intentionally resets the readiness evidence and therefore
returns `WAIT` until the minimum evidence is rebuilt. V1 requires:

- at least 120 minutes of runtime evidence;
- at least 5,000 fusion evaluations;
- at least 200 LOCAL↔NETWORK position comparisons;
- at least 10 observed source transitions;
- at least 1,000 comparisons against the current canonical position.

Once those evidence gates are complete, quality thresholds are evaluated:

- LOCAL↔NETWORK residual p95 must be at most 1.0 NM;
- disagreement rate must be at most 5%;
- rejected source-transition rate must be at most 25%;
- estimated gap-fill rate must be at most 10%;
- canonical divergence rate must be at most 5%;
- there must be no capacity evictions.

The versioned decision is `PASS`, `WAIT`, or `FAIL`. Admins can inspect it
through `GET /api/admin/track-fusion/readiness` and the `/system` page.

### First graduated consumer: Operational Digital Twin

Track Fusion still does not replace the public radar or canonical Aircraft
state. The first prepared consumer is Operational Digital Twin and it is
disabled by default.

`AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED=true` is necessary but not
sufficient. Fused state is used only when:

1. readiness is `PASS`;
2. the specific aircraft has a `GOOD` fused track;
3. the fused position is observed rather than dead-reckoned;
4. the position confidence is not LOW.

Only observed non-LOW fused numeric fields are consumed. Estimated altitude,
speed, track or vertical rate fall back to the canonical live value.

If any gate is not met, Digital Twin continues to use the existing local
canonical state. Enabling the flag therefore cannot by itself broaden Digital
Twin to network-only traffic.
