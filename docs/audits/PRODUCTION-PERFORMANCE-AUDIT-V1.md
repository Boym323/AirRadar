# AirRadar Production Performance Audit V1

Audit branch: `perf/production-performance-audit-v1`  
Baseline commit: `37103895124a93a92f1fad262acff7093a2b70d2` (`origin/main`)  
Served production: v1.0.430 / `9f968359`  
Observation time: 2026-10-11 20:08 CEST (18:08 UTC)  
Database: PostgreSQL 17.10, `airradar` database, read-only inspection

This report records measured evidence only. Missing measurements remain
`NOT MEASURED`; a metric from a different window or process is not used as a
before/after comparison.

## Executive result

One safe code optimization is implemented: history retention candidate
selection no longer sorts expired `FlightPosition` rows by `id`. The sort was
not part of the retention contract and PostgreSQL was doing a parallel index
scan followed by `Gather Merge` before returning a bounded batch.

The production evidence does not justify a PostgreSQL global tuning change,
REINDEX, VACUUM FULL, restart, or route-cache timeout increase. The strongest
measured database hotspot was retention maintenance. Route-cache latency and
errors are real, but the evidence also shows an independent external routeset
HTTP/circuit-breaker problem and application-side bounded concurrency/backoff;
these must not be attributed to PostgreSQL alone.

## Comparable runtime baseline

The existing persisted minute probes were grouped by their recorded timestamp.
The process was running the same served commit during the current observation;
the 24-hour window also contains earlier process lifetimes and is therefore a
historical operational window, not a single-process soak.

| Window | Probe samples | DB P50 | DB P95 | DB P99 | DB max | RSS max | Heap max | Errors/timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Last hour | 60 | 70 ms | 305 ms | 2,099 ms | 2,099 ms | 1.79 GB | 1.52 GB | DB probe failures: 0; SQL timeout count: NOT MEASURED in public probe |
| Last 6 hours | 356 | 53 ms | 333 ms | 1,582 ms | 4,757 ms | 1.96 GB | 1.63 GB | DB probe failures: 0; SQL timeout count: NOT MEASURED in public probe |
| Last 24 hours | 1,440 | 16 ms | 321 ms | 1,075 ms | 7,539 ms | 2.04 GB | 1.69 GB | DB probe failures: 0; SQL timeout count: NOT MEASURED in public probe |

Current process identity was v1.0.430 / `9f968359`, started at
2026-10-11 19:36:36 CEST, with approximately 32 minutes uptime at the end of
the sample. The last-hour and last-6-hour windows include this process plus
the preceding process where applicable; process identity is retained in the
diagnostic endpoint but not in every persisted minute sample.

### Runtime attribution

- Current CPU interval: approximately 80% of one vCPU.
- Current event-loop lag: P50 20 ms, P95 43 ms, P99 1,580 ms.
- Current RSS: approximately 1.18 GB; heap used approximately 0.80 GB.
- GC counters are process-local; the current process reported 7,401 GC events
  and 22.2 seconds cumulative pause time at the snapshot. A pause distribution
  suitable for causal comparison is `NOT MEASURED`.
- Active SSE clients at the sample boundary: 0. SSE instability is therefore
  `NOT MEASURED` by this snapshot, not disproved over 24 hours.
- Separate DB connection wait, application queue wait, lock wait, network
  latency, and external API time are not fully attributable in the public
  runtime probe: `NOT MEASURED` unless stated below.

## Route-cache evidence

The process-local route telemetry covered the preceding 24-hour rolling
counter window. Exact route-cache percentile distributions are only retained
as a bounded recent sample and were not available through the public endpoint;
route P50/P95/P99 for exact 1h/6h/24h windows are therefore `NOT MEASURED`.
The hourly counters are useful for volume and cause separation:

| Window | RAM hits | DB hits | DB misses | DB errors | DB bypasses | DB writes | SQL timing samples | Mean successful SQL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Last hour (hour buckets; not exact wall window) | 1,004 | 0 | 43 | 111 | 398 | 20 | 183 | 1,143 ms |
| Last 6 hours (hour buckets) | 6,375 | 6 | 184 | 556 | 2,493 | 129 | 917 | 994 ms |
| Last 24 hours | 43,985 | 178 | 1,698 | 1,518 | 7,610 | 840 | 3,522 | 473 ms |

An earlier authenticated diagnostics snapshot during the same process
reported route-cache SQL P50 1,501 ms, P95 3,006 ms, P99/max 9,221 ms, 49
PostgreSQL timeouts, 59 concurrency bypasses and 143 backoff bypasses. The
routeset provider was in an active blocked cooldown with no requests in that
snapshot. The exact authenticated window is not persisted as a complete
time-series, so it is evidence of the observed state, not a 24-hour percentile
claim.

Interpretation:

- The route cache is mostly served from RAM; the low DB hit rate is consistent
  with many misses/errors/bypasses rather than proof of a missing index.
- The route SQL uses the primary `cacheKey` index. Read-only `EXPLAIN` showed an
  index scan with a single-row limit.
- The external routeset HTTP/circuit-breaker state is a separate failure
  domain. It is not evidence that PostgreSQL caused the HTTP 403.
- The existing implementation keeps timed-out SQL counted until the underlying
  promise settles; the regression test for that invariant passes.

## PostgreSQL read-only audit

Measured on the configured `airradar` database:

- PostgreSQL 17.10; `pg_stat_statements` is available.
- `max_connections=100`, `shared_buffers=128 MiB`, `work_mem=4 MiB`,
  `track_io_timing=on`, `track_wal_io_timing=off`.
- 13 database backends were visible at the inspection point. Exact ORM pool
  size and queue wait are `NOT MEASURED`.
- No lock waits or deadlocks were visible in `pg_stat_activity` at the sample
  point. This does not exclude intermittent waits.
- `flightPosition` contained about 5.02M live rows, 24.8k dead rows and was
  about 1.4 GiB including indexes. There were about 5,124 rows older than the
  30-day retention cutoff.
- `navigationIntegrityObservation` was about 2.97 GiB and
  `aircraftWeatherObservation` about 1.43 GiB. Their size alone is not proof
  of a hot-path regression.
- Cumulative `xact_rollback` is not used as an application error rate; the
  counter is not windowed and does not identify the failing operation.

The top `pg_stat_statements` entry relevant to the measured latency was the
retention candidate query:

```text
SELECT id FROM "flightPosition"
WHERE "recordedAt" < $1
ORDER BY id ASC LIMIT $2
calls: 3, total: 12,119 ms, mean: 4,039.79 ms, rows: 24,825
```

Its plan used the `recordedAt` index, then a parallel scan and `Gather Merge`
to satisfy the unnecessary `ORDER BY id`. The post-change plan is a bounded
`Index Scan` on `flightPosition_recordedAt_idx_fd5b4732` with no sort. No
production SQL mutation was run.

## ATC dataset cache

The current source preserves the required 5-minute process-local TTL,
single-flight loading, bounded dataset, defensive cloning, import invalidation
and atomic version row. A process-local hit-rate and geometry parse-time
series over 1h/6h/24h is `NOT MEASURED` from the available public snapshot.
The version row has a primary-key lookup and was observed in `pg_stat_user_indexes`
with 95 scans. No freshness-reducing change is made.

## Findings and changes

| ID | Severity | Finding / proven cause | Change | Expected benefit | Risk / verification |
| --- | --- | --- | --- | --- | --- |
| P-01 | High | Retention candidate query sorted expired rows by `id`, producing `Gather Merge`; 3 calls consumed 12.1 s. | Remove the non-contractual `ORDER BY id` while retaining bounded selection and ID-based delete. | Lets the existing `recordedAt` index stop at the batch limit; reduces CPU, sort work and DB tail latency during maintenance. | Low; retention order is not observable. Targeted retention test plus post-deploy `pg_stat_statements`/DB latency comparison. |
| P-02 | High | Route SQL P99/timeouts observed; exact causal split between DB execution, connection wait and app queue is incomplete. | No speculative route rewrite; keep diagnostics and the existing real-inflight slot accounting. | Avoids unsafe change while preserving evidence collection. | Medium operational risk remains; collect authenticated 1h/6h/24h distributions. |
| P-03 | High | Runtime CPU/event-loop and memory pressure are elevated on 1 vCPU/2 GiB host. | No broad runtime refactor without matched attribution. | Prevents unrelated regression. | Requires a controlled soak with process identity, GC and event-loop evidence. |
| P-04 | Medium | Routeset provider was blocked by external HTTP failures. | No PostgreSQL change for the external provider. | Prevents conflating provider failure with DB latency. | Provider access policy remains an external dependency. |

## Validation performed

- `npm run test:targeted -- tests/history-retention-v2.test.ts tests/route-cache-inflight-timeout.test.ts` — PASS, 2 files / 4 tests.
- Read-only PostgreSQL identity, settings, activity, database/table/index
  statistics, `pg_stat_statements`, `pg_stat_io`, and `EXPLAIN` — PASS.
- `git diff --check` — PASS.
- TypeScript — PASS; ESLint — PASS with 14 pre-existing warnings; full Vitest —
  PASS (2,770 passed, 11 skipped); Prisma DB verify — PASS; Prisma RC mapping
  preflight — PASS with compatibility intentionally unverified without a
  catalog; feature registry check — PASS; production core gates — PASS.
- CodeQL and the full PR/browser release workflow are delegated to GitHub CI;
  a live production build or release was not run.

## Production validation plan

After explicit approval and a normal release, compare the same served commit
and process windows at 1h, 6h and 24h:

1. DB minute probes: sample count, P50/P95/P99/max, failed probes and uptime.
2. Route-cache authenticated diagnostics: exact SQL percentiles, timeout,
   query-error, connection-error, concurrency-bypass and backoff-bypass rates.
3. `pg_stat_statements` deltas for retention, route cache, history writes and
   ATC version lookup; include `stats_reset` and database identity.
4. Runtime RSS/heap/GC/event-loop and SSE client/rejection/coalescing counters.
5. Confirm live radar and PP Studio behavior remain unaffected.

No 24-hour post-change result is claimed by this report. Issue #822 should
remain open until the post-release comparison shows sustained improvement.
