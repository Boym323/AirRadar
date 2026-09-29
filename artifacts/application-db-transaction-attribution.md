# Application DB transaction attribution

## Result

The long attribution completed uninterrupted for 30m14s on process `48621` and
diagnostics store `dbtx-mumugx0c-gzmu25ul`.

## Window

- Start: `2026-09-29 17:55:59 CEST`
- End: `2026-09-29 18:26:13 CEST`
- Version/SHA: `1.0.217 / 4b0205d0`
- PostgreSQL: 15,178 commits (501.9/min), 189 rollbacks (6.2/min), 15,367
  transactions (508.2/min)
- Deadlocks: 0; external DB clients: 0; application connections: 11 (1 active,
  10 idle)
- `pg_stat_statements`: unavailable

## Explicit transaction lanes

| Lane | Attempts | Commits | Failures | Rate/min |
|---|---:|---:|---:|---:|
| history.snapshot | 5,547 | 5,547 | 0 | 183.5 |
| receiver.daily-stats | 58 | 58 | 0 | 1.9 |
| receiver.coverage | 15 | 15 | 0 | 0.5 |
| receiver.advanced-stats | 58 | 58 | 0 | 1.9 |
| all explicit lanes | 5,678 | 5,678 | 0 | 187.8 |

The explicit registry explains 36.9% of PostgreSQL transactions. All
instrumented attempts committed successfully.

## Autocommit/write evidence

`pg_stat_user_tables` deltas measured: `flightPosition` 172.6 inserts/min,
`receiverCoverageHourly` 9.9 inserts/min, `aircraftWeatherObservation` 84.5
inserts/min, `navigationIntegrityObservation` 139.9 inserts/min,
`navigationIntegrityAnomaly` 11.8 inserts/min, and `flight` 4.2 inserts/min.

Autocommit reads were not separately measurable because `pg_stat_statements` is
unavailable and `pg_stat_database` does not classify read transactions.

## Decision

- Explained: **36.9%**
- Unexplained: **63.1%**
- Target: **≥95%**
- Exact unexplained class: autocommit reads and autocommit writes outside the
  explicit-lane registry; no external clients were observed.
- Next optimization: **none selected**. The target was not met, so no batching
  or read-optimization candidate is justified by this run.

No application code, schema, migration, persistence semantics, deployment, or
restart occurred during the measurement.
