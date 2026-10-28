# AirRadar V1 PostgreSQL write optimization — 2026-10-28

## Final state

**OPTIMIZATION_PASS_NOT_DEPLOYED**

The current `origin/main` (`ac0e758678b8c0262da485c3f65786235f02ac33`) was
audited and a bounded, isolated optimization was implemented on branch
`perf/v1-postgres-write-optimization`. It is not merged, deployed, or claimed
as a production result. The follow-up implementation is validated locally and
is being submitted as the next commit on PR `#1129`; the implementation commit
SHA is recorded in the final handoff.

## Evidence and change

The existing production evidence in `artifacts/final-post-optimization-baseline.md`
shows `ReceiverCoverageHourly` at roughly 88.82 updates/min in a healthy
30-minute window. The existing implementation performed a per-bucket durable
lookup followed by an ORM update/create inside one transaction. That is a
read-modify-write sequence: it adds one lookup round-trip per bucket and can
lose a concurrent counter increment between the lookup and update.

The change in `lib/server/receiver-coverage-analytics.ts` adds a PostgreSQL
fast path using one parameterized `jsonb_to_recordset` statement per flush:

- `UPDATE ... FROM` for existing buckets plus bounded insert/upsert handling
  for new/concurrently-created keys;
- additive counter updates are performed by PostgreSQL atomically;
- provider names are unioned deterministically;
- pending rows and the in-memory durable cache are published only after commit;
- failed batches still merge back into the pending queue;
- the previous row-wise ORM path remains as a compatibility fallback and is
  protected by a transaction-scoped advisory lock when the canary is off.

The canary flag is `AIRRADAR_RECEIVER_COVERAGE_ATOMIC_BATCH_ENABLED`; it is ON
by default and `false` selects the locked ORM fallback.

The fallback and existing Flight/FlightPosition bounded batching, Aircraft
write suppression, navigation deduplication, weather batching, retry handling,
and cache-after-commit semantics were not otherwise changed.

## Validation

| Check | Result |
|---|---|
| `origin/main` synchronization | PASS; clean at start, SHA `ac0e758` |
| Targeted coverage/history/navigation tests | PASS; prior suite 27 passed, 2 skipped |
| Real PostgreSQL 17 integration | PASS; 3/3 raw-path tests, 3/3 fallback tests, 8/8 including unit path |
| Runtime `transaction.execute` | PASS; direct rc.9 transaction method invoked against PostgreSQL |
| Cache restart / cold miss parity | PASS; durable totals returned with `RETURNING` and cached after commit |
| Concurrent writers | PASS; additive counts and provider union preserved in raw and locked fallback paths |
| Rollback/retry and repeated flush | PASS; real trigger failure rolled back and retry applied once |
| TypeScript typecheck | PASS (`npm run typecheck:prepared`) |
| ESLint | PASS; 0 errors, 4 pre-existing warnings |
| Full Vitest suite | PASS; 297 files passed, 5 skipped; 1,987 tests passed, 18 skipped |
| Production build | PASS |
| CI for follow-up commit | Pending; predecessor PR checks were green |
| Production read-only baseline / A-B window | BLOCKED; no authorized production DB/runtime access |
| GitHub PR / Actions | PR #1129 open; follow-up CI required |

The local SQL smoke test verified that an existing row changed from
`100/80, adsbhub` to `110/88, adsbhub,network` while a new bucket was inserted.
No application or production data was modified.

## Performance interpretation

The reproducible benchmark is
`scripts/benchmark-receiver-coverage-writes.mjs`; it ran against PostgreSQL
17.11 and the complete emitted application schema in isolated database
`airradar_v1_cov_pr1129`, with 5 measured repeats and 2 warmups per mode. The
artifact is `artifacts/performance/receiver-coverage-hourly-ab-20261028.json`.

| Buckets | Legacy round-trips | Atomic round-trips | Legacy p50/p95/p99 ms | Atomic p50/p95/p99 ms | Legacy/atomic WAL p50 bytes | Legacy/atomic backend CPU jiffies | Parity |
|---:|---:|---:|---:|---:|---:|---:|---|
| 50 | 102 | 3 | 17.952 / 20.189 / 20.189 | 1.691 / 1.862 / 1.862 | 8,312 / 8,312 | 1 / 0 | PASS |
| 250 | 502 | 3 | 68.554 / 74.909 / 74.909 | 4.557 / 4.766 / 4.766 | 105,464 / 105,464 | 4 / 1 | PASS |
| 1,000 | 2,002 | 3 | 236.489 / 249.942 / 249.942 | 17.022 / 19.294 / 19.294 | 435,528 / 435,528 | 17 / 1 | PASS |
| 5,000 | 10,002 | 3 | 1,204.316 / 1,236.572 / 1,236.572 | 80.369 / 89.358 / 89.358 | 2,145,496 / 2,145,496 | 85 / 8 | PASS |

The measured atomic path reduced p50 latency by approximately 90.6%, 93.3%,
92.8%, and 93.3% respectively, reduced backend CPU, kept WAL equal in this
matched existing-row workload, and produced identical aggregate counts and
provider sets. The prior simpler `ON CONFLICT` implementation was rejected
after measurement because it increased WAL by approximately 13%; it is not
the implementation under validation.

Historical production evidence remains the reference baseline: approximately
3.82 MB/min WAL, 404 transactions/min, 334 inserts/min, 284 updates/min,
98.94% buffer hit ratio, and no observed lock/deadlock issue in the cited
30-minute natural-traffic window. These are not a before/after result for this
branch.

## Rollback and release gates

Rollback is a normal code rollback: revert the implementation commit on this
branch. No schema
migration, index, PostgreSQL setting, production data mutation, or sampling /
retention change was made. The protected isolated PostgreSQL 17 integration
database, full test suite, typecheck, lint, and build have passed. The A/B
benchmark is recorded above. Before deployment, run the existing release gates
and a synchronized read-only production window; do not enable invasive SQL
logging merely for this experiment.

## Remaining bottlenecks

`FlightPosition` remains the largest intentional history write volume and
`Flight.lastSeenAt` remains an intentional immediate update. The existing
bounded history batch is active. Navigation integrity still uses the rc.9
compatibility upsert for duplicate keys, which can physically update a
conflicted tuple; upgrading that runtime/API requires a separate compatibility
and WAL benchmark. No further change was made here without current production
duplicate-rate evidence.
