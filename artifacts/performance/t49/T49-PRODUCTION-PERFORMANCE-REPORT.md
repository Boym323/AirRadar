# T4.9 Production Performance Verification & Database Failure Analysis

**Status: PASS WITH LIMITATIONS**

Observation date: 2026-10-09, Europe/Prague. Production collection was
read-only. No deployment, restart, migration, configuration change, or
database write was performed.

## Production version and health

Production served version `1.0.384`, commit `e985bf10`, built at
`2026-10-09T16:01:30Z`. The process was PID `11223`, started at
`2026-10-09T16:08:38Z`; the PID and diagnostic store identities remained
stable throughout the 15-minute window. The checkout's `main` HEAD was
`40108e97`; T4.7/#669 is `2db98247` and T4.8/#671 is `e985bf10`.

PostgreSQL was reported connected/OK. ADS-B ingest was continuous during the
observations: `local-beast+json-failover` was OK, with a fresh update at the
last health sample and 77 aircraft. SSE V1/V2 active clients were both zero;
capacity was 128. Zero clients means transfer volume could not be evaluated.

The complete environment snapshot is in [environment.json](./environment.json).

## Health API measurement

Three independent windows of 20 requests were made against `/api/health` at
one request per second through the authorized watchlist session. All 60
requests returned HTTP 200 and no request timed out.

| Measurement | Window 1 | Window 2 | Window 3 | All 60 |
|---|---:|---:|---:|---:|
| Public HTTPS average | 2,399 ms | 2,440 ms | 2,634 ms | 2,491 ms |
| Public HTTPS p50 | 46 ms | 1,386 ms | 2,796 ms | 1,386 ms |
| Public HTTPS p95 | 6,494 ms | 5,346 ms | 5,515 ms | 6,312 ms |
| Public HTTPS p99 | 6,841 ms | 6,312 ms | 5,955 ms | 6,841 ms |
| Public HTTPS max | 6,841 ms | 6,312 ms | 5,955 ms | 6,841 ms |
| HTTP errors/timeouts | 0 | 0 | 0 | 0 |

Public latency is not backend-only latency: it includes reverse-proxy and
network queuing. The internal process-local phase deltas show a different
picture. Across the 60 calls, `health.total` accumulated 3,085.93 ms
(51.43 ms/call); the third window contained a 2,402.80 ms database sample.
`health.ready`, `health.snapshot`, and `health.event-loop` stayed low. The
full phase data, including `health.database`, `health.atc`, ATC DB query,
transformation, and metadata assembly, is in
[health-windows.json](./health-windows.json). Percentiles from independent
windows were not summed.

## ATC cache and metadata parity

The cache behaved as designed under normal production observation:

- 60 health calls recorded 60 `health.atc` calls but only 7
  `health.atc.db-query` calls, approximately one metadata load per 30-second
  expiry interval rather than one load per request.
- The observed ATC DB-query average was 18.20 ms across those seven loads;
  transformation and metadata assembly were approximately 1.31 ms and
  0.38 ms per invocation respectively.
- `atc.dataset.load` had 98 attempts and zero failures in the synchronized
  15-minute process window.
- Exact hit/miss counters are not exposed, so no exact hit ratio is claimed.
  Single-flight coalescing is covered by the local regression test; no
  production concurrency test was run.

The metadata-only response matched the full `/api/atc/sectors` dataset
metadata in every requested field: status, sector count, transmitter count,
source, source reference, effective date, and last-verified timestamp. Both
paths served 114 sectors and zero transmitters. No validity or supported
frequency discrepancy was observed. See
[atc-performance.json](./atc-performance.json) and
[atc-metadata-parity.json](./atc-metadata-parity.json).

## Database failure attribution

The synchronized window was 15 minutes 32 seconds, from
`2026-10-09T16:29:37Z` to `2026-10-09T16:45:09Z`. Application attribution was
process-local and stable at PID 11223.

| Lane | Attempts | Successes | Failures | Failure ratio | Families |
|---|---:|---:|---:|---:|---|
| `navigation.observation.create` | 4,716 | 3,508 | 1,208 | 25.61% | unknown 1,208 |
| `navigation.anomaly.upsert` | 429 | 429 | 0 | 0% | none |
| `weather.observation.batch-insert` | 170 | 170 | 0 | 0% | none |
| `aircraft-metadata.cache.lookup` | 70 | 70 | 0 | 0% | none |
| `atc.dataset.load` | 98 | 98 | 0 | 0% | none |

All explicit transaction lanes had zero failures, including 2,761
`history.snapshot` attempts. The dominant failure is therefore an
autocommit `navigation.observation.create` failure, not a proven PostgreSQL
rollback. Family attribution is **PARTIAL**: the classifier reported 1,208
`unknown` failures and no timeout, constraint, conflict, connection, or other
family. See [database-failure-lanes.json](./database-failure-lanes.json).

PostgreSQL counters in the same window were:

- `xact_commit`: 12,442,210 → 12,452,378, delta **10,168**;
- `xact_rollback`: 764,690 → 768,506, delta **3,816**;
- `stats_reset`: null at both observations.

These counters include all database clients and cannot be mapped to the
Node.js lane failures. They must not be treated as equivalent counts. See
[postgresql-deltas.json](./postgresql-deltas.json).

## Runtime memory, CPU, and SSE

Across 16 one-minute samples, RSS ranged from 1.286 GB to 1.798 GB and
cgroup memory from 1.268 GB to 1.826 GB. Heap used ranged from 862 MB to
1.483 GB, with repeated sawtooth movement while RSS remained high. This is
consistent with allocation/GC churn plus retained process state; the sample
does not prove a monotonic leak. CPU, GC pauses, event-loop delay percentiles,
SSE bytes, and cache-size counters were unavailable or disabled and were not
inferred or activated. See [runtime-memory.json](./runtime-memory.json).

## Before/after comparison

The historical values are not statistically paired with this collection.

| Metric | Before T4.8 | After observation | Change | Evidence quality |
|---|---:|---:|---:|---|
| Health public HTTPS p50 | 201 ms | 1,386 ms | not claimed | not comparable; proxy/DB stalls present |
| Health public HTTPS p95 | 2,439 ms | 6,312 ms | not claimed | not comparable; current window had multi-second stalls |
| ATC phase p95 | 1,756.72 ms | about 26–27 ms | strongly lower, but not paired | process phase evidence; traffic differs |
| ATC DB loads/request | 2/request historical design | 7/60 calls observed | lower | direct process counters, exact hit ratio unavailable |
| CPU | unavailable | unavailable | n/a | no authorized CPU metric |
| RSS | 1.616 GB historical sample | 1.286–1.798 GB | not claimed | different process/window |
| DB failures | 2,860 historical autocommit failures | 1,208 in this window | not claimed | different duration/traffic; family unknown |

## Priority follow-up

1. **Investigate `navigation.observation.create` failure cause.** Evidence:
   1,208 unknown autocommit failures at 25.61%, while explicit transactions
   had zero failures. Owner: the navigation observation persistence function
   and its database-operation wrapper. First change should preserve fail-soft
   ingest and expose a bounded safe error-code mapping or connection/statement
   context; do not blindly retry inserts. Regression tests must cover failure
   classification, ingest continuity, duplicate/constraint behavior, and
   rollback semantics. Re-run the same 15-minute lane/`pg_stat_database`
   comparison after deployment.

2. **Trace the public health latency stalls and the slow database probe.**
   Evidence: internal `health.database` reached 2,402.80 ms in window 3 while
   public requests reached 6.8 s; the ATC phase stayed low. Owner:
   `/api/health` and its database readiness query. Profile with existing safe
   diagnostics before changing deadlines or caching. Regression tests must
   retain fail-soft status behavior and bounded probe concurrency. Re-run the
   three-window HTTPS/internal comparison.

3. **Profile retained heap/allocation sources before memory optimization.**
   Evidence: high RSS with large heap sawtooth, but no GC/event-loop/CPU
   instrumentation. Owner: runtime state, live aircraft/trail structures, and
   enrichment caches. Add only an authorized low-overhead measurement path in a
   separate PR, then optimize the confirmed retaining structure. Regression
   tests must cover bounded caches, SSE coalescing, and long-lived aircraft
   state.

No speculative optimization was implemented because the first finding needs
more specific error attribution and the other two require profiling evidence.

## Final decision

1. **Did T4.8 speed up Health API?** The ATC component clearly improved: the
   observed internal ATC p95 was about 26–27 ms versus the historical
   1,756.72 ms. The public Health API as a whole did not show a confirmed
   improvement: current p50/p95 were 1,386/6,312 ms, and the windows were not
   paired with the historical traffic or proxy conditions.
2. **Does the ATC cache work?** Yes under observed normal load: 60 ATC health
   calls caused 7 metadata DB loads, with low transformation/assembly cost;
   full metadata parity was exact. Exact hit ratio and production concurrent
   single-flight behavior are not directly measurable here.
3. **Which database operation fails most?** `navigation.observation.create`,
   1,208 failures, all `unknown`; `atc.dataset.load` had 98 attempts and zero
   failures.
4. **Where do RAM/CPU costs come from?** Confirmed: high, oscillating heap/RSS
   and cgroup memory; CPU is unavailable. GC/allocation churn is a bounded
   interpretation, not a confirmed root cause.
5. **What next?** Prioritize observation-create failure attribution, health
   database/proxy stall tracing, and then instrumented heap-retention profiling.

The result is **PASS WITH LIMITATIONS**: T4.8’s ATC fast path and metadata
compatibility are confirmed, while whole-endpoint improvement, CPU/GC causes,
and PostgreSQL rollback attribution remain unproven.
