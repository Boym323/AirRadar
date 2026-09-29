# AirRadar application PostgreSQL transaction attribution V1

## Result

**ATTRIBUTION BLOCKED**

The diagnostics-only implementation is present, but this session cannot safely deploy it or observe production traffic. No production service/database credentials or release authorization are available. The three audit files named in the brief are also not present at those paths in this checkout; the 502.71/min and 82.4% figures below are therefore recorded as user-provided baseline evidence, not re-read files.

## Current state

- HEAD and `origin/main`: `ded39f0b22789690aba702de312e61be52a7df73`
- Working tree at start: clean
- User-provided baseline: 502.71 PostgreSQL transactions/min, 82.4% known write-lane attribution, 17.6% unexplained
- No schema, migration, persistence cadence, or SQL logging changes

## Instrumentation inventory

`lib/server/db-transaction-diagnostics.ts` provides an allow-listed, process-local registry with one-minute buckets retained for 60 minutes. It records attempts, commits, failures, active count, maximum concurrency, total/max duration, and optional work units. It includes `startedAt` and `uptimeSeconds`. Counter updates do not call the database and are isolated from the wrapped operation.

Instrumented explicit lanes:

| Lane | Code path | Scope |
|---|---|---|
| `history.snapshot` | `lib/server/history.ts` → `recordAircraftSnapshot` | runtime, one transaction per aircraft |
| `receiver.daily-stats` | `lib/server/statistics.ts` | runtime persistence flush |
| `receiver.coverage` | `lib/server/receiver-coverage-analytics.ts` | runtime hourly aggregate flush |
| `receiver.advanced-stats` | `lib/server/receiver-advanced-statistics.ts` | runtime statistics flush |
| `aircraft-metadata.catalog` | `lib/server/aircraft-metadata-catalog.ts` | optional maintenance import |
| `maintenance.airports-sync` | `lib/airports/sync.ts` | tooling/maintenance |
| `maintenance.atc-import` | `lib/atc/import-db.ts` | tooling/maintenance |

The post-change search found no unwrapped runtime `.transaction(` call. The remaining matches are the two integration-test call sites plus the wrapped calls listed above.

## Admin exposure

The payload is available through the existing admin System Status projection only. Public System Status removes `transactionAttribution`; no credentials, SQL, provider errors, or receiver coordinates are exposed.

## Autocommit and reads

Direct ORM operations outside explicit transactions are not globally intercepted. Likely contributors include history/statistics reads, aircraft detail, health/system probes, navigation-integrity writes, aircraft-weather writes, flight-intelligence writes, and airport/map APIs. These must be measured in the production canary before calculating PostgreSQL reconciliation. It would be incorrect to label the remaining 17.6% as writes or as application transactions without that measurement.

## Production measurement

Not performed. Deployment, a 30–60 minute natural-traffic window, `pg_stat_database` start/end, `pg_stat_activity` grouping, external-client checks, lock/wait checks, and canary health verification remain outstanding. Consequently there is no defensible lane-rate table, external-client contribution, explained percentage, top source, or single optimization candidate yet.

## Validation

- Focused diagnostics tests: passed, 4 tests
- Typecheck: passed
- Lint: passed with 7 pre-existing warnings
- Full suite: passed, 191 files / 1,369 tests; 2 files and 3 tests skipped
- Production gates: not run
- Production build: not run because repository instructions prohibit building in the live serving checkout; canonical release requires the release procedure

## Safety

| Item | Result |
|---|---|
| Schema changed | NO |
| Migration | NO |
| Persistence semantics changed | NO |
| Diagnostics DB writes | NO |

## Next step

**INVESTIGATE REMAINING ATTRIBUTION** — deploy this diagnostics-only change through the canonical release process, then collect the admin counters alongside `pg_stat_database` and `pg_stat_activity` for 30–60 minutes. Do not choose a batching or read optimization until the ≥95% reconciliation is measured.
