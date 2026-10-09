# T4.5 Performance Root Cause & Targeted Optimization

Date: 2026-10-09  
Repository: AirRadar  
Branch: `perf/t45-health-bottleneck`

## Scope and safety

This audit used read-only production requests and local source/tests. No
deployment, service restart, database migration, invasive profiler, or
production write was performed.

## Deployment verification

| Item | Result | Evidence |
|---|---|---|
| Production SHA | `41a807f3f0223d90ea018dd438cb6636a616e486` | `/api/system/status`, 2026-10-09 14:48 CEST |
| Production version | `1.0.382` | `/api/system/status` |
| PR #661 present in current checkout | CONFIRMED | commit `274b18b6` is an ancestor of HEAD |
| PR #662 present in current checkout | CONFIRMED | commit `68ca33d3` is an ancestor of HEAD |
| Node PID | `1811` | `systemctl show`, `ps` |
| Process start | 2026-10-09 16:46:37 CEST | systemd |
| Diagnostics authentication | CONFIRMED | unauthenticated requests to runtime endpoints return `401 auth_required` |

The public status response is intentionally redacted (`runtime` counters are
zero/null). The authenticated performance and runtime-history endpoints could
not be sampled because no operator session was available.

## Baseline observations

The point-in-time process sample was approximately 1,356,688 KiB RSS and
63.6% CPU. This is a single sample, not a sustained attribution. Production
status showed 73 local aircraft, 1,269 ADSB.lol aircraft, and an operational
database at the observation time.

### Health API windows

Requests were made directly to the backend listener and through HTTPS. Values
are seconds, measured with curl; each window is an independent short sample.

| Window | Path | Samples | Average | p50 | p95 | p99 | Max |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | backend | 20 | 0.2575 | 0.1692 | 0.4344 | 0.9902 | 0.9902 |
| 1 | HTTPS | 20 | 0.3253 | 0.1709 | 1.0984 | 1.8575 | 1.8575 |
| 2 | backend | 20 | 0.3164 | 0.1667 | 1.2629 | 1.3291 | 1.3291 |
| 2 | HTTPS | 20 | 0.3871 | 0.1784 | 1.2832 | 1.6676 | 1.6676 |
| 3 | backend | 10 | 0.0422 | 0.0032 | 0.2256 | 0.2256 | 0.2256 |
| 3 | HTTPS | 10 | 0.6419 | 0.3458 | 1.7746 | 1.7746 | 1.7746 |

The windows confirm variable backend and proxy latency, but cannot attribute
the backend p95 to DB, ATC, snapshot, or event-loop delay without the
authenticated phase counters. Percentiles from independent phases were not
summed.

## Root-cause findings

| Area | Classification | Root cause | Evidence | Action |
|---|---|---|---|---|
| Health | PARTIALLY ATTRIBUTED | Independent DB and ATC probes were awaited sequentially, so their waits could add to total latency. | Current `app/api/health/route.ts`; three production windows show variable backend p95. | Run probes concurrently while preserving individual deadlines/fallbacks. |
| PostgreSQL | INCONCLUSIVE | Rollback totals and lane/failure-family windows were not exposed to this unauthenticated audit session. | `/api/system/runtime-performance` and `/api/system/runtime-history` returned `401`. | Obtain an authenticated 15-minute window before any DB optimization. |
| Runtime | INCONCLUSIVE | CPU/RSS was observed, but event-loop and GC counters were not available. | Public status redacts runtime counters; no opt-in profiler was enabled. | Collect authenticated runtime-performance samples and runtime-history. |

## Implemented optimization

On branch `perf/t45-health-bottleneck`, `/api/health` now starts the database
and ATC checks together after readiness and awaits them with `Promise.all`.
Each check retains its existing timeout, fallback, instrumentation metric, and
public response shape. No database schema or live radar/SSE path changed.

## Validation

- `npm run test:targeted -- tests/health-deadlines.test.ts tests/runtime-performance-route.test.ts` — PASS (7 tests).
- Added a regression test proving DB and ATC probes start concurrently.
- `npm run typecheck:prepared` — PASS.
- No production build, deployment, restart, migration, merge, or CodeQL run was performed.

## Remaining risks and next steps

The optimization is not yet proven in production because the authenticated
phase data is unavailable and no before/after production deployment was
authorized. The branch is therefore ready for review, not release.

Before a DB or runtime optimization, collect at least one authenticated
15-minute PostgreSQL window and three authenticated health/runtime windows,
including phase percentiles, process-local PID/start time, DB lanes, failure
families, event-loop delay, GC, heap/RSS, SSE counters, and cache/trail sizes.

| Area | Root cause | Evidence | Fix | PR | Expected impact |
|---|---|---|---|---|---|
| Health | Sequential independent DB + ATC probes | Source-confirmed; production latency only partially attributed | Concurrent probes with existing deadlines | `perf/t45-health-bottleneck` | Lower health latency when both dependencies are non-trivial |
| PostgreSQL | Not established | Authenticated attribution unavailable | None implemented | — | Unknown |
| Runtime | Not established | Authenticated runtime counters unavailable | None implemented | — | Unknown |
