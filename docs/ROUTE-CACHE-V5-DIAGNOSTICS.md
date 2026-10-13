# AirRadar Route Cache V5 — latency root cause attribution

## Scope and safety

V5.1/V5.2 only add **process-local, bounded, passive telemetry** and an
**operator-run, read-only SQL inspection**. No change to timeout (750 ms),
circuit recovery, cache policy, production config, data, schemas or migrations.
Do not run `EXPLAIN ANALYZE`, new synthetic route lookups or load tests against
the production database for this phase.

## What can be measured from the application

The authenticated `/api/system/status` response includes
`routeEnrichment.phases` and `routeEnrichment.sql`.

- `phases.dbCallSettlement`: **wall elapsed** until the underlying Promise
  settles, **including both successful and failed** calls and calls that
  settle after their caller already timed out. Contains pool wait, network and
  database execution; not SQL server duration. Also includes optional
  maintenance (COUNT/prune) calls.
- V5.6 separates the same DB-call elapsed measurement into
  `phases.dbReadSettlement`, `phases.dbWriteSettlement`, and
  `phases.dbMaintenanceSettlement` (including failures) to distinguish
  foreground reads and writes from optional COUNT/prune maintenance. The
  original aggregate `dbCallSettlement` is retained for continuity. Each is
  bounded and process-local; none measures SQL execution or connection-pool wait.
- The maintenance aggregate is additionally split into
  `phases.dbMaintenanceCount` and `phases.dbMaintenancePrune`. These retain
  the same inclusive settlement scope as the aggregate and distinguish the
  optional valid-entry COUNT from expired-entry pruning without changing either
  operation's cadence or behavior.
- `phases.dbLateSettlement`: wall time **after** the 750 ms caller deadline
  for underlying operations that settle after their caller timed out. This
  does not mean SQL was cancelled by the timeout.
- `phases.callerTimeoutOvershoot`: delay between the expected 750 ms deadline
  and the actual timer callback. A positive value is evidence of scheduling
  delay, **not proof** that CPU, a particular handler or SQL caused it.
- `sql.eventLoopAtTimeout`: bounded sample of Node.js event-loop utilization
  over each timed-out call's wait interval, in **percent**, not milliseconds.
  This is whole-process utilization, not an exclusive per-request CPU cost.
- `sql.connectionFailures` counts synchronous client-creation failures only; asynchronous
  driver connection/pool/network rejections may be recorded as `queryFailures`.
  A zero connectionFailures counter does **not** exclude network/pool faults.
- `sql.timing.serverSideSql` and `sql.timing.connectionAcquisition` remain
  `NOT MEASURED` until independently verified instrumentation is available.
- All distributions are from at most 1,024 **recent process-local**
  observations, **not** percentiles over the entire soak window. Counters may
  reset on restart. Use process/commit segmentation and compare workload mix.

Existing `/api/system/runtime-performance` windows cover event-loop lag and
runtime hot-path timings. The `cpuMs` values in overlapping asynchronous
scopes are **inclusive-process-overlap**, not exclusive CPU; nested scopes
must never be summed as independent CPU consumption.

## V5.8 confirmed contention fix

The production evidence showed maintenance settlement and timeout overshoot
occurring while whole-process event-loop utilization was 100%. The evidence
does not identify COUNT/prune as the synchronous blocker, but it did confirm a
route-cache scheduling defect: maintenance checked that foreground work was
idle only when it started, then foreground reads could enter while COUNT or
prune was still active. That allowed optional housekeeping to contend with
foreground route lookups.

The V5.8 fix adds a process-local maintenance barrier. COUNT/prune still run
with their existing cadence and fail-soft behavior, but foreground reads and
writes are bypassed while maintenance is active; maintenance is also refused
when foreground work is already active. This preserves the live path and
avoids changing the timeout, pool size, or route-cache concurrency limits.
The regression test verifies that a pending maintenance query cannot overlap a
new foreground read.

## Operator read-only PostgreSQL evidence

From a trusted host with an existing **least-privileged read-only**
PostgreSQL connection (do not paste a DATABASE_URL or secrets into logs):

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/route-cache-v5-readonly.sql > route-cache-v5-db-report.txt
```

This reports grouped `pg_stat_activity` wait states, global database
statistics, cache table activity/size, index metadata and a **planner-only**
EXPLAIN. It neither executes cache lookups nor runs migration/DDL.

Notes:
- `pg_stat_activity` is a single snapshot, so repeat a small number of
  snapshots during natural load to distinguish transient from persistent
  waits. Do not collect raw `query`, client address, PID or parameters.
- `pg_stat_database` and table counters may span many hours; compare deltas
  with their `stats_reset` markers. They are not isolated to route cache.
- `blk_read_time`/`blk_write_time` require server-side
  `track_io_timing`; zero does not necessarily mean zero I/O.
- Index presence and planner estimate do not establish actual query latency.
  Do not attribute end-to-end time exclusively to PostgreSQL without
  additional independent evidence.

## Interpreting the 12-hour soak

1. Pin production identity and PID; use process/commit segments.
2. Compare minute-level event-loop p99 and CPU with the **same timestamped**
   cache timeout and settlement windows; avoid inference from cumulative
   process totals.
3. A large `callerTimeoutOvershoot` *with high whole-process ELU* suggests
   investigating JS scheduling and synchronous hot paths. Low overshoot but
   slow settlement suggests investigating pool/network/DB.
4. Inspect transaction and autocommit DB lanes already present in runtime
   diagnostics to understand competing work.
5. If persistent database waits are suspected, collect `pg_stat_activity`
   safely. Plan targeted changes and a short 1–2h production soak only after
   the evidence identifies a concrete bottleneck.

A V5 PR must pass Vitest, TypeScript, lint, and release/production gates.
Do not merge or deploy diagnostic changes as part of an observation-only task.
