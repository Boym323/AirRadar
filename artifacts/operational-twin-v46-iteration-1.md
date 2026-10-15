# Operational Twin V4.6 iteration 1

## Production baseline

Source: read-only T5.7 soak at `/var/lib/airradar/t57-soak-20261015T065700+0200/`.

- Version/commit: `1.0.453` / `e8260a6a`
- `twin.eventOutcome.local`: 701 calls, 920,754.833 attributed CPU ms, 0 wait ms, worst window p99 5,011.605 ms.
- `snapshot.operationalTwin`: 920,914.709 CPU ms. Event Outcome accounts for 99.98% of that measured total.
- CPU P95: 100%; RSS P50: 1,153.754 MiB; heap used P50: 632.113 MiB.
- The user-provided V4.5 summary reports a 14,025.8 ms maximum event-loop stall and 40 unique windows above five seconds.

The T5.7 report attributes process CPU synchronously to Event Outcome and separately measures async database settlement/timeout overshoot. Async wait is not counted as Event Outcome CPU.

## Code evidence

Before this iteration, every unchanged local refresh could serialize up to 120 trail points per aircraft into a new JSON fingerprint. Provider age fields (`lastSeen`, `seenSeconds`, `seenPosSeconds`) were included separately even when their derived `positionObservedAt()` stayed unchanged. The validator also traversed all pending IDs and repeated the ATC endpoint cache lookup when an aircraft's canonical truth version had not changed.

## Iteration 1 changes

- The local `AircraftStateService` reuses its immutable local trail array when the position timestamp and all truth-relevant position fields are unchanged. Same-time corrections still replace the point.
- Truth invalidation now uses the canonical derived position timestamp and truth fields. A same-reference trail can reuse the parsed/sorted truth state without allocating a full fingerprint.
- Newly captured outcomes are kept in a per-ICAO dirty set. A repeated snapshot with no truth change skips pending traversal and ATC lookup; a truth change still traverses that ICAO's pending set.
- Report counters expose fingerprint builds, trail points fingerprinted, truth-state reuses, pending visits, and truth points built/evaluated.
- The full-scan reference path remains available for differential comparison.

## Matched microbenchmark

Command: `npm run benchmark:twin-event-outcome`  
Node: `v22.23.3`  
Input: 60 aircraft, 120 trail points, 360 captured pending outcomes, 10 refreshes. Provider age values change each refresh while `positionObservedAt()` stays fixed; the trail includes a replacement and an older-point correction. ATC cache is enabled in both algorithms.

| Metric | Full-scan reference | Incremental |
| --- | ---: | ---: |
| Warm observe P50 | 17.723 ms | 0.246 ms |
| Warm observe P95/P99/max (10 samples) | 28.341 ms | 39.369 ms |
| CPU over run | 279.551 ms | 189.932 ms |
| Pending entries visited | 2,700 | 900 |
| Pending entries skipped without new truth | 0 | 1,800 |
| Truth points built | 72,300 | 21,720 |
| Truth points evaluated | 325,800 | 44,457 |
| Canonical fingerprint builds | n/a | 180 |
| Unchanged truth-state reuses | n/a | 420 |
| Heap delta | +12.72 MiB | +13.10 MiB |
| RSS delta | +0.25 MiB | +0.25 MiB |

Differential semantic reports matched. The 10-sample P95/P99/max is noisy and regressed in this run, so these measurements do not establish a reliable tail-latency improvement. Heap deltas are process snapshots, not an allocation profiler; GC events were not attributed by phase.

## Acceptance gaps

This iteration does not yet meet the V4.6 release verdict. The matched benchmark does not cover the full 1s/3s/10s × 50/70/100/250 aircraft × 1k/3k/6k pending matrix, 60 minutes, realistic prediction recovery/expiry, or pending-event end-to-end `AircraftStateService` load. Per-operation wall time for truth parsing/diff, cache cleanup, heap work, and allocations/GC is not yet sampled. No stable production-equivalent tail-latency reduction has been demonstrated.

**Verdict: V4.6 BLOCKED — ROOT CAUSE NOT RESOLVED.**


## Integration onto V4.6.2 main (2026-10-15)

The previous PR-only phase profiler and allocation estimates have been removed
as duplicated functionality. The shared, bounded V4.6.2 forensic instrumentation
from main remains active in its original opt-in form. The algorithmic changes
now include canonical truth fingerprinting, immutable trail reuse, incremental
pending evaluation with dirty captures, and no redundant unchanged-truth ATC
checks. Production-equivalent benchmark, complete 60-minute matrix, and
stable P99/max acceptance remain outstanding. PR stays draft; no deployment.


## V4.6.3 ATC current-truth fast path — production validation pending

The ongoing T57 on `1.0.454 / ca25f52b` reported many long
`pendingTraversal` invocations and sampled, expensive ATC context calls.
This supports investigating ATC membership as a hot path, but does not prove
ATC caused every observed event-loop stall.

The ATC_SECTOR_ENTRY truth check previously computed complete
`computeAtcContext()` despite consuming only `currentAirspaces[].id`.
That full function also computes nearest ATS routes, navigation points,
next sector projections, and ahead sectors. The new
`getCurrentAtcSectorIds()` uses the prepared bbox/grid candidate index and
the same exact-polygon and vertical-match predicates as the reference. It
produces only current-sector IDs. Tests compare both implementations for
boundary positions, invalid coordinates, different altitude references,
ground aircraft and absent altitude.

The existing V4.6.2 `atcContextComputation` metric name is preserved for
schema compatibility, but measures sector-only truth computation after this
commit; its per-call latency is **not** directly comparable with the old
full-context work without this change in semantics being noted.

No production deployment, ATC configuration change, or measurement
interruption was performed. Production-equivalent replay, large-geometry
regression, tail latency and acceptance remain outstanding. PR stays draft.
PR #878 separately addresses asynchronous dataset preparation and cache
freshness; merging both later requires resolving changes in ATC engine code.


## V4.6.3 current-sector cache identity

The sector-only predicate depends on the prepared dataset identity,
latitude, longitude and the truth altitude used for both geometric and
barometric comparisons. Unlike full ATC future-projection context, it does
not depend on observation timestamp, track, groundspeed, vertical rate or
on-ground state. ATC truth cache keys now include the membership-relevant
coordinate/altitude fingerprint, not the observation time. This both
avoids recomputation after timestamp/heading churn and prevents distinct
aircraft at different positions but the same timestamp from evicting each
other's entries. Existing LRU/TTL bounds, invalidation by immutable prepared
dataset identity, and truth-snapshot change detection remain intact.
Regressions explicitly cover time/heading churn and different locations
with an identical timestamp. Effect on production hit rate requires
controlled matched workload measurements; no percentage gain is claimed.


## T57 matched synthetic validator replay — reproducibility gate

A new **non-production, deterministic** benchmark
`scripts/benchmark-operational-twin-t57.ts` uses the final T57 workload
shape: 78 local aircraft, 20 pending predictions, 120-point local trails,
a 3-second snapshot interval, shared immutable trail references and
periodic corrections. It compares full-scan and incremental algorithms on
the **same commit**, checking **semantic equality** before reporting timing.
It reports per-run CPU, wall-time P50/P95/P99/max, GC/RSS context, event-loop
delay, ATC cache hits/misses, pending cardinality, and instrumentation counts.
The focused 30-second semantic gate is run as a Vitest test in CI; reported
timings are diagnostic (no noisy strict CI speed threshold).

Representative run (60 synthetic seconds, two paired repetitions):

```sh
npm run benchmark:twin-t57
```

Full opt-in stress workload (1s/3s/10s × 50/70/100/250 aircraft ×
1,000/3,000/6,000 pending; one simulated hour per case; three independent
paired repetitions; **very expensive, must run on a separate idle host**):

```sh
RADAR_TWIN_T57_PROFILE=matrix npm run benchmark:twin-t57
```

For a limited local matrix, use
`RADAR_TWIN_T57_COUNTS`, `RADAR_TWIN_T57_PENDING`,
`RADAR_TWIN_T57_INTERVALS`, `RADAR_TWIN_T57_DURATION_SECONDS`,
and `RADAR_TWIN_T57_REPEATS`. Output is JSON with no aircraft IDs or
coordinates; no production API or database is contacted. Do not run it on
the live production host during a soak.

**Critical limitation:** `full-scan` vs `incremental` within the current
branch is **not** a true before/after of production `ca25f52b`; both
arms use the same improved current-sector ATC fast path and cache key.
A production-commit comparison must instrument a separate, throwaway
checkout or worktree using the same fixture code, with matching Node
version, resource limits, environment and runner. This benchmark also
does not replay a full `AircraftStateService` pipeline, production sector
geometry, raw receiver frames or actual incoming event/expiry patterns.
No benchmark measurements or release acceptance are claimed until run.


### Bounded synthetic pending replenishment

A single initial capture would expire after the bounded spatial window and
leave the rest of a 60-minute stress matrix mostly idle. The benchmark
therefore replenishes its original pending population every **10 simulated
minutes**, reusing the same aircraft population but assigning new capture
times. This is a synthetic fixed-pressure *stress* regime, explicitly **not**
the observed T57 1.333 captures/minute. For the <=24 pending representative
case, outcomes are distributed across up to nine aircraft to approximate the
observed T57 distribution. Population is bounded by the real 6,000-pending
capacity; each run still reports its measured final pending count.
