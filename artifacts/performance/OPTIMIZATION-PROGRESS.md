# AirRadar Optimization Progress

## Current State
- Date: 2026-10-15 (Europe/Prague)
- Main SHA: `8f0655dec240ab5382ccd45ac48adb642c8666eb`
- Production SHA: `e8282c48` documented by the 2026-10-15 technical audit; not independently re-read in this turn
- Active branch: `perf/bounded-enrichment-telemetry`
- Last validated SHA: none on this branch
- CI status: main metadata sync #916 and the preceding application checks reported success; branch CI not run yet
- CodeQL Security status: latest documented application CodeQL passed; no new branch CodeQL result yet

## Completed
- None on this branch.

## In Progress
- Current problem: process-local enrichment telemetry pruned the hourly map on every metric event, and stale-provider fallback log deduplication was unbounded.
- Confirmed cause: `RouteEnrichmentTelemetry.record()` performed a map scan for every event; `EnrichmentService.staleFallbackLogged` was an unbounded `Set` independent of the bounded provider persistence cache.
- Files being changed: `lib/server/route-enrichment-telemetry.ts`, `lib/server/enrichment-cache.ts`, targeted tests, and a reproducible benchmark.
- Last verified state: targeted tests pass (2 files / 18 tests); local benchmark captured before/after.
- Next step: run typecheck/lint and review the final diff before commit.

## Blocked
- Production PostgreSQL execution time, pool acquisition, lock waits, RSS trend, and event-loop causality remain unverified from repository/public evidence. No production load test, DB write, config change, restart, or release is authorized.

## Measurements
- Benchmark: `artifacts/performance/route-telemetry-benchmark.json`.
- Baseline SHA: `8f0655dec240ab5382ccd45ac48adb642c8666eb`.
- Optimized SHA: working tree before commit.
- Workload: 7 rounds × 250,000 fixed-clock telemetry records.
- CPU/RSS/P95/P99/DB latency: NOT MEASURED; this is a local microbenchmark of one synchronous hot path.
- Result: median record time 749.3 ns → 599.8 ns, 19.69% lower in this workload.

## Decisions
- Do not change route-cache timeout, pool/concurrency limits, SQL schema, provider cooldowns, or production flags without matched read-only evidence.
- Keep the optimization process-local and bounded; logging dedupe is best-effort and must not affect route results.

## Pull Requests
- None for this branch.
- Existing open PR: #916 metadata sync; unrelated.

## Next Actions
1. Run typecheck and lint, then review the final diff.
2. Run the stable full validation gates; do not run a live-checkout production build or release.
3. Commit the bounded telemetry/enrichment change.
4. Push, open one thematic PR, and record its CI/CodeQL state.
5. Recheck branch ancestry against current `main` before final handoff.
