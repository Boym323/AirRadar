# T5.1 DEV Acceptance, Merge & Production Validation

Date: 2026-10-09 (Europe/Prague)  
Result: **PASS WITH LIMITATIONS**

## Scope and safety

The database acceptance work used only the explicitly verified DEV target:

```text
database: airradar_dev
role:     airradar_dev
schema:   public
ORM:      @prisma/orm-postgres@8.0.0-rc.9
```

The guard returned `airradar_dev | airradar_dev | public` before any write.
Test observations used the isolated `T51DEV_` aircraft prefix. Cleanup removed
only that prefix; the final count was `0`.

## DEV acceptance

The real rc.9 ORM path passed all three DEV integration scenarios:

| Check | Result |
| --- | --- |
| Two materially different positions, same minute and timestamp | PASS; two rows retained |
| Exact duplicate observation | PASS; row count remained one and original fields stayed unchanged |
| Altitude-band transition and integrity-state transition | PASS; both transitions persisted as separate rows |
| Simulated database failure followed by another write | PASS; next write succeeded |
| Nested ORM error classification | PASS; nested `23505` → constraint, `P2024` → timeout, `40001` → conflict |
| PR unit tests (`navigation-integrity-persistence`, `db-failure-classification`) | PASS; 10/10 |

The duplicate path is an rc.9-compatible native upsert:

```ts
update: { dedupKey: key }
```

It preserves the original data, but it is not write-free. In the real DEV
database, one insert followed by ten identical duplicate upserts produced:

```text
rows:       1
ctid moves: 10
WAL delta:  610 bytes
```

The `ctid` changes prove that PostgreSQL executed a physical UPDATE for each
duplicate collision. This is the accepted compatibility trade-off for rc.9,
but it is write amplification and must not be described as a performance win.
The short isolated run did not provide a stable per-table `pg_stat_all_tables`
delta, so the report uses row cardinality, tuple identity, and `pg_stat_wal`
delta as the direct evidence.

## Merge and pipeline

- PR #675 merged first at `41547ddc`.
- PR #674 merged second at `a1f63b1e`.
- Final `origin/main` SHA: `a1f63b1e305c50bbc8a317e3a86b09296e808c18`.
- Both PRs had successful CI validation and CodeQL checks before merge.
- Post-merge push workflows for the final SHA were observed as pending/in
  progress at report creation time; CodeQL had completed successfully.

The repository's push-to-main workflow may continue into its protected release
job. No manual `deploy/release.sh`, production restart, or direct production
build was run by this validation.

## Production validation

**Not yet run.** A new release was not proven deployed during this run, and
the requested minimum 15-minute synchronized read-only production window is
therefore intentionally absent. No production conclusion is drawn from the
DEV result.

The pending production window must compare synchronized deltas, not cumulative
values across restarts, for:

- `navigation.observation.create` attempts/successes/failures and failure families;
- PostgreSQL `xact_commit`/`xact_rollback` deltas;
- write frequency, row/WAL volume, and historical-observation continuity;
- Health API p50/p95 and backend TTFB versus public HTTPS;
- RSS and available Node runtime metrics.

The T4.9 reference remains `1,208 / 4,716` failures (`25.61%`) for
`navigation.observation.create`; it must be compared only with a synchronized
post-deploy interval.

## Assessment and next priorities

Functionally, the T5.0 repair is validated: same-timestamp movement is no
longer collapsed, duplicate writes do not mutate the original observation, and
database failures remain isolated from subsequent writes. The remaining
limitation is measurable duplicate-upsert write amplification. A lower error
rate alone must not be treated as an overall performance improvement.

Recommended next priorities:

1. Complete the synchronized 15-minute production read-only window after the
   exact SHA is deployed.
2. Quantify duplicate collision rate and WAL/UPDATE amplification under normal
   traffic.
3. If amplification is material, upgrade to an ORM/API version with native
   insert-on-conflict-do-nothing support, or introduce a carefully bounded
   lower-write path after compatibility testing.
4. Re-check Node RSS and health latency together with PostgreSQL transaction
   deltas before declaring a net performance improvement.
