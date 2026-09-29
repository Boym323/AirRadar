# AirRadar Weather Batch Insert V1 PostgreSQL Gate

## RESULT

REAL POSTGRESQL GATE PASS

Executed 2026-09-29 from `f110956a985f73321a6d3b5f9ab7f0c9a1d4d3e8`, equal to
`origin/main`. No production release or restart was performed.

## ENVIRONMENT

- Isolation: disposable loopback-only PostgreSQL instance under `/tmp`, dedicated test role and database.
- PostgreSQL: 17.11 (Debian package), UTF8, `Europe/Prague`, `read committed`.
- Production database touched: NO.
- Current checked-in Prisma contract applied through the repository migration mechanism; no migration was created.
- Weather table: `public.aircraftWeatherObservation`.
- Unique constraint/index: `aircraftWeatherObservation_dedupKey_key`, column `dedupKey`, NOT NULL and UNIQUE.

## DRIVER AND RUNTIME

- Duplicate driver error: SQLSTATE `23505`; constraint identity was exposed as `constraint` and classified as `EXACT_DEDUP_CONFLICT`.
- Exact SQL builder and execution path: PASS — `database.sql.public.aircraftWeatherObservation.insert(rows).build()` followed by `database.runtime().execute(plan)`.
- Batch sizes 1, 2, 4, 8, 16: PASS.
- Temporal.Instant observed/received timestamp parity: PASS.
- Representative field round-trip: PASS.
- Multi-row statement atomicity: PASS.
- Controlled NOT NULL row error was not classified as exact dedup: PASS.

## FALLBACK AND RESILIENCE

- Bounded duplicate fallback: PASS.
- Fallback cap: 8 attempts; rows beyond the cap remained uncommitted: PASS.
- Legacy lane with kill switch OFF: PASS; fallback lane remained at zero.
- Batch fallback lane with kill switch ON: PASS; only actual fallback attempts were counted.
- Duplicate-aircraft sequential parity: PASS.
- 30-row runtime chunking: PASS; chunks were 16 + 14, `maxBatchSize=16`, natural selected maximum 30, cap recorded.
- Infrastructure outage: PASS; two real connection failures opened the 30-second breaker, writes were suppressed while open, and a successful write after expiry closed/reset it.

The gate exposed PostgreSQL admin-shutdown SQLSTATE `57P01` as an infrastructure
failure signature; the classifier now handles it conservatively alongside the
existing connection signatures.

## BENCHMARK

| rows | single-row ms | batch ms | speedup | single operations | batch operations |
|---:|---:|---:|---:|---:|---:|
| 1 | 1.878 | 1.381 | 1.36x | 1 | 1 |
| 4 | 4.527 | 1.551 | 2.92x | 4 | 1 |
| 8 | 10.410 | 2.522 | 4.13x | 8 | 1 |
| 16 | 16.645 | 6.448 | 2.58x | 16 | 1 |
| 32 | 32.616 | 5.355 | 6.09x | 32 | 2 |
| 64 | 59.656 | 9.311 | 6.41x | 64 | 4 |

The 32/64-row cases were benchmark-only capability tests; the runtime cap
remained 16.

## VALIDATION

- Real PostgreSQL integration: PASS — 7 tests.
- Focused weather unit tests: PASS — 17 tests.
- Full suite: PASS — 1,384 passed, 10 skipped.
- Typecheck: PASS.
- Lint: PASS with 7 pre-existing warnings, 0 errors.
- Feature check: PASS.
- `git diff --check`: PASS.
- Production build: NOT RUN; direct builds in the live checkout are prohibited while `airradar.service` serves traffic.
- Browser gate: NOT RUN; no visual changes were made.

## CLEANUP

- Test database removed: YES.
- Test role removed: YES.
- Temporary PostgreSQL instance/files removed: YES.
- Credentials in report or repository: NO.
- Production environment/database/service modified: NO.

## NEXT STEP

DEPLOY WEATHER BATCH V1 WITH KILL SWITCH OFF

This task intentionally ended before deployment.

AIRRADAR WEATHER BATCH POSTGRESQL GATE PASS
