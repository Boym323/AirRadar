# AirRadar — measured reduction of redundant runtime work (2026-10-18)

[Česky](../cs/agents/RUNTIME-REDUNDANT-WORK-2026-10-18.md)

> **Dated, task-scoped implementation brief, not a global policy.** Read the root [AGENTS.md](../../AGENTS.md) first. The current implementation, tested changes, and the latest verified SHA take precedence over this historical baseline. Use the [performance workflow](PERFORMANCE-WORKFLOW.md), [development](../DEVELOPMENT.md), and [runtime invariants](../RUNTIME-INVARIANTS.md). Where older performance documents mention branches/PRs, the current root AGENTS.md direct-`main` policy takes precedence.

## Objective

Reduce demonstrably unnecessary computation, copies/allocations, database work, and scheduling overhead in AirRadar without removing features or compromising correctness. This is **not** permission to disable network sources, history, predictive evidence, ATC, telemetry, protections, or diagnostic functionality. No speculative Rust rewrite or indiscriminate cleanup.

**Execution:** Inspect fresh `origin/main` and actual production identity first. Work in a non-serving checkout; make one independently verified change at a time and push tested, non-force commits directly to `main` under the repo's single-writer rules. A push may invoke existing automatic CI/CD. Do **not** manually deploy/restart, change production config/secrets, run heavy tests in the live checkout, or modify production DB without separate explicit authorization.

## Historical baseline: T58 #20 (do not mistake for current production)

- [GitHub Actions run 39132862866](https://github.com/Boym323/AirRadar/actions/runs/39132862866) — all seven chunks completed; `PASS_WITH_LIMITATIONS`.
- [Permanent sanitized summary](https://github.com/Boym323/AirRadar/blob/audit/t58-history/reports/t58/2026/10/18/run-39132862866-attempt-1/summary.md) — measured app `1.0.516`, SHA `fd19dbdd`; 61/61 valid, zero gaps, 3,602.094 s, one stable process.
- CPU interval P50/P95: **17.009 / 19.092%**; RSS P50/P95/max: **910.094 / 937.477 / 947.066 MiB**; heap P50/P95/max: **466.082 / 589.933 / 675.367 MiB**.
- Completed-window event-loop P99 P50/P95/max: **43.516 / 50.233 / 51.610 ms**; worst stall **1,184.891 ms**, one stall >1 s with **no proven synchronous blocker**.
- Post-major-GC trend: heap **+96.326 MiB**, old space **+78.233 MiB**, RSS **+48.262 MiB**. This is not proof of a leak.
- Inclusive/overlapping instrumented CPU attribution (approximately): `ingest.local-beast` **61.5 s**, `snapshot.network` **45.1 s**, `history.persist` **41.6 s**, `snapshot.network.ingest` **27.7 s**. Do not add nested paths together or treat async elapsed time as exclusive CPU.
- `snapshot.trail-update` had **3,731,544 calls** in completed windows: these are **aircraft trail updates**, not flight route-resolution calls.
- Limits: **zero SSE clients**, uncontrolled aviation workload, disabled cgroup CPU throttling controller, and no measured server-side SQL latency. T57 comparison is observational, not a controlled causal proof.

## Investigation and implementation work packages

These are **candidates, not findings of redundant work**. Prioritize by measured opportunity and cost of preserving invariants. Finish a verified small change before starting another.

### P0 — Network snapshot no-op and allocation audit

Inspect `lib/server/aircraft-state.ts` (`applyNetworkSnapshotCore`, `updateTrail`, continuity, source affinity, track fusion), `lib/server/network-failover-provider.ts` and corresponding tests.

- Measure distinct incoming identities, truly changed position/message/provenance, discarded stale records, map writes, object copies, track-fusion evaluation keys and live DTO invalidations per poll.
- Test a **conservative, evidence-backed unchanged-observation fast path**, only if it preserves freshness and arrival timestamps, source provenance/precedence, failover grace, mass-drop guard, trails, analytics, current-aircraft state, track fusion and SSE publication semantics.
- Do not equate unchanged ICAO with unchanged observation; do not skip expiry, position ageing, source transition or bound enforcement. Review previous optimizations to avoid duplicates.

### P1 — History persistence: avoid provably unnecessary work

Inspect `lib/server/aircraft-state.ts` (`queueHistory`, `drainHistoryQueue`, `persistHistoryCore`), `lib/server/history.ts`, `lib/server/history-statement-profiler.ts`, history sampling and DB tests.

- Measure candidates considered vs due positions, no-op maintenance calls, write batches, row counts, settlements, error/retry rate, queue depth and commit delay.
- Eliminate only **verified** duplicate conversions, repeated empty work or queries whose side effects are proven unnecessary; preserve first sightings, per-ICAO retry, ordered single-lane/coalesced writer, periodic maintenance and fail-soft DB behavior.
- Separate Prisma/client elapsed time from **server-side SQL latency**, which T58 did not measure. Do not add indexes or change production DB schema without authorization.

### P2 — Local BEAST ingest and trail hot path

Inspect current Rust parser/CRC24 and Node adapter before touching them. Measure decoded frames, allocations, object shape conversions, clone frequency and queue boundaries.

- Investigate whether existing native-to-JS conversions or trail-update work allocate when observations are unchanged, but preserve partial-frame parity, escaped bytes, provenance and non-ICAO identities.
- Record **per-call cost** and total contribution for `snapshot.trail-update` rather than using call count alone as proof of waste.
- Rust/C++ changes are admissible only after a stable same-workload A/B improvement **including FFI overhead**, with native/fallback parity and rollback.

### P3 — Residual stalls, memory and SSE evidence

- Independently investigate the 1.185 s tail stall with bounded event-loop/synchronous-ingest instrumentation; correlation alone does not establish GC, snapshot or DB as root cause.
- Analyze post-major-GC memory trend and retained data structures in isolated tests; no heap snapshots, forced GC, or sensitive dumps on production without separate approval.
- Add controlled **isolated** SSE client-load scenarios (e.g. 0/10/50) and make their effect on event-loop, CPU, allocations, bounded delivery and disconnect cleanup explicit; the historical T58 had 0 clients.
- Preserve read-only sanitized diagnostics. Do not expand production telemetry collection or enable throttling controllers just for this task.

## Evidence protocol and acceptance criteria

1. Before changing code, record current `main`/production SHA and re-check T58 evidence. Identify exact code owner and complexity/allocations. Label observations, hypotheses and unmeasured assumptions.
2. Capture a reproducible baseline on a **fixed synthetic/replay workload in isolated DEV/CI**: scenarios at representative small/medium/large aircraft counts, 0/10/100% changed aircraft, selected provider-lane combinations, cold/warm conditions and SSE 0/10/50 when relevant. Record Node/Rust version, hardware/runner, poll count, seed, active features and sample count.
3. Measure baseline/candidate using the **same** scenario, repeated runs with dispersion. Report throughput, CPU or CPU-ms/event, allocations bytes/event, RSS/heap (when applicable), GC, event-loop P95/P99/max and database settlement statistics. Keep overlapping instrumentation distinct.
4. Prove output/state parity with tests covering ICAO vs callsign, stale and missing positions, source affinity/MLAT priority, mixed provider data, trail retention, continuity guard, network-only RAM-only rule, history sampling/retry, 0 clients and slow/disconnecting SSE clients, alerts and optional-provider failures as relevant.
5. Run targeted tests, typecheck, lint, relevant feature/docs/visual/production gates and full tests when impact warrants. Inspect the full diff, release-scope classification and documentation EN/CZ impact before each push.
6. **KEEP** only when the benefit is reproducible above run-to-run noise and correctness/tails/security do not regress; otherwise **REWORK**, **REVERT**, or **NO_CHANGE**. Do not optimize just to generate a commit. Use a small direct-`main` commit only for independently validated work, then await exact-SHA CI/CodeQL/deploy result before another deployment-bearing commit.
7. Treat T58 as a post-deployment observational regression check, not a substitute for controlled A/B tests. Launch a new T58 only when deployment, admin auth and workflow permissions are verified and scheduling is explicitly authorized. Do not invent a PASS or perform a manual release without separate approval.

## Deliverables

For each candidate: (a) source locations and redundant-work proof, (b) side-by-side measured benchmark with p50/p95/p99 and uncertainty, (c) preservation/regression tests, (d) exact changed files and direct-`main` commit + CI link if justified, (e) rollback plan, (f) known limits and unproven claims. Provide a brief final Czech report with **PROKÁZÁNO / NEPROKÁZÁNO / NEOVĚŘENO**, and explicitly list candidates intentionally left unchanged.

**Stop conditions:** loss of output parity, incorrect freshness/source arbitration, leak of sensitive data, history/DB mutation risk, unreliable benchmark, CI/CodeQL failures or unapproved production operation. In any such case, leave production untouched and report the concrete blocker.
