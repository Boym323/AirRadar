# AirRadar T5.0 — root cause and fix

Generated: 2026-10-09 (Europe/Prague)

This report covers two independent tracks. No production restart, deployment,
migration, or write was performed.

## P0 — Navigation Integrity persistence

### Confirmed cause

The failure was a real unique-key collision, caused by a mismatch between the
in-memory deduplication predicate and the database identity:

- `dedupKey` is `aircraftHex:observed-minute:source:nic:nacP:nacV`.
- `changedMeaningfully()` permits another write in the same minute when the
  aircraft moves by at least `0.1°`, changes altitude band/source/classification,
  or reaches the heartbeat condition.
- Therefore two distinct accepted observations can have the same `dedupKey`.
- `persistObservation()` used ORM `create()`, so the second row rejected on
  `navigationIntegrityObservation_dedupKey_key`.

This explains the production lane's `unknown` family: the ORM/driver error can
carry its SQLSTATE or Prisma code in a nested adapter/cause object, while the
old classifier inspected only the top-level `code`/`sqlstate`. The diagnosis is
based on the key construction and write path; production raw error payloads
were not collected and are intentionally not needed or retained.

The write queue is already single-lane and coalesces pending keys. It does not
remove the database race/identity mismatch after a row has been persisted, so
serialization alone could not explain the failures. There is no blind retry.

### Fix

`NavigationIntegrityObservation.create()` is replaced by an ORM-compatible
idempotent `upsert()` on `{ dedupKey }`, with `update: {}` and the full row in
`create`. A conflict is now a successful no-op: the first historical row is
preserved and the duplicate does not rewrite evidence. DB failures still
reject the operation, stay isolated by the existing write tail, and permit a
later observation to recover.

`classifyDbFailure()` now walks a bounded, cycle-safe set of structured ORM
fields (`cause`, `meta`, `driverAdapterError`, `originalError`) and recognizes
SQLSTATE/Prisma codes without storing SQL, parameters, dedup keys, sensitive
values, or raw messages. Specific classes are timeout, constraint, conflict,
connection, other, and unknown.

### Regression coverage

`tests/navigation-integrity-persistence.test.ts` covers:

- repeated identical dedup keys through the idempotent upsert;
- nested timeout (`P2024`), unique constraint (`23505`), and ordinary DB
  failure handling;
- recovery after a failed write.

`tests/db-failure-classification.test.ts` covers nested adapter/cause codes and
redaction behavior. Targeted result: **16 tests passed**.

The DEV target was checked read-only before any possible integration write:

```text
database=airradar_dev user=airradar_dev schema=public
```

No DEV canary write was run in this turn; the repository has no existing
Navigation Integrity integration harness that can safely report before/after
lane counters. The unit harness proves the required reproducible outcome:
duplicate attempts remain successful idempotent operations, while timeout and
ordinary failures remain failures and do not poison the next write. A post-merge
DEV canary should record `attempts`, `successes`, `failures`, and constraint
family counts before and after the change.

## P1 — Public Health API latency

### Paired read-only evidence

The new `scripts/t50-health-latency.mjs` measures, for each paired sample,
connection setup, TTFB, total download time, HTTP status, and response size for:

- direct backend: `http://192.168.1.142:3000/api/health`;
- public HTTPS: `https://airradar.pomykal.cz/api/health`.

The 20-sample window was sequentially paired on 2026-10-09 19:00 CEST. All
responses were HTTP 200 and 705 bytes. Connection setup stayed near zero for
the direct path (`~0.1 ms`) and was only a few milliseconds for HTTPS. Direct
TTFB varied from about **2.6 ms to 1.33 s**; public TTFB was usually about
**18–40 ms**, with one paired sample around **1.34 s**. The prior T4.9 values
(public p50 1,386 ms, p95 6,312 ms; internal `health.total` average 51.43 ms)
are consistent with queue/scheduling time not represented by the internal
phase duration.

The public response identifies the edge as `openresty` and preserves
`cache-control: no-store`. The public path was frequently faster than the
direct backend in the paired window, so reverse-proxy processing is **not
supported as the dominant cause**. The direct path's intermittent delay has
negligible connection time and is therefore waiting for backend scheduling or
work before TTFB.

The running service snapshot showed `next-server` at approximately 65.5% CPU,
1.3 GiB RSS, and 11 tasks. This supports event-loop/process contention as a
credible cause of the wait, but it does not prove whether the contention is
caused by the health readiness check, its DB probe, another request, or a
background provider. The authenticated runtime endpoint returned 401 for both
direct and public unauthenticated reads, so `health.ready`, `health.database`,
`health.atc`, `health.event-loop`, and `health.total` could not be paired to
the same public requests.

### P1 conclusion and limitation

The proven explanation is **time outside the measured handler phases: request
queue/event-loop scheduling before the handler and/or edge/upstream queuing**.
The measurements rule out connection setup and do not identify the specific
internal dependency. No timeout was extended and no cache was added. Since the
specific dependency is not proven, no speculative performance fix was made;
the safe deliverable is the bounded measurement script and this explicit
limitation.

## Branches and PRs

- P0 branch: [`fix/t50-navigation-persistence`](https://github.com/Boym323/AirRadar/compare/main...fix/t50-navigation-persistence), commit `8c4af185`.
- P1 branch: [`perf/t50-health-latency`](https://github.com/Boym323/AirRadar/compare/main...perf/t50-health-latency), report and measurement script only.

No GitHub PR was created from this checkout, so the links above are branch
comparison links rather than published PRs.

## Production risks

P0 changes the duplicate outcome from a failed write to an idempotent success;
it does not alter the dedup key, retention, observation window, anomaly
evaluation, or first-row historical values. The main risk is ORM contract
compatibility, covered by typecheck and the upsert regression test.

P1 has no runtime behavior change. The remaining risk is operational: public
health may still show burst latency until authenticated, time-correlated phase
telemetry is collected.

## Verification after deployment

1. In DEV, replay a same-minute two-position observation with the same
   aircraft/source/NIC/NAC-P/NAC-V and confirm one durable row, zero constraint
   failures, and counters showing the second operation as a successful no-op.
2. Inject only synthetic DEV timeout, ordinary DB, and recovery cases; confirm
   failure families are structured and no messages/SQL/parameters appear.
3. In one production observation window, compare the lane's attempts,
   successes, failures, and constraint family before/after. Do not interpret
   process-local counters across a restart.
4. Run the paired health script while collecting the authenticated runtime
   phase projection for the same timestamps. Compare connect, TTFB, download,
   `health.total`, event-loop delay, readiness, database, and ATC phases.
5. If TTFB remains high while all phases are low, investigate proxy/upstream
   queueing. If event-loop delay rises with direct TTFB, profile Node under an
   approved maintenance window. Do not change timeouts or add cache before that
   correlation exists.
