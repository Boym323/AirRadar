# AirRadar Production Performance Verification V2

Measurement report for issue #822 and the production effects of PRs #826,
#827, and #829.

## Scope and evidence boundary

- Measurement date: 2026-10-11, CEST; report evidence captured between
  20:34:02 and 20:34:24 CEST (18:34:02–18:34:24 UTC).
- Served release: v1.0.431, commit `cdc907ac` (full release commit supplied in
  the release brief: `cdc907ac8c350a710b48174899b4d9160459ad57`).
- Production process start: 2026-10-11 20:29:13.546 CEST.
- Current repository checkout is newer than the served build; repository
  source was inspected only to verify the implementation. No release or
  production build was run.
- Sources: public `/api/health`, `/api/system/status`,
  `/api/system/integrations`, `/api/system/runtime-performance`, and
  `/api/system/runtime-history`; systemd state/journal; read-only PostgreSQL
  inspection; previous V1 audit.
- PostgreSQL `pg_stat_statements`, WAL, checkpoint, and index counters are
  cumulative. Their `stats_reset` value was recorded and no statistics were
  reset. They are not treated as post-release rates unless a matching time
  delta exists.

## Executive result

The deployment is healthy and the served build is confirmed as v1.0.431. The
retention optimization is present in source and the production database plan
for the no-sort query is the expected bounded scan on
`flightPosition_recordedAt_idx_fd5b4732`. The evidence is not yet sufficient
for a statistically stable before/after speedup claim: the old sample contains
only three calls, and no new production retention run was started for this
audit.

The unresolved bottleneck is route enrichment. At the 20:34 CEST snapshot it
had 10 PostgreSQL timeouts, 63 concurrency bypasses, 9 backoff bypasses, and
42 successful SQL timing samples with P50 9 ms, P95 2,642 ms, P99/max 2,754
ms. This separates slow successful route SQL from timeout/bypass behavior but
does not yet prove whether the tail is database execution, pool wait, or
application scheduling. The external routeset provider was also blocked, so
its failures are a separate domain.

## 1. Production state

| Item | Observed value |
| --- | --- |
| Application | `ok`, production channel |
| Served version / commit | v1.0.431 / `cdc907ac` |
| Build time | 2026-10-11 20:25:24 CEST |
| Process start | 2026-10-11 20:29:13.546 CEST |
| Status sample | 2026-10-11 20:34:02.877 CEST |
| Uptime at status sample | 294.5 s |
| Deployment | systemd stop/start completed; service active/running; no failed unit state |
| Public health | HTTP 200; database/source/application `ok` |
| Receiver | live; 62 aircraft at health sample |
| PostgreSQL | PostgreSQL 17.10; database `airradar`; connected |
| Last Integration Health | 2026-10-11 20:34:08.089 CEST; route provider blocked; DB route timeouts present |
| Last runtime history sample | 2026-10-11 20:33:17.235 CEST |
| Application LXC / DB LXC / Proxmox uptime | NOT MEASURED |

The previous process stopped at 20:29:02 CEST after 43m49s CPU time and 1.3G
peak memory; the new process started at 20:29:13 CEST. The ten-second shutdown
reported several timeout warnings, but systemd marked the stop successful and
the new process became ready.

### Window purity

The persisted minute telemetry had 1,440 samples. Using the deployment start
as the boundary:

| Window ending 20:34:08 CEST | Samples | Before release | After release | Classification |
| --- | ---: | ---: | ---: | --- |
| 1 hour | 60 | 55 | 5 | mixed; not clean post-release |
| 6 hours | 356 | 351 | 5 | mixed; not clean post-release |
| 24 hours | 1,440 | 1,435 | 5 | mixed; not clean post-release |
| Exact post-release persisted minute samples | 5 | 0 | 5 | too short for a release verdict |

## 2. PostgreSQL comparison

The available database-health probe is a once-per-minute runtime telemetry
probe. It recorded no failed samples in any listed window. This is not a
complete SQL error or pool-wait metric.

| Window | Samples | P50 | P95 | P99 | Max | Failed probes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 hour | 60 | 122 ms | 417 ms | 2,099 ms | 2,099 ms | 0 |
| 6 hours | 356 | 61 ms | 336 ms | 1,450 ms | 4,757 ms | 0 |
| 24 hours | 1,440 | 16 ms | 323 ms | 1,085 ms | 7,539 ms | 0 |

Direct read-only PostgreSQL observation at 20:34:23.852 CEST:

- 13 backends, 1 active query; no granted lock wait was visible. Ten sessions
  were idle/`ClientRead`; this is not evidence of pool saturation.
- `max_connections=100`, `shared_buffers=128 MiB`, `work_mem=4 MiB`,
  `track_io_timing=on`, `track_wal_io_timing=off`.
- `flightPosition`: estimated 5,028,163 rows, 812 MiB table, 619 MiB indexes;
  `pg_stat_user_tables` reported 5,019,642 live and 33,223 dead rows.
- Last `flightPosition` autovacuum: 15:59:32 CEST; 34 autovacuum runs.
- Checkpoint/WAL counters are cumulative since 2026-09-06 22:03:35 CEST:
  10,039 timed checkpoints, 41 requested, 98,318,538,461 WAL bytes.
  No interval delta was collected, so WAL/checkpoint rates are NOT MEASURED.
- Disk latency is visible only as cumulative `pg_stat_io`; no host/storage
  time series was available. Proxmox, DB-LXC CPU/RAM pressure, and shared
  storage latency are NOT MEASURED.

## 3. FlightPosition retention

### Implementation and plan

`lib/server/history.ts` now selects expired IDs with only the `recordedAt`
predicate and a bounded limit, then deletes by ID. The retention test confirms
that no candidate `ORDER BY id` is emitted and that deletion remains bounded.

Production index:

```text
flightPosition_recordedAt_idx_fd5b4732 ON public."flightPosition" ("recordedAt")
```

Read-only production plan for the current shape:

```text
Limit
  -> Index Scan using flightPosition_recordedAt_idx_fd5b4732
     Index Cond: ("recordedAt" < now() - '30 days'::interval)
```

No sort, `Gather Merge`, or full candidate ordering is present. The index had
6,795 scans and 47,939,619 tuples read at the observation point.

### Timing evidence

The V1 query remains in `pg_stat_statements` with 3 calls, 12,119.38 ms total,
4,039.79 ms mean, and 24,825 rows. The no-sort query shape appeared with 9
cumulative calls and 1.36 ms total in the current cumulative statistics.
Because the old sample has only three calls, the statistics-reset boundary is
not aligned to deployment, and the current process has not completed a new
retention run, this is evidence of the plan change—not a stable percentage
speedup.

Retention status after restart: `lastRunAt=null`, `rowsDeleted=0`,
`batches=0`, `failureCount=0`. No production retention was started for this
benchmark. Process-local retention regression status is PASS; production
before/after timing is PENDING.

## 4. Route cache

At 20:34:08.089 CEST, process-local diagnostics reported:

| Metric | Value |
| --- | ---: |
| Successful SQL timing samples in last hour | 42 |
| SQL P50 / P95 / P99 / max | 9 / 2,642 / 2,754 / 2,754 ms |
| Route DB hits / misses | 179 / 1,733 |
| Route DB errors | 1,559 |
| Route DB bypasses | 7,788 |
| PostgreSQL timeouts / query failures / connection failures | 10 / 0 / 0 |
| Bypass due to backoff / concurrency / unconfigured | 9 / 63 / 0 |
| RAM route hits, 24-hour persisted counters | 43,985 |
| Valid DB cache entries | 106 |

The successful lookup plan uses the primary `cacheKey` index and a single-row
limit. The ATC version lookup likewise uses its primary-key index. Therefore a
missing route index is not the demonstrated cause. The current code retains
the real in-flight slot until the underlying promise settles; the 750 ms
caller timeout cannot silently free a slot while SQL continues.

The route provider was blocked until 20:16:55.887 CEST and had 55 skipped
blocked requests at the sample. Provider HTTP failures must not be attributed
to PostgreSQL. The remaining causal split—SQL execution versus connection-pool
wait versus application queueing—is NOT MEASURED.

## 5. ATC dataset cache

The implementation uses a process-local five-minute cache, single-flight load,
defensive copies, and a version check on `AtcDatasetVersion.id='atc'`.
Production `pg_stat_statements` showed 178 version SELECTs, 2.50 ms total,
0.01 ms mean, and the primary-key index had 178 scans. This does not show a
significant database burden from the version check.

Cache hit/miss counts, invalidations, dataset load count, geometry transform
distribution, memory consumption, and DB verification failures are NOT
MEASURED in a representative 1h/6h/24h process-local series. Fail-soft and
invalidating code paths are covered by the existing tests.

## 6. Node.js runtime and SSE

The persisted runtime telemetry provides observational values, not a clean
post-release soak:

| Window | RSS P50 / P95 / max | Heap P50 / P95 / max | DB probe P99 / max | SSE max |
| --- | --- | --- | ---: | ---: |
| 1 hour | 1,118 / 1,266 / 1,709 MiB | 630 / 920 / 1,410 MiB | 2,099 / 2,099 ms | 0 |
| 6 hours | 1,419 / 1,795 / 1,868 MiB | 802 / 1,401 / 1,554 MiB | 1,450 / 4,757 ms | 0 |
| 24 hours | 1,442 / 1,890 / 1,941 MiB | 828 / 1,405 / 1,613 MiB | 1,085 / 7,539 ms | 0 |

At a current public status sample the process reported RSS 1,218,232,320
bytes, heap used 1,034,115,064 bytes, cgroup current 1,215,455,232 bytes,
60 aircraft, and zero SSE clients. CPU P50/P95/max, GC frequency/pause
distribution, event-loop P95/P99, SSE payload volume, and DB operations per
minute are NOT MEASURED for a matched post-release window. Zero SSE clients
cannot validate fanout performance.

## 7. Evidence matrix and verdicts

| Area | Baseline | After release | Change | Samples | Confidence | Verdict |
| --- | --- | --- | --- | ---: | --- | --- |
| A. FlightPosition retention | 3 calls; 4,039.79 ms mean; sort + Gather Merge | New bounded `recordedAt` index scan; no new production run | Plan improvement confirmed; timing delta not stable | 3 old / 0 new runs | medium for plan, low for speedup | PASS WITH LIMITATIONS |
| B. Flight history index | V1 index/retention evidence | `recordedAt` index present; 6,795 scans; bounded plan | No missing-index evidence | cumulative | medium | PASS WITH LIMITATIONS |
| C. ATC dataset cache | Prior cache design | 178 PK version reads, 2.50 ms cumulative | No material version-query load shown | 178 DB calls | medium | PASS WITH LIMITATIONS |
| D. Route PostgreSQL cache | V1 P50 5 ms / P95 2,642 ms / P99 2,643 ms, 34 samples | P50 9 / P95 2,642 / P99 2,754 ms, 42 samples; 10 timeouts | Tail and bypass problem persists | 42 SQL timings | medium for symptom, low for cause | FAIL |
| E. PostgreSQL health | V1 1h P95 305 ms, P99 2,099 ms | 1h P95 417 ms, P99 2,099 ms; 0 probe failures | Mixed window; no clean comparison | 60 / 356 / 1,440 | medium | PASS WITH LIMITATIONS |
| F. Runtime CPU/RAM | V1 elevated CPU/RAM | RSS/heap still high; CPU not sampled | No causal post-release comparison | mixed windows | low | PASS WITH LIMITATIONS |
| G. Event loop | V1 P99 about 1,580 ms | matched post-release distribution unavailable | Cannot confirm change | NOT MEASURED | low | NOT MEASURED |
| H. SSE | V1 snapshot had 0 clients | current and historical max 0 | No fanout load exercised | 1,440 history samples | low | NOT MEASURED |

## 8. Conclusions and next steps

1. Keep the retention change. It is low-risk, source-verified, and the
   production EXPLAIN confirms the intended access path. Do not claim a
   percentage improvement until normal scheduled retention produces a larger,
   timestamped post-release sample.
2. Do not change PostgreSQL global settings, restart PostgreSQL, REINDEX,
   VACUUM FULL, or increase route timeouts.
3. The next targeted investigation must instrument route lookup phases with
   separate timestamps for queue wait, connection acquisition, SQL execution,
   and caller timeout. Preserve the current real-inflight accounting.
4. Repeat exact 1h/6h/24h windows only after each window is entirely on one
   served commit and one process lifetime. Capture `stats_reset`, process
   start, route sample count, timeout/error/bypass deltas, and matched
   `pg_stat_statements` deltas.
5. Collect a protected 30-minute runtime soak with CPU, GC, event-loop, SSE,
   and DB-operation counters. A public health endpoint alone cannot answer the
   CPU/event-loop question.
6. Issue #822 remains open. The route SQL timeout mechanism and representative
   post-release retention sample are unresolved.

## Reproducible read-only collection procedure

Run from the production host without changing the service or database:

```bash
curl -fsS https://airradar.pomykal.cz/api/health
curl -fsS https://airradar.pomykal.cz/api/system/status
curl -fsS https://airradar.pomykal.cz/api/system/integrations
curl -fsS https://airradar.pomykal.cz/api/system/runtime-performance
curl -fsS https://airradar.pomykal.cz/api/system/runtime-history
systemctl show airradar.service -p ActiveState -p SubState -p MainPID -p ExecMainStartTimestamp
```

For PostgreSQL, use a read-only transaction or `PGOPTIONS='-c
default_transaction_read_only=on'` and record database identity, server
version, `pg_stat_statements.stats_reset`, the relevant query deltas,
`pg_stat_activity`, `pg_locks`, index definitions, `EXPLAIN (COSTS, SETTINGS,
BUFFERS OFF)`, `pg_stat_user_tables`, `pg_stat_checkpointer`, `pg_stat_wal`, and
`pg_stat_io`. Never reset statistics or run retention solely to obtain a
benchmark sample.
