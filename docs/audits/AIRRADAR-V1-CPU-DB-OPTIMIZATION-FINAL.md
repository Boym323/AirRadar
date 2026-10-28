# AirRadar V1 — CPU and PostgreSQL optimization final report

Date: 2026-10-28  
Scope: AirRadar V1 only. AirRadarV2 was not changed.  
Verdict: **PASS_WITH_LIMITATIONS**  
CPU: **INSUFFICIENT_EVIDENCE**  
DB: **NO_CHANGE_JUSTIFIED**

## Executive result

The current production implementation is healthy and the ReceiverCoverageHourly
optimization from PR #1129 is active. Its isolated PostgreSQL 17 A/B test proves
substantially fewer round-trips and lower flush latency with result parity, but
does not prove lower CPU for the complete production server. No additional
production-code optimization is justified by the current evidence. No schema,
index, sampling, retention, V8 limit, data contract, deployment setting, or
production feature flag was changed during this audit.

## Versions, identity and production safety

| Item | Evidence |
|---|---|
| GitHub `main` audited | `11647e8411b0d6b1e834f270c63c0863c7f02a07` |
| Deployed commit | `f17a19f635f0cec38e03a7bff786e7cdf24a3197` |
| Deployed release | `1.0.565`, build `2026-10-28T13:25:05Z` |
| Process start | `2026-10-28T13:28:12.500Z` |
| Process identity | stable PID/store identity during authorized sample |
| Native acceleration | Rust BEAST parser and Rust CRC active |
| Coverage flag | not explicitly present in deployed `.env`; application default is atomic `true` |
| Health | `/api/health` OK; database, receiver and readsb OK; SSE endpoint contract smoke remained unchanged |

All production reads were read-only. No forced GC, profiler, SQL reset,
`EXPLAIN ANALYZE`, synthetic traffic, restart, ingest toggle, or configuration
change was used.

## Production CPU baseline

The authorized admin-mode T57 runtime endpoint was used; token-free T58 was not
treated as an equivalent. The current process reported:

| Metric | Observation |
|---|---:|
| Process CPU interval | 13.84% of one logical core at sample time |
| RSS / heap used | 740.5 / 384.7 MiB |
| Event loop P50/P95/P99 | 20.087 / 20.922 / 38.666 ms |
| GC count / cumulative pause | 30,816 / 63,610.9 ms since process start |
| GC max / average pause | 14.86 / 2.77 ms |
| Active SSE clients | 0 at sample time |
| Event-loop stall evidence | disabled; no recorded >1 s stall |

The stable public T58 run [#40682255974](https://github.com/Boym323/AirRadar/actions/runs/40682255974)
collected 61/61 samples over 3,601.6 seconds and one stable process segment,
but public mode did not expose private hot-path attribution, GC, retention, or
SQL wait. It therefore confirms continuity, not a whole-process optimization.

The authorized cumulative path attribution is inclusive and overlapping:

| Path | Calls | CPU ms | Wait ms | Interpretation |
|---|---:|---:|---:|---|
| `ingest.local-beast` | 367,521 | 137,776 | 0 | highest direct CPU candidate; Rust path is active |
| `snapshot.network` | 9,113 | 83,319 | 0 | second large candidate, includes nested network ingest work |
| `history.persist` | 3,310 | 79,605 | 3,563 | DB/application work; overlaps `history.transaction` |
| `network.metadata` | 3,297 | 31,585 | 46,919 | predominantly wait, not a CPU hotspot |
| `snapshot.trail-update` | 10,883,641 | 46,785 | 0 | high call count, very small per-call cost |

These numbers identify measurement candidates, not exclusive CPU shares. No
candidate was changed because a controlled candidate/baseline production A/B
with matched load was not available.

## PostgreSQL baseline

Read-only statistics were collected from PostgreSQL 17.10. `pg_stat_statements`
was already installed; no extension or statistics reset was performed.

| Metric | Result |
|---|---:|
| Database connections | 5 during the 66.65 s delta |
| Transactions/s | 3.69; rollbacks/s 0 |
| Inserts/s / updates/s / deletes/s | 4.82 / 5.34 / 0 |
| WAL bytes/s / records/s | 56,367 / 61.1 |
| WAL syncs/s | 3.08 |
| Cumulative buffer-cache hit ratio | 96.976% |
| Deadlocks | 0 |
| Long transaction/lock wait | none observed; sessions were idle on `ClientRead` |
| PostgreSQL host CPU | **not available** from the application host |

The highest cumulative `pg_stat_statements` groups were
`navigationIntegrityObservation` (4.54M calls, 745.8 s execution),
`flightPosition` (3.28M calls, 291.0 s), and `receiverDailyStats` (23,441
calls, 245.7 s). These are frequency-weighted production candidates, but the
available evidence does not isolate a safe change with a measured whole-system
benefit. The short DB window is not a before/after claim.

## ReceiverCoverageHourly / PR #1129

Production status showed atomic coverage batching active by default:

- 84/84 flushes committed, 0 failures;
- 17,029 rows considered, 879 inserted and 16,150 updated;
- average 202.7 rows per flush, last flush 11 ms;
- transaction duration 3,056 ms cumulatively, max 214 ms;
- no failure-family, rollback, or deadlock evidence;
- durable counters and provider union are returned and cached only after commit;
- atomic path uses a shared transaction advisory lock; ORM fallback uses the
  matching exclusive lock and rereads durable rows under the lock;
- mixed atomic/fallback and concurrent fallback parity are covered by real
  PostgreSQL integration tests.

The merged [PR #1129](https://github.com/Boym323/AirRadar/pull/1129) and its
[PostgreSQL validation run #40694966340](https://github.com/Boym323/AirRadar/actions/runs/40694966340)
passed unit, atomic integration, locked ORM integration, parity, rollback and
the corrected A/B benchmark. The current workflow was rerun on `main` as
[#40724374938](https://github.com/Boym323/AirRadar/actions/runs/40724374938)
against the latest implementation and passed. Its JSON artifact is available
as [receiver-coverage-hourly-ab-pr1129-verified.json](https://github.com/Boym323/AirRadar/actions/runs/40724374938/artifacts/12827282283).

### Isolated A/B result

The disposable PostgreSQL 17 database used identical data at 50, 250, 1,000
and 5,000 buckets. Atomic and fallback outputs matched in counts and provider
sets. The current lock-aware benchmark reports four atomic round-trips and
`2,003` / `10,003` fallback round-trips at 1,000 / 5,000 buckets.

| Buckets | Fallback P50 | Atomic P50 | Fallback / atomic round-trips | WAL P50 | Parity |
|---:|---:|---:|---:|---:|:---:|
| 50 | 37.234 ms | 2.569 ms | 103 / 4 | 8,312 / 8,312 B | PASS |
| 250 | 145.641 ms | 6.398 ms | 503 / 4 | 105,464 / 105,464 B | PASS |
| 1,000 | 517.204 ms | 23.817 ms | 2,003 / 4 | 435,528 / 435,528 B | PASS |
| 5,000 | 2,537.966 ms | 110.339 ms | 10,003 / 4 | 2,145,496 / 2,145,496 B | PASS |

Backend PostgreSQL CPU was unavailable in Actions because the service PID was
in a separate namespace. The benchmark therefore proves per-flush latency and
round-trip improvement, not production PostgreSQL CPU reduction or whole-app
throughput improvement.

## Root-cause ranking and decisions

CPU candidates, with overlap caveat: (1) Rust BEAST ingest volume, (2) network
snapshot processing. Both are intentional high-volume paths and Rust/native
acceleration is already active. No safe algorithmic change was demonstrated.

Database candidates: (1) high-frequency navigation integrity observation
inserts, (2) high-frequency FlightPosition inserts. They are intentional
durable paths; no schema/index or sampling change is allowed without a new
matched production proof. ReceiverCoverageHourly was already addressed by
PR #1129 and is not a justified second optimization target.

## Before/after and parity

There was no new candidate deployment, so whole-production before/after deltas
are **not applicable**. The defensible comparison is:

| Area | Result |
|---|---|
| CPU | INSUFFICIENT_EVIDENCE; no whole-process A/B |
| PostgreSQL CPU | INSUFFICIENT_EVIDENCE; remote host CPU inaccessible |
| Receiver flush latency | IMPROVED in isolated A/B only |
| WAL | NO_CHANGE_JUSTIFIED in matched isolated workload |
| Event loop / RAM | no candidate change; no regression claim |
| Functional parity | PASS for atomic/fallback integration and benchmark digests |

## Validation, deployment and rollback

- Targeted diagnostics/coverage tests: 28 passed, 5 skipped.
- Full Vitest: 297 files passed, 5 skipped; 1,991 tests passed, 20 skipped.
- TypeScript typecheck: passed.
- ESLint: 0 errors, 4 pre-existing warnings.
- PostgreSQL 17 atomic/fallback integration and lock-aware A/B benchmark:
  passed in [workflow #40724374938](https://github.com/Boym323/AirRadar/actions/runs/40724374938).
- CI and CodeQL: passed on the merged implementation commit
  [CI #40696132199](https://github.com/Boym323/AirRadar/actions/runs/40696132199)
  and [CodeQL #40696132276](https://github.com/Boym323/AirRadar/actions/runs/40696132276).
- Deployment: PR #1129 is merged and deployed as `f17a19f`; no additional
  deployment was performed for this audit.
- Rollback: standard code rollback/redeploy of the implementation commit;
  no schema rollback is required.

## Limitations and unsuccessful experiments

The public T58 run cannot provide admin hot paths. The current DB server is a
separate host, so PostgreSQL process CPU and cgroup counters cannot be read
from this application host. `pg_stat_statements` is cumulative since its last
reset and was intentionally not reset. Async attribution is inclusive and
overlaps nested paths. No production A/B of atomic versus fallback was done;
changing the live flag solely for benchmarking would violate the safety gate.
No speculative CPU optimization was introduced. The earlier single-path or
pre-lock benchmark numbers are retained as historical evidence only.

## Final decision

**PASS_WITH_LIMITATIONS.** Production identity, health, Rust acceleration,
atomic coverage mode, functional parity, and safe observations are verified.
PR #1129 is an objectively successful isolated write-path optimization, but no
whole-production CPU or PostgreSQL CPU improvement is claimed. The next valid
optimization requires a matched admin-mode production baseline and candidate
measurement, including access to PostgreSQL host CPU metrics.

Related evidence: [T58 identity report](AIRRADAR-V1-T58-IDENTITY-RELIABILITY-2026-10-28.md),
[CPU response audit](AIRRADAR-V1-CPU-RESPONSE-AUDIT-2026-10-28.md), and
[PR #1129 benchmark report](../../artifacts/performance/2026-10-28-v1-postgres-write-optimization.md).
