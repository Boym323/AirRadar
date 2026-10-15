# AirRadar Optimization Progress

## Current State
- Date: 2026-10-15 (Europe/Prague)
- Base `main` SHA: `551158a656054831135f0f57c0672e69433dca1b` (metadata-only #924 after #923).
- Last read-only production version: `1.0.467 / 108f7bf8` from Integration Health #38791343776; not a controlled performance soak of this branch.
- Active branch: `perf/bounded-live-enrichment-20261015`.
- Last fully validated integrated SHA: **NOT YET VERIFIED**; full release-preview and CodeQL Security pending.
- Production service, database, secrets, flags, provider I/O and deployment: unchanged.

## Previously Completed
- PR #895/#899/#902/#906: ATC, network trails, Navigation Integrity, history and Operational Twin optimizations; see their PRs for constraints.
- PR #917: bounded route telemetry and stale fallback retention. Independent pre-merge benchmark `record()` median 749.3 → 599.8 ns/event (not a production speedup). Merged.
- PR #920: independently opted-in network providers and HTTP-only polling. Merged.
- PR #923: remove per-overlap allocation and measure unique fresh network positions. Merged; production runtime speedup not measured.
- Latest fully archived T58 before #920/#923: [1.0.464 soak #38775992637](https://github.com/Boym323/AirRadar/actions/runs/38775992637), 61/61 valid, CPU P50 20.0%, RSS P50 910.9 MiB, worst event-loop stall 5,154.8 ms. Workload differs from older runs.

## In Progress: bounded metadata scheduling and startup audit integrity
- **Observed code cost:** `aircraft-state.ts` scheduled a Promise for *every* enrichment candidate at once, despite stricter provider limiters. A network snapshot with thousands of aircraft could allocate thousands of waiting tasks. `network.metadata` was measured at ~24.85 s inclusive attributed CPU across 990 calls in the pre-#920/#923 T58 (no causality claim for promises alone).
- **Change:** `mapBounded`/`mapSettledBounded` schedule at most 24 pending metadata tasks, preserving positional order, success/failure handling, notification timing, caller metadata freshness guard and upstream limits. Existing provider limiter of six remains unchanged.
- **Additional low-risk change:** one immutable ADSBHub SBS merge-field list is now reused rather than allocated for each parsed line; no network behavior change intended.
- **Diagnostic correctness:** Integration Health returns `NOT VERIFIED` when no completed valid event-loop window exists (previously could incorrectly report `VERIFIED HEALTHY` shortly after restart).
- **Tests:** `tests/bounded-batch.test.ts` covers 480 and 2,048-item workloads, concurrency, ordering and partial failures; `tests/integration-audit.test.mjs` covers missing, invalid, and valid windows.
- **Benchmark:** `npm run benchmark:bounded-enrichment` compares an isolated 4,000-task unbounded reference with 24-worker implementation for elapsed time, instantaneous heap delta and peak scheduled work. **Benchmark output not yet measured**. This is not a production-load result.
- **No Rust/Go/WASM port:** current changes eliminate Node scheduling/heap overhead. A native implementation would still need to dispatch JS provider promises and marshal complex Aircraft objects; no reproducible net benefit has been shown. Reconsider only after profiling a self-contained CPU-bound numeric kernel against optimized JS including FFI/copy overhead.

## Blocked or Not Verified
- Production Route Cache P95/connection wait vs PostgreSQL lock/server time: not isolated; issue #822. No SQL, pool, schema or timeout changes made.
- Multi-second event-loop stalls and post-major-GC old-space growth: cause unproven; issue #908. No heap snapshots or host changes.
- Real-world SSE fanout, ATC geometry canary, new network exclusive-value distribution and after-release CPU/RSS: NOT VERIFIED.
- A new matching 60-minute post-#923 soak is needed before claiming global speedup.

## Decisions
- Keep behavior and data contracts fixed; use limited workers before considering worker threads or a new language.
- No speculative DB batch transaction, provider retry, request cadence or admission limit changes.
- Preserve full CI/typecheck/browser/performance/CodeQL and separate CodeQL Security gates.

## Pull Requests
- Pending draft PR for this branch; no merge or deploy authorized.

## Next Actions
1. Validate focused bounded scheduling and Integration Health regression tests on the branch.
2. Complete exact-SHA release-preview CI, CodeQL analysis and the **separate** CodeQL Security check.
3. Run/inspect isolated benchmark; state trade-offs instead of claiming end-to-end speedup.
4. After human review, schedule a stable post-#923 production soak and correlate DB/GC/event-loop evidence.
5. Only after profiling consider the next hot path (network publication or history SQL).
