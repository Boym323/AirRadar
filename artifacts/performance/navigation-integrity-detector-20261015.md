# Navigation Integrity detector optimization — candidate generation

Date: 2026-10-15. Based on `main` commit `0dfd4075eaf9`,
which includes the completed, merged trail optimization PR #899.

## Motivation and limits

T58, recorded **before** #895 and #899, reported
`snapshot.navigationIntegrity` approximately 57,931.552 ms of attributed
process CPU over 3,471 calls in its steady-state windows. The phase includes
observation creation, queueing, pruning, baseline construction and anomaly
evaluation; not all of this cost belongs to detector candidates.
The same T58 report still saw a 7,398.752 ms worst event-loop stall, with
no causal attribution to Navigation Integrity.

This PR eliminates measurable **algorithmic duplication** in candidate
evaluation; it does not claim to have identified or eliminated the long stall.

## Changes

- The first pass builds only affected cell groups; **normal-only traffic
  returns immediately**, with no extra index allocations.
- If any affected cell exists, a bounded second pass indexes normal context
  only for relevant cells, reused across all candidate groups. Previously
  each connected candidate re-scanned every observation for nearby normal
  aircraft (`O(groups * observations)`).
- Each candidate computes independent-aircraft membership, local/network
  presence, frequency counts, classification severity, low-integrity share
  and min/max timestamps in a single pass rather than repeating several
  filters, any `O(items²)` per-aircraft recount, and two timestamp sorts.
- Canonical NIC/NAC-P/NAC-V medians are computed once per candidate and
  reused in the public response, rules, delta and evidence. No change to
  `median()`, baseline thresholds, cell grouping, candidate ID, anomaly
  hysteresis, persistence, polling interval, external DTO or chronological
  ordering.
- The `summariseCells()` cell aggregation classifies each observation once
  and reuses distinct aircraft sets, eliminating repeated classification
  and set construction. Current medians and lexicographic latest timestamp
  rules are unchanged.
- Malformed timestamps retain the original sort-based behavior rather
  than being silently ignored in the optimized path.

The new intermediate indexes have a strictly request-local lifetime.
No persistent state, retention or extra identity-bearing cache is added.

## Differential validation

`tests/fixtures/navigation-integrity-detector-reference.ts` retains the
pre-optimization detector as a test-only independent oracle.

`tests/navigation-integrity-optimization.test.ts` compares **entire DTOs**
using Vitest deep equality for empty, normal, dense, fractured/adjacent
cells, overlapping source mix, baseline maturity, dominant contributors,
nearby normal aircraft and deterministic pseudo-random workloads. The
reference is not used at runtime and does not change production logic.

`scripts/benchmark-navigation-integrity-candidates.ts` compares
the current detector against the pre-optimization oracle using deterministic
1,200-observation normal-only, dense and fragmented inputs with strict byte-for-byte
serialized output parity. It reports paired CPU and wall-clock medians;
**no performance threshold or speedup claim** is made without executed
measurements. Run off production:

```sh
JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-navigation-integrity-candidates.ts
npm run test:targeted -- tests/navigation-integrity-optimization.test.ts tests/navigation-integrity.test.ts
```

Require exact-commit full Vitest, typecheck/lint, production core/browser
and radar-performance gates plus CodeQL before merge. Do not merge/deploy
as part of this work. Measure the *post-#899* baseline and compare the
subsequent release soak for realistic CPU, RSS, event-loop tail and actual
candidate-group counts. Different aircraft workloads prevent causal
before/after interpretation.
