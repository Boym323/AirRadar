# AirRadar Optimization Progress

## Current State
- Date: 2026-10-15 (Europe/Prague)
- Main SHA: `8f0655dec240ab5382ccd45ac48adb642c8666eb`
- Production SHA: `e8282c48` documented by the 2026-10-15 technical audit; not independently re-read in this turn
- Active branch: `perf/bounded-enrichment-telemetry`
- Last independently CI-validated application SHA: `5d1032c420a822d6c1cbd269c3b6896e985ace35` (CI green, Security check high alert); security fix commit `0b6a2e115e9fd68edc4ec89cd8f23ecc3372fc3a` under validation
- CI status: release-preview #38772310081 passed on `5d1032c4`; follow-up CI #38773873447 pending after security test fix; no deployment
- CodeQL Security status: separate check on `5d1032c4` FAILED with 1 new high alert despite successful analysis workflow #38772310304; verification pending for fix commit. Do not infer security PASS from workflow alone

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
- Last verified state: security check on `5d1032c4` failed. Replaced a fixed /tmp ADSBDB test-cache path with the existing private `mkdtemp` fixture via `cacheFile()` on `0b6a2e11`. Recheck stand-alone CodeQL Security on newest PR SHA before merge; no production changes.
- Next step: validate new CI and the distinct GitHub CodeQL Security check. Investigate its exact annotation if the check is still red. No merge/deploy/release performed.

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
- PR #917 — bounded enrichment telemetry and stale-fallback retention — draft/open; latest security test fix `0b6a2e11` pending CI and separate CodeQL Security; predecessor `5d1032c4` failed Security high check.
- Existing open PR: #916 metadata sync; unrelated.

## Next Actions
1. Obtain green standalone CodeQL Security check with no new alerts on the exact final PR SHA; preserve full CI gates.
2. Keep production read-only; do not merge, deploy, or release without explicit approval.
3. Recheck branch ancestry against current `main` before any future update; only then request merge review.
