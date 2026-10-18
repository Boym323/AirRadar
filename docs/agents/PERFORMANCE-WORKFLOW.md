# Performance agent workflow

[Česky](../cs/agents/PERFORMANCE-WORKFLOW.md)

This is the **current short workflow**. It complements, never overrides, [AGENTS.md](../../AGENTS.md), [development rules](../DEVELOPMENT.md) and [runtime invariants](../RUNTIME-INVARIANTS.md).

## Investigate before optimizing

1. Identify the exact owner and relevant tests; inspect current code and recent changes, not the whole repository.
2. Establish a measured baseline: commit, workload, sample count, versions, config, p50/p95/p99/max, CPU/RSS/heap/GC/event loop or DB/I/O metrics as applicable.
3. Distinguish observed root cause from hypothesis. CPU spikes and stalled event loop cannot be assigned to GC or a snapshot without evidence.
4. Change one bounded hot path at a time in an isolated branch. Preserve live/recorded identity, source precedence, history and privacy guarantees.
5. Run focused parity/regression tests, typecheck/lint as relevant and comparable before/after measurement. Rust/C++ rewrites require proven net benefit including boundary overhead and fallback parity.
6. State what was actually verified and what is unproven. Historical T58 runs are evidence for their original commit only; use [T58 procedures](../T58-PRODUCTION-SOAK.md) for fresh read-only measurement.

## Delivery boundary

Produce a small auditable PR with metric table, CI links, rollback risks and docs impact. No destructive database action, runtime configuration change, merge or deployment without explicit approval. Historical long-form prompts are indexed in [agent archive](README.md), not automatically loaded.
