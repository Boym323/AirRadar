# Agent guidance index

[Česky](../cs/agents/README.md)

Root [AGENTS.md](../../AGENTS.md) is the only global instruction entry point. Use [Codex context router](../CODEX-CONTEXT.md) for selective reading.

## Canonical task workflow

- [Performance engineering workflow](PERFORMANCE-WORKFLOW.md): short, reusable instructions for CPU, memory, SSE, Rust and T58.
- [Development rules](../DEVELOPMENT.md): direct `main` commits, single-writer integration, measurements, tests and release boundaries.
- [Direct-main consolidation plan](AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md): refactor priorities, public diagnostics and verification.
- [2026-10-18 active task: remove redundant runtime work](RUNTIME-REDUNDANT-WORK-2026-10-18.md): T58-evidenced P0–P3 investigation and same-workload A/B acceptance; open only for this task.

- [2026-10-18 active task: retire unused data sources and features](DATA-FEATURE-RETIREMENT-AUDIT-2026-10-18.md): consumer graph, production evidence, deletion safety and measured savings; open only for this task.

- [Approved 2026-10-18 feature retirements — execution plan](APPROVED-FEATURE-RETIREMENT-2026-10-18.md): approved 15-item removal scope, dependency-aware batches and exact safety/verification gates; open only when performing this task.

- [Round 2 cleanup decisions (2026-10-18)](CLEANUP-ROUND2-2026-10-18.md): verified removals, measured artifact delta, active experimental consumers and remaining benchmark gates; open only for continued cleanup.

- [Round 3 radar map cleanup (2026-10-18)](CLEANUP-ROUND3-2026-10-18.md): deployed ATC/Navigation Integrity optimizations, exact tests and next measured candidates; open only for continued cleanup.

## Preserved historical briefs

The following detailed prompts are **dated historical task briefs**, not mandatory context for every run: [autonomous performance brief](AIRRADAR_PERFORMANCE_AGENT.md) and [2026-10-17 audit assignment](AirRadar_zadani_kompletniho_vykonnostniho_auditu_a_optimalizaci_2026-10-17.md). Consult a specific section only when revisiting that investigation; verify all versions and claims.
