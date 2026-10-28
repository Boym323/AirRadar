# AirRadar V1 PostgreSQL write optimization — 2026-10-28

## Final state

**OPTIMIZATION_PASS_NOT_DEPLOYED**

The current `origin/main` (`ac0e758678b8c0262da485c3f65786235f02ac33`) was
audited and a bounded, isolated optimization was implemented on branch
`perf/v1-postgres-write-optimization`. It is not merged, deployed, or claimed
as a production result. Local commit: `768d6d2f44fa230f94ae8f1c835b64b7f8b9eeac`.

## Evidence and change

The existing production evidence in `artifacts/final-post-optimization-baseline.md`
shows `ReceiverCoverageHourly` at roughly 88.82 updates/min in a healthy
30-minute window. The existing implementation performed a per-bucket durable
lookup followed by an ORM update/create inside one transaction. That is a
read-modify-write sequence: it adds one lookup round-trip per bucket and can
lose a concurrent counter increment between the lookup and update.

The change in `lib/server/receiver-coverage-analytics.ts` adds a PostgreSQL
fast path using one parameterized `jsonb_to_recordset` statement per flush:

- `INSERT ... SELECT ... ON CONFLICT (hour, bucketKey) DO UPDATE`;
- additive counter updates are performed by PostgreSQL atomically;
- provider names are unioned deterministically;
- pending rows and the in-memory durable cache are published only after commit;
- failed batches still merge back into the pending queue;
- the previous row-wise ORM path remains as a compatibility fallback.

The fallback and existing Flight/FlightPosition bounded batching, Aircraft
write suppression, navigation deduplication, weather batching, retry handling,
and cache-after-commit semantics were not otherwise changed.

## Validation

| Check | Result |
|---|---|
| `origin/main` synchronization | PASS; clean at start, SHA `ac0e758` |
| Targeted coverage/history/navigation tests | PASS; 27 passed, 2 skipped |
| New raw-path unit test | PASS; one transaction execute, no per-row lookup |
| TypeScript typecheck | PASS (`npm run typecheck:prepared`) |
| ESLint | PASS (`npm run lint -- --no-cache`) |
| PostgreSQL SQL smoke test | PASS on local PostgreSQL 17.11, temporary table only |
| Full Vitest suite | PASS; 297 files, 1,987 passed, 5 skipped files / 17 skipped tests |
| Production build | PASS; Next.js optimized build completed |
| Real PostgreSQL integration with application schema | BLOCKED; no `DATABASE_URL` configured |
| Production read-only baseline / A-B window | BLOCKED; no production DB or runtime credentials in this workspace |
| GitHub PR / Actions / merge / deploy | BLOCKED; no PR or deployment authorization/mechanism available |

The local SQL smoke test verified that an existing row changed from
`100/80, adsbhub` to `110/88, adsbhub,network` while a new bucket was inserted.
No application or production data was modified.

## Performance interpretation

The implementation reduces the coverage flush database statement shape from
approximately one `SELECT` plus one `UPDATE/INSERT` per dirty bucket to one
set-based mutation per flush on the production raw-runtime path. This proves a
round-trip reduction at the code/SQL level, but no percentage improvement in
latency, CPU, WAL, or throughput is claimed: the required matched PostgreSQL
A/B workload and production observation window could not be run without an
isolated `DATABASE_URL` and approved runtime access.

Historical production evidence remains the reference baseline: approximately
3.82 MB/min WAL, 404 transactions/min, 334 inserts/min, 284 updates/min,
98.94% buffer hit ratio, and no observed lock/deadlock issue in the cited
30-minute natural-traffic window. These are not a before/after result for this
branch.

## Rollback and release gates

Rollback is a normal code rollback: revert this branch commit. No schema
migration, index, PostgreSQL setting, production data mutation, or sampling /
retention change was made. Before merge, run a protected `_test_` PostgreSQL
integration database, the full test suite to completion, typecheck, lint, build,
and an A/B benchmark at 50/250/1,000/5,000 bucket rows with WAL and latency
deltas. Before deployment, run the existing release gates and a synchronized
read-only production window; do not enable invasive SQL logging merely for
this experiment.

## Remaining bottlenecks

`FlightPosition` remains the largest intentional history write volume and
`Flight.lastSeenAt` remains an intentional immediate update. The existing
bounded history batch is active. Navigation integrity still uses the rc.9
compatibility upsert for duplicate keys, which can physically update a
conflicted tuple; upgrading that runtime/API requires a separate compatibility
and WAL benchmark. No further change was made here without current production
duplicate-rate evidence.
