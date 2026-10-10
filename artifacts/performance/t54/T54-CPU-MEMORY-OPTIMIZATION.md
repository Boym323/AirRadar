# T5.4 CPU & Memory Runtime Optimization

**Status: diagnostic implementation complete; production optimization deferred pending an attributable CPU profile.**

Observation date: 2026-10-09, Europe/Prague. No production release, restart,
migration, configuration change, or production write was performed.

## Executive result

T5.3 established high and oscillating Node RSS/heap, but did not identify a
retaining structure or CPU hot path. T5.4 therefore implements the missing
low-overhead measurements and corrects the Navigation Integrity accounting
without changing persistence. No speculative cache, ORM, trail, or live-state
optimization was applied.

## Implemented diagnostics

- `runtime-health-observation.ts` is now started once from the Node
  instrumentation bootstrap. It remains idempotent and can be disabled with
  `AIRRADAR_RUNTIME_HEALTH_OBSERVATION=false`.
- The authenticated, rate-limited `/api/system/runtime-performance` endpoint
  now exposes bounded process-local CPU user/system time (cumulative and last
  sample interval), RSS, heap used/total, external memory, array buffers,
  event-loop delay p50/p95/p99, GC count, retained GC sample count, total GC
  pause, maximum pause, and average pause.
- The endpoint also returns at most 12 aggregate runtime hot paths without raw
  samples. Public callers still receive no internal counters.
- Navigation Integrity now separates `persisted`, exact process-local ORM
  `ormAttempts`, and `ormSuccesses`. The existing upsert, memo, queue, and
  retry semantics are unchanged.

## Production read-only audit

The 30-minute authenticated sampler output is stored at
`T54-PRODUCTION-RUNTIME-AUDIT.json` in this directory. It sampled every 30 s
using the existing production session and retained only bounded diagnostics.
The process and commit stayed stable. There were 60 samples and one
temporarily unavailable sample over 1,928.5 s (32.14 min wall span).

The deployed production endpoint predates this change, so aircraft/SSE fields
were not projected into the sampler rows and CPU/GC fields were unavailable.
That limitation is itself the reason for this change; it prevents inventing a
correlation from an absent signal.

| Metric | Minimum | Maximum | First → last |
|---|---:|---:|---:|
| RSS | 1.529 GB | 1.600 GB | 1.529 → 1.588 GB |
| heap used | 698 MB | 1.268 GB | 983 → 940 MB |
| event-loop p95 / GC | unavailable | unavailable | unavailable |
| aircraft / SSE / listeners | unavailable | unavailable | unavailable |

Observed cumulative deltas were 10,695 observations, 6,278 attributed
`navigation.observation.create` attempts, 6,282 `persisted` successes, four
memo-avoided writes, and zero DB failures. Rates over the actual span were
332.9 observations/min and 195.6 ORM attempts/min. The `+4` discrepancy is
not four extra ORM operations: the sampler fetched the navigation diagnostic
and the system-status DB lane concurrently, so the two cumulative snapshots
were read at different instants. The new exact `ormAttempts/ormSuccesses`
counters remove this race for future windows.

Available correlations from the deployed fields were RSS vs DB attempts
`r=-0.131` and RSS vs observations `r=-0.126`; heap vs DB attempts was
`r=-0.775`. These do not prove causation, and aircraft/SSE correlation could
not be calculated from this pre-change projection.

An independent 30-second `pidstat` sample observed:

| Metric | Result |
|---|---:|
| Node CPU, average (independent 30 s sample) | 55.83% |
| CPU user/system | 54.70% / 1.13% |
| RSS, average sample | ~1.486 GB |
| major page faults | 0 |
| disk read/write | ~2.18 / 13.93 kB/s |

`perf` was unavailable on the host, so no production call-stack profile was
collected. A DEV `--cpu-prof` run over the existing synthetic benchmark found
`altitude-provenance`, `source-merge`, public aircraft fingerprinting, and GC
among the sampled hot functions. This is not treated as production proof.

## Hot-path decision

The available process-local DB diagnostics (captured at the end of the audit)
ranked these operational lanes by cumulative wall time: `history.snapshot`
(2,267,846 ms / 4,925 transactions),
`flight-intelligence.aircraft-link.query` (419,920 ms / 554 queries), and
`weather.observation.batch-insert` (288,051 ms / 429 batches). These are not
CPU attribution, and changing them without a paired CPU/GC profile would be
speculative. The existing runtime benchmark also shows source-merge and SSE
serialization scale with aircraft/client count, but does not establish that
either causes the production RSS oscillation.

Consequently, no first runtime hot-path optimization is claimed in this PR.
The next safe step is to deploy the diagnostic change through the standard
release pipeline, collect a matched window with the new CPU/GC/hot-path fields,
then optimize only the top attributable operation.

## Benchmark and validation

The existing DEV runtime benchmark completed successfully. Its report-only
results included detail-lookup `beforeMs → afterMs` comparisons and fanout/SSE
scenarios at 100, 1,000, and 5,000 aircraft; those comparisons are existing
benchmark coverage, not a claimed T5.4 production optimization.

| DEV detail lookup fixture | Existing before | Existing after |
|---:|---:|---:|
| 100 aircraft × 20 | 52.54 ms | 0.66 ms |
| 1,000 aircraft × 20 | 158.16 ms | 0.15 ms |
| 5,000 aircraft × 20 | 497.26 ms | 0.06 ms |

There is no valid T5.4 before/after optimization delta yet: production was
not redeployed, and the audit did not prove a safe bottleneck to change.

Validation completed:

- `npm test`: 447 files passed, 3 skipped; 2,563 tests passed, 10 skipped.
- `npm run typecheck:prepared`: PASS.
- `npm run lint`: PASS with 16 pre-existing warnings, 0 errors.
- `npm run features:check`: PASS.
- `npm run docs:check`: PASS.
- CodeQL: unavailable in this checkout/host; no CodeQL result is claimed.
- No Navigation Integrity, ADS-B, SSE, or API persistence contract was
  changed. No release or browser gate was run because production deployment
  was not requested.

## PR / release

No remote PR was created and no production release was run. The working-tree
change is ready for review as a separate diagnostic/accounting PR. A production
deployment must use `deploy/release.sh` after review and the required release
gates.
