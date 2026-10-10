# AirRadar T5.5 Production Runtime Results

**Decision: PASS WITH LIMITATIONS**

The production measurement is valid and complete. It did not prove a safe CPU
optimization target, so no speculative runtime optimization was implemented.
The only code change was the prerequisite observability fix described below.

## Deployment and validity

- Production version: `1.0.392`
- Production SHA: `5559e1f7` (merge of PR [#687](https://github.com/Boym323/AirRadar/pull/687))
- Build time: `2026-10-10T05:24:03Z`
- Audit window: `2026-10-10T05:30:44.664Z` – `2026-10-10T06:00:46.599Z` UTC
  (`07:30:44` – `08:00:46` Europe/Prague)
- Configured duration / interval: 1,800 s / 30 s
- Samples: 61; unavailable samples: 0
- Elapsed sample span: 1,801.935 s
- Process and commit stability: PASS; one PID and one diagnostics store for all samples
- Collection: authenticated, read-only `/api/system/status` and
  `/api/system/runtime-performance`; no restart, database write, inspector, or
  heap snapshot was used
- Post-audit verification: `/api/health` returned `status=ok`, database `ok`,
  local BEAST/JSON ADS-B source `ok`, and 54 aircraft; systemd remained active

The anonymized raw projections are in
[`T55-PRODUCTION-RUNTIME-AUDIT.json`](T55-PRODUCTION-RUNTIME-AUDIT.json).
The JSON contains aggregate runtime values only; credentials, cookies, raw
provider responses, and aircraft identifiers are not stored.

## CPU

| Metric | Min | P50 | P95 | Max | Mean |
|---|---:|---:|---:|---:|---:|
| CPU interval (% of one configured CPU) | 33.302% | 48.857% | 62.699% | 66.474% | 49.036% |

Cumulative process CPU deltas were 865,242.103 ms user and 16,516.261 ms
system over the window: approximately 48.015% user and 0.917% system of wall
time, or 48.934% of one CPU in total. This is process CPU time, not an
attribution to any one operation.

CPU versus observed load correlations:

- aircraft count: `r=0.067`
- SSE clients: unavailable (`0` throughout)
- GC pause rate: `r=-0.094`
- database navigation attempts/sec: `r=-0.181`

These are observational correlations and do not establish causality. No
production CPU-heavy operation is proven by this window.

## Memory and GC

| Metric | Min | P50 | P95 | Max | Mean |
|---|---:|---:|---:|---:|---:|
| RSS | 671.387 MiB | 1,502.648 MiB | 1,600.031 MiB | 1,635.137 MiB | 1,417.983 MiB |
| Heap used | 381.646 MiB | 890.445 MiB | 1,262.292 MiB | 1,290.184 MiB | 895.565 MiB |
| External | 4.648 MiB | 6.485 MiB | 11.854 MiB | 17.835 MiB | 6.969 MiB |
| Array buffers | 0.889 MiB | 2.648 MiB | 8.088 MiB | 14.076 MiB | 3.183 MiB |

RSS rose from 671.387 MiB to 1,635.137 MiB and heap used from 505.471 MiB to
1,263.427 MiB. Network trail points rose from 2,890 to 59,330 while local
trail points rose from 507 to 5,730. This is a significant retention/churn
signal, but it is not proof of a memory leak: the runtime invariant explicitly
retains server trails while aircraft remain live, and the audit has no
post-GC heap baseline or object-retainer attribution.

GC recorded 8,285 events (4.60 events/sec) and 24,329.884 ms cumulative pause,
equal to 1.35% of wall time. Per-sample maximum GC pause was 2.848–39.230 ms
(P50 4.877 ms, P95 30.078 ms). GC frequency is high, but the low total pause
fraction and `heap vs GC pause rate r=0.072` do not identify a safe optimization.

## Event loop

The endpoint reports cumulative histogram percentiles. The following are
window statistics over those reported values, not independent raw event-loop
samples:

| Reported histogram | Min | P50 | P95 | P99 | Max |
|---|---:|---:|---:|---:|---:|
| p50 lag | 20.087 ms | 20.087 ms | 20.087 ms | 20.087 ms | 20.087 ms |
| p95 lag | 21.774 ms | 22.053 ms | 23.724 ms | 28.279 ms | 28.279 ms |
| p99 lag | 217.317 ms | 517.210 ms | 665.846 ms | 669.516 ms | 669.516 ms |

The p99 signal is materially elevated, but it is cumulative and cannot by
itself prove sustained Node event-loop blocking or a CPU cause. CPU correlation
with aircraft and GC was weak; SSE had no active clients during the window.

## Runtime hot paths

The following are the top measured deltas by instrumented wall time:

| Path | Delta wall time | Calls | Paired intervals |
|---|---:|---:|---:|
| `history.persist` | 397,580.352 ms | 516 | 60 |
| `history.transaction` | 397,549.884 ms | 516 | 60 |
| `network.metadata` | 380,503.817 ms | 516 | 60 |
| `atc.resolve` | 325,175.433 ms | 516 | 60 |
| `snapshot.apply.total` | 243,528.477 ms | 516 | 60 |
| `snapshot.local` | 243,527.399 ms | 516 | 60 |
| `snapshot.operationalTwin` | 212,619.802 ms | 477 | 56 |
| `snapshot.network` | 49,390.281 ms | 1,328 | 60 |
| `snapshot.intelligence` | 23,386.635 ms | 516 | 60 |
| `snapshot.navigationIntegrity` | 13,730.302 ms | 1,844 | 60 |
| `snapshot.trackFusion` | 6,721.468 ms | 1,844 | 60 |
| `snapshot.predictive` | 457.334 ms | 516 | 60 |

These values are asynchronous wall time and include waiting for I/O. They are
not CPU time and must not be used to claim that history, metadata, ATC, source
merging, normalization, SSE serialization, or enrichment is a CPU bottleneck.
SSE serialization was low in this window but had no connected clients.

## DEV CPU profile

Because production telemetry cannot attribute CPU to call stacks, a bounded
DEV profile was run against the existing synthetic live benchmark at 100,
1,000, and 5,000 aircraft with local/extended fanout and SSE scenarios. The
profile contained 2,268 samples across 4,187 nodes. The largest sampled
functions included:

- garbage collector: 168 samples
- `selectAltitudeObservation`: 84
- `mergeAircraftMaps`: 64
- altitude-provenance observation: 62
- `messageAgeMs` / source merge: 44 plus 37 plus 37
- `mergeAircraftObservations`: 32
- track-fusion estimation: 24
- `publicAircraftFingerprint`: 22

This is useful direction for a future matched benchmark, not proof of a
production hotspot. No before/after performance optimization benchmark exists
for T5.5.

## Root cause and limitations

The initial production audit failed closed because the endpoint returned
`schemaVersion: 2` but `runtime.status=disabled`; CPU values were present while
GC and event-loop values were absent. PR #687 fixed the actual cause: Next
standalone instrumentation and the route can be evaluated in separate module
bundles, so module-local observer state was not shared. The observer state is
now stored in a process-global singleton, with a regression test for separate
module evaluations. CI and CodeQL passed, and production was deployed by the
standard artifact/release pipeline as version `1.0.392`.

Remaining limitations:

- wall-time hot paths are not CPU attribution;
- cumulative event-loop histogram percentiles are not window percentiles;
- correlations are observational;
- the sample had zero SSE clients, so SSE serialization under client fanout is
  not represented;
- memory retention was measured but no heap-space or object-retainer breakdown
  was collected;
- no production heap snapshot or Node Inspector was used;
- no ADS-B payloads or per-aircraft identity data were persisted in the audit.

## Tests, CI, and PRs

- Targeted Vitest including T5.5 and observer regression: PASS, 7 tests.
- Runtime route/instrumentation/T5.5 targeted suite: PASS, 9 tests.
- `npm run typecheck`: PASS.
- Changed-file ESLint: PASS.
- Main CI run `38027358833`: PASS, including full typecheck/Vitest, production
  build, browser gate, and radar performance baseline.
- CodeQL push run `38027358801`: PASS.
- PR [#687](https://github.com/Boym323/AirRadar/pull/687): merged; production
  deploy completed successfully.
- No performance optimization PR was created because no attributable,
  low-risk bottleneck was proven.

## Next development stage

1. Add bounded V8 heap-space totals and post-GC baseline samples to the
   authenticated diagnostics, while retaining the current privacy projection.
2. Separate local and network trail-point retention in a matched DEV/production
   comparison; investigate retention only if the post-GC baseline continues to
   grow at fixed aircraft/trail load.
3. Add a production-like DEV replay/profile for source merge, normalization,
   altitude provenance, and track fusion, then compare CPU profiles before any
   optimization.
4. Repeat a matched audit with controlled SSE clients before evaluating SSE
   serialization or fanout.

No speculative production optimization is recommended from this dataset.
