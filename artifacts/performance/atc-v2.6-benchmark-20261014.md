# ATC Performance V2.6 benchmark

Date: 2026-10-14
Commit: `d23602e860b2e6036c4d25345070632b6e96e8ec`

## Dataset export

The production export was performed once in a separate PostgreSQL connection
using the existing `airradar` account. The connection used
`default_transaction_read_only=on`; the export transaction was
`REPEATABLE READ READ ONLY` with a 15 s statement timeout and a 2 s lock
timeout. The confirmation query returned `transaction_read_only=on` and
`transaction_isolation=repeatable read`. No write, migration, restart, or
second production connection was used.

- Export time: `2026-10-14T10:19:28.737Z`
- Database dataset version: `c3ce6708-d241-4482-b785-de1a1fbdefb4`
- Sectors: 114
- Polygons/rings: 133
- Vertices: 478,815
- Schema: ATC import schema v1
- Snapshot SHA-256: `5cb8ade2958d9d2df2924f6a6b183445940d68673a677c0b9781127eb1a910b3`
- Snapshot location: `/var/lib/airradar/atc-benchmark/atc-schema-v1-20261014T121800Z.json`, mode `0600`

The snapshot is not committed and is not included in this report.

## Offline benchmark

The benchmark ran in three independent Node processes with
`ATC_BENCHMARK_DATASET_FILE`, `DATABASE_URL=""`, 3,637 lookups, the exported
geometry, and both ATC feature flags set to `false`. This is an offline
dataset benchmark, not a PostgreSQL or ORM benchmark. The lookup workload is
synthetic vertex-offset replay, not a production flight replay.

| Metric | Run 1 | Run 2 | Run 3 | Range |
|---|---:|---:|---:|---:|
| Legacy preparation wall time (ms) | 315.868 | 341.180 | 309.672 | 309.672–341.180 |
| Assignment preparation wall time (ms) | 26.074 | 24.725 | 24.311 | 24.311–26.074 |
| Context preparation wall time (ms) | 24.641 | 21.276 | 23.534 | 21.276–24.641 |
| Assignment event-loop P95/P99/max (ms) | 13.656/13.656/13.656 | 13.394/13.394/13.394 | 12.059/12.059/12.059 | — |
| Context scheduler-sensitive max turn (ms) | 15.053 | 13.823 | 14.381 | 13.823–15.053 |
| Context event-loop P95/P99/max (ms) | 0.001/0.001/0 | 0.001/0.001/0 | 0.001/0.001/0 | — |
| Identity hashing wall time (ms) | 188.407 | 194.707 | 188.693 | 188.407–194.707 |
| Immutable freezing max stage (ms) | 63.390 | 64.197 | 63.453 | 63.390–64.197 |
| JSON.parse of 13.99 MB snapshot (ms) | 146.426 | 164.826 | 126.541 | 126.541–164.826 |
| Lookup P50/P95/P99 (ms) | 0.986/1.501/1.651 | 0.730/1.397/1.561 | 0.977/1.520/1.669 | — |
| Lookup max (ms) | 6.265 | 4.956 | 5.460 | 4.956–6.265 |
| Polygon test count | 42,186 | 42,186 | 42,186 | stable |
| CPU user + sys (s) | 5.31 + 0.35 | 5.04 + 0.31 | 5.10 + 0.32 | — |
| Peak RSS (MiB) | 412.91 | 413.46 | 416.38 | 412.91–416.38 |

GC was available with `--expose-gc`; the trace run produced no V8 GC event
lines during the measured process. The benchmark's explicit runtime
diagnostics recorded the stage-level freeze and identity timings above.

## Assessment

PASS. The post-change scheduler-sensitive preparation block stayed within the
10–20 ms target (13.823–15.053 ms for the full context path; 12.059–13.656 ms
for assignment preparation), versus the historical approximately 460 ms
synchronous preparation. Lookup latency and polygon-test count remained
stable across all three runs. The report is intentionally limited to summary
metrics and contains no raw geometry.
