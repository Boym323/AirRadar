# AirRadar Optimization Progress

## Current State
- Date: 2026-10-15 (Europe/Prague)
- Main SHA: `8f0655dec240ab5382ccd45ac48adb642c8666eb`
- Production SHA: `e8282c48` documented by the 2026-10-15 technical audit; not independently re-read in this turn
- Active branch: `perf/bounded-enrichment-telemetry`
- Last validated SHA: `676eccc6b81a28af41d6788843eb0bc9d6f4318b`
- CI status: release-preview CI run 38770295542 success (build, tests/typecheck, production/browser, performance); deploy skipped
- CodeQL Security status: run 38770295617 success; no new security alerts reported by the workflow

## Completed
- Area: Runtime telemetry CPU hot path and enrichment memory retention.
- Problem: hourly telemetry map pruning ran on every metric event; stale-fallback log dedupe retained unbounded keys.
- Fix: gate telemetry pruning to at most once/hour; replace the stale log `Set` with FIFO-bounded 4,096-key dedupe.
- Commit/PR: `47a577ad`; draft PR [#917](https://github.com/Boym323/AirRadar/pull/917).
- Test result: targeted 18/18 pass; full suite 2,908 pass / 11 skipped; typecheck pass in isolated dist; ESLint 0 errors / 14 existing warnings.
- Measured benefit: local `record()` microbenchmark median 749.3 → 599.8 ns/event (19.69% lower); production speedup NOT CLAIMED.

## In Progress
- Current problem: no additional confirmed code issue in this branch; production DB/CPU/memory causality remains unverified.
- Confirmed cause: see completed item above.
- Files changed: `lib/server/route-enrichment-telemetry.ts`, `lib/server/enrichment-cache.ts`, tests, benchmark, and evidence.
- Last verified state: commit `676eccc6`; local and PR validation complete; no production changes.
- Next step: review PR #917; no merge/deploy/release performed.

## Blocked
- Production PostgreSQL execution time, pool acquisition, lock waits, RSS trend, and event-loop causality remain unverified from repository/public evidence. No production load test, DB write, config change, restart, or release is authorized.

## Measurements
- Benchmark: `artifacts/performance/route-telemetry-benchmark.json`.
- Baseline SHA: `8f0655dec240ab5382ccd45ac48adb642c8666eb`.
- Optimized SHA: `47a577ad040e8eeecebc834ecb1a35d00b11856a`.
- Workload: 7 rounds × 250,000 fixed-clock telemetry records.
- CPU/RSS/P95/P99/DB latency: NOT MEASURED; this is a local microbenchmark of one synchronous hot path.
- Result: median record time 749.3 ns → 599.8 ns, 19.69% lower in this workload.

## Decisions
- Do not change route-cache timeout, pool/concurrency limits, SQL schema, provider cooldowns, or production flags without matched read-only evidence.
- Keep the optimization process-local and bounded; logging dedupe is best-effort and must not affect route results.

## Pull Requests
- PR #917 — bounded enrichment telemetry and stale-fallback retention — draft/open — current validated head `676eccc6` — CI and CodeQL success.
- Existing open PR: #916 metadata sync; unrelated.

## Next Actions
1. Review PR #917 and decide whether to request merge.
2. Keep production read-only; do not merge, deploy, or release without explicit approval.
3. Recheck branch ancestry against current `main` before any future update.
