# T60 candidate — bounded incremental network trail updates

Date: 2026-10-15. Source branch: `main` at `7f3b5284` (merged #895).

## Motivation

Post-#885 T58 one-hour production observation (version 1.0.457 / 08b009f7,
**pre-#895**) measured 3,370,880 snapshot.trail-update calls costing
82,354.439 ms attributed CPU, with snapshot.network at 137,481.774 ms CPU.
Both metrics include phases beyond network trail updates and **may overlap**.
No post-#895 T59 evidence was available when this optimization was prepared.
T58 also observed a 7,398.752 ms worst event-loop delay and RSS P50
1,138.227 MiB. This change is **not** claimed to explain or fix that stall.

## Change

Previously, every network poll used `appendTrailPoint(base, point)` to
materialize a new array even on stale/invalid samples, then `filter()` parsed
every retained point's date, then `slice()` copied all bounded points again.
With default 120-point trails this repeated work for every plane on every poll.

The new `appendBoundedNetworkTrailPoint()`:

- Treats trail arrays produced by the helper as **immutable snapshots**,
  marked with a `WeakSet` so cached metadata does not retain historical
  arrays (no strong/global map of aircraft identities).
- Proves once that a legacy/imported trail has finite chronological point
  timestamps. For malformed and unsorted trails, runs the **exact previous**
  `appendTrailPoint + filter + slice` path until the invariant is established.
- Uses binary search over chronological timestamps for expiry, instead of
  scanning and parsing all points, and builds only the necessary bounded copy
  when there was an append, tail replacement, expiry or count pruning.
- Reuses the original array **by identity** when no new eligible position or
  pruning occurs. No in-place mutation, no state sharing across aircraft,
  no change to late-point rejection, plausibility limit, source-switch reset,
  max age, point count, recorded timestamps, altitude or normalization.
- Keeps all existing max-point and max-age configuration and source
  provenance rules unchanged.

Under the verified chronological invariant, age pruning changes from an
O(N) timestamp scan per update to O(log N), and common no-op updates from
two or three allocations to zero. Real performance depends on how often
position timestamps repeat and on live/network trail length.

## Tests and measurements

- `npm run test:targeted -- tests/network-trail-optimization.test.ts tests/aircraft-trail.test.ts tests/aircraft-state.test.ts`
- `npm run typecheck` and `npm run lint`; full release-preview CI/CodeQL
  required on the precise integration commit before merge.
- Offline matched microbench, **report-only**:
  `JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-network-trail-update.ts`.
  300 aircraft, 180 frames, 120-point trails; measures CPU and wall time of
  the original `append+filter+slice` versus the new helper after a warmup,
  and rejects any difference in serialized final trail state.
- Differential test compares the optimized helper against an independent
  copy of the old algorithm for 1,800 mixed update cycles, malformed trails,
  unrealistic jumps, expired points, repeated/older observations, source
  resets, minimum max-length and nonfinite cutoffs. No performance threshold
  is asserted in CI.

## Controlled release

Do not merge until CI and code review pass. The production deploy is a
separate action. Observe a matched post-release soak (suggest T60 if T59 is
the #895 release soak) including CPU per trail-update call, networking hot
path, RSS trend, per-aircraft trail limits, event-loop max/P99 and traffic
mix. Because the original T58 was recorded **before** #895, it must not
be used as a direct causal baseline for this incremental PR.
