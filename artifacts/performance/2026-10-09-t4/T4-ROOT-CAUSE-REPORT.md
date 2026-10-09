# T4 production root-cause report

## Executive result

T4 confirms two production symptoms but not their final internal causes:

1. Health is variable on the direct backend path: p95 2.215 s, p99 2.654 s,
   maximum 2.995 s across 30 requests. Public HTTPS was faster (p95 0.392 s),
   so reverse-proxy overhead is not supported as the dominant cause.
2. PostgreSQL recorded 4383 rollbacks in 15.0347 minutes (291.53/min; 29.42%
   of transactions), with zero deadlocks and zero lock waits at both snapshots.
   The responsible operation/lane is not proven.

The deployed process was stable (PID 236403, zero restarts), ADS-B ingest and
public database health were OK, and both T4 prerequisite PRs were deployed.

## Health API

`app/api/health/route.ts` measures `health.total`, `health.ready`,
`health.snapshot`, `health.database`, and `health.atc`. Those stores are
process-local. The public `/api/system/status` and `/api/system/runtime-history`
contract does not provide the phase values without an authenticated watchlist
session. Therefore the audit does not infer a phase from total request time.

The observed direct backend latency is real, but the missing phase split means
initial readiness, database check, ATC load, snapshot/serialization, and event
loop wait remain unranked. This is an observability gap, not evidence that any
one dependency is guilty.

## PostgreSQL rollback analysis

The same-database 15-minute interval recorded 10,516 commits and 4,383
rollbacks. There were no deadlocks or lock waits at the start or end. Activity
was one active connection at both snapshots; the initial five idle-in-
transaction sessions had cleared by the end.

Write context in the same interval was: `flight` +3163 updates,
`flightPosition` +3157 inserts, `predictiveObservation` +3763 inserts,
`aircraftWeatherObservation` +1620 inserts, and `receiverCoverageHourly`
+1671 updates. These are not rollback attribution.

The existing process-local diagnostics distinguish explicit transaction lanes
from autocommit lanes, but they were not externally readable for this audit.
The reconciliation script is intentionally treated as candidate-only; its
failure counts cannot be equated with PostgreSQL rollbacks.

## Prioritized T4.3–T4.5 recommendations

### T4.3 — authenticated bounded runtime attribution (P1)

Problem: phase and event-loop metrics exist in `runtime-performance.ts`, but
the production audit boundary did not expose a bounded internal summary.

Change: extend the existing authenticated runtime telemetry/system-status
projection with per-phase call count, average, p50/p95/p99/max, timeout count,
and sampled event-loop/GC indicators. Keep it process-local, bounded, and
sanitized; never expose raw provider errors, SQL, parameters, coordinates, or
credentials.

Files/functions: `app/api/health/route.ts`,
`lib/server/runtime-performance.ts`, `lib/server/runtime-diagnostics.ts`,
`app/api/system/runtime-history/route.ts`, and the admin projection.

Benefit direction: makes the Health API cause measurable and separates Node
event-loop delay from dependency time. Risk: low if the response remains
authenticated and bounded. Tests: runtime percentile tests, projection
redaction tests, and health deadline tests. Verify after deployment with three
paired windows and an authenticated read-only telemetry check.

### T4.4 — transaction termination-class attribution (P1)

Problem: PostgreSQL rollback deltas are materially higher than the currently
observable application failure counters, but cannot be assigned to a lane.

Change: add a bounded outcome taxonomy around `trackDbTransaction` and
`trackDbOperation`: committed, explicit failure, timeout, constraint/conflict,
connection failure, read-only transaction end, and unknown. Store only lane,
operation type, duration, outcome class, and sanitized SQLSTATE/error family.

Files/functions: `lib/server/db-transaction-diagnostics.ts`,
`lib/server/db-operation-diagnostics.ts`,
`scripts/reconcile-db-rollbacks.mjs`, and the authenticated runtime projection.

Benefit direction: identifies the actual rollback contributor without
installing `pg_stat_statements` or storing SQL parameters. Risk: ORM error
classification must be conservative and diagnostics must never throw. Tests:
diagnostic taxonomy unit tests, reconciliation same-window/process tests, and
redaction tests. Verify with a fresh 15-minute window and compare only matching
process identity and timestamps.

### T4.5 — targeted persistence coalescing after attribution (P2)

Problem: high write activity is visible in `flight`, `flightPosition`,
`predictiveObservation`, and `receiverCoverageHourly`, but the audit does not
show which lane rolls back.

Change: after T4.4 identifies a lane, review batching/coalescing and transaction
scope for that lane. Do not reduce history fidelity or disable live-path
failure isolation based only on table write counts.

Files/functions likely involved: `lib/server/aircraft-state.ts`,
`lib/server/history.ts`, `lib/server/receiver-coverage-analytics.ts`,
`lib/server/receiver-advanced-statistics.ts`, and
`lib/server/statistics.ts`.

Benefit direction: fewer transaction attempts and less write churn if the
identified lane is the source. Risk: history/statistics loss or changed
sampling semantics. Tests: persistence lane tests, rollback/failure isolation,
history sampling invariants, and database integration tests against DEV only.
Verify with before/after same-window counters and no production migration.

## Limitations

The audit could not retrieve authenticated process-local diagnostics, event-loop
lag, GC pauses, or `pg_stat_statements`. No values were reconstructed from
total latency. No credentials, internal addresses, client identifiers, or raw
logs are included in the artifacts.
