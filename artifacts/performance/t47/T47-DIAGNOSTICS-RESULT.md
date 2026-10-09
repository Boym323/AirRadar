# T4.7 Diagnostics Result

Status: **PARTIAL**

The authorized production collection now works, but the production build is
still `1.0.382` / `218caff5`. It exposes lane-level DB failure counts, while
the sanitized failure-family counters from PR #662 were only held in process
memory and were not serialized. This branch adds bounded 5/15/60-minute
failure-family aggregates to the existing admin system-status diagnostics.
Deployment was not performed.

## Authentication and endpoint availability

The standard session flow was used. `GET /api/watchlist/session` returned
`configured:true`; after `POST /api/watchlist/session` with the configured
administrative token, the session check returned `authenticated:true`.
The token value and session cookie were not written to this report, logs, or
GitHub. The cookie was kept in a temporary mode-0700 directory only.

| Endpoint | Unauthenticated | Authorized |
| --- | ---: | ---: |
| `/api/watchlist/session` | 200, configured | 200, authenticated |
| `/api/system/runtime-performance` | 401 | 200 |
| `/api/system/runtime-history` | 401 | 200 |
| `/api/system/status` | 200, public projection | 200, admin projection |

The authorized admin status contained both process-local attribution stores:

- explicit transactions: process `4408`, store `dbtx-mv13bzqi-6uhg65hg`;
- autocommit candidates: process `4408`, store `dbop-mv13bzqi-ldiyaaju`.

## Health API measurements

Three observations were taken during the 15-minute collection window
(2026-10-09 15:09:29Z–15:24:39Z). The endpoint reports cumulative
process-local phase statistics; the values below are the observed cumulative
values at the samples.

| Phase | Calls | Average | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `health.total` | 33 | 405.84 ms | 1758.31 ms | 1986.10 ms | 1986.10 ms |
| `health.ready` | 33 | 2.53 ms | 0.05 ms | 82.48 ms | 82.48 ms |
| `health.snapshot` | 33 | 1.05 ms | 1.59 ms | 1.70 ms | 1.70 ms |
| `health.database` | 33 | 81.62 ms | 377.19 ms | 1949.02 ms | 1949.02 ms |
| `health.atc` | 33 | 401.93 ms | 1756.72 ms | 1985.70 ms | 1985.70 ms |

The slowest confirmed phase is `health.atc`, followed by `health.database`.
The snapshot phase is not a bottleneck in these measurements.

## Runtime and SSE

There were 16 samples at 60-second intervals. Final sample:

- RSS: `1,615,728,640` bytes;
- heap used: `1,180,026,808` bytes;
- active SSE clients: `1`;
- event-loop observation: `disabled`;
- GC samples: `0`;
- event-loop and GC values: unavailable (`null`).

CPU is not exposed by the existing authorized diagnostics endpoints and was
not inferred. SSE transfer-byte fields were also unavailable in this sample
(`null`); active-client count was observed. No event-loop/GC instrumentation
was enabled.

## Database transactions and rollback attribution

At the end of the synchronized process-local window:

- explicit transaction lanes: `5,590` attempts, `5,590` commits, `0`
  failures;
- autocommit operation lanes: `16,556` attempts, `13,696` successes, `2,860`
  failures.

A read-only PostgreSQL snapshot identified database `airradar`, role `airradar`,
schema `public`, with `xact_commit=12,394,361` and
`xact_rollback=748,846`. PostgreSQL did not provide a usable `stats_reset`
timestamp in this snapshot. These absolute counters cannot be attributed to
this Node process or to the synchronized window; they include other database
activity and are therefore not treated as application rollback counts.

The production endpoint exposed lane counts and process/store identity, but
not failure-family aggregates. No SQL, query text, parameters, credentials,
or raw error messages were collected. The patch adds only sanitized
`timeout`, `constraint`, `conflict`, `connection`, `other`, and `unknown`
aggregates in 5/15/60-minute windows to the existing admin response.

## Confirmed findings and bounded follow-up

Confirmed:

1. The recurring audit block was authentication/serialization, not a missing
   runtime collector: the configured session API and admin endpoints work.
2. `health.atc` and `health.database` dominate the observed health latency.
3. Explicit transaction lanes had no failures during the measured process
   window; autocommit lanes had failures, but their production families were
   not exposed by `1.0.382`.
4. Event-loop/GC and CPU evidence is unavailable under the current production
   configuration. No values were invented.

At most two evidence-based optimization candidates for a later, separate PR:

1. Profile the ATC health phase and remove or cache repeated work only after a
   follow-up trace confirms the repeated operation; preserve ATC freshness and
   matching semantics.
2. Investigate the autocommit failure lanes after the new family/window
   counters are deployed; optimize only the dominant classified family and
   lane, preserving fail-soft database behavior.

No optimization was implemented in this task.

## Verification and PR

Local verification on `perf/t47-admin-diagnostics-attribution`:

- targeted diagnostics tests: **12 passed**;
- TypeScript typecheck: **passed**;
- ESLint on changed files: **passed** after removing an existing unused test
  import;
- CodeQL: **passed**, [run 37951948478](https://github.com/Boym323/AirRadar/actions/runs/37951948478);
- CI: **passed**, [run 37951948603](https://github.com/Boym323/AirRadar/actions/runs/37951948603);
- PR: [#669](https://github.com/Boym323/AirRadar/pull/669).

No merge, restart, release, or production deployment was performed.
