# Codex context router

[Česky](cs/CODEX-CONTEXT.md)

This is a **navigation index, not a second policy file**. Read root [AGENTS.md](../AGENTS.md) first. Follow its safety and release rules. Open only the documents and code relevant to the specific task; do not load entire directories, generated feature lists, or historical reports.

## Task routing

| Task | Start with | Inspect live implementation |
| --- | --- | --- |
| BEAST/SBS ingest, CRC24, Rust | [Native addon](../native/airradar-native/README.md) | `native/airradar-native/`, relevant `lib/` adapters and parity tests |
| Aircraft state, ingest, SSE, event loop | [Data flows](DATA-FLOWS.md) and [runtime invariants](RUNTIME-INVARIANTS.md) | `lib/server/`, relevant `app/api/` handlers, tests |
| Historical storage, migrations, Prisma | [Development](DEVELOPMENT.md) | `prisma/contract.prisma`, `migrations/app/`, DB services |
| Integrations and provider restrictions | [Data sources](DATA-SOURCES.md) | the specific provider, config and tests |
| T58, load, CPU and GC measurements | [T58 guide](T58-PRODUCTION-SOAK.md) and [performance workflow](agents/PERFORMANCE-WORKFLOW.md) | changed measurement scripts and workflows |
| CI, production release, recovery | [Release](RELEASE.md) and [runbook index](operations/RUNBOOKS.md) | relevant `.github/workflows/` and `deploy/` code |
| UI, map, accessibility and browser | [Visual system](VISUAL-SYSTEM.md) | relevant `app/`, `components/`, translation keys and tests |
| Routes and feature ownership | [Feature registry](features.registry.json) | relevant `app/` route plus generated [FEATURES.md](FEATURES.md) section |

## Reading and reporting discipline

1. Find the owner with filenames and targeted searches (`rg --files`, `rg -n`); read only matching code blocks and document sections.
2. Source code and passing tests outrank stale prose. Documentation gives intended contracts, not proof of current deployment.
3. Never treat an old benchmark, commit, PR, tag or report's "currently running" status as live. Verify fresh GitHub/production evidence, with timestamps, only when authorized.
4. Use `git log -- <path>` or a targeted search instead of reading the full `CHANGELOG.md` (~400 KB); similarly avoid loading the full generated `FEATURES.md` unless necessary.
5. For performance changes, record baseline and candidate under comparable load, tail latency, regressions and limitations. A microbenchmark is not a production speedup.
6. Before a direct `main` commit, run targeted checks and the [documentation impact review](operations/RUNBOOKS.md); update corresponding Czech pages. Follow [development boundaries](DEVELOPMENT.md). An authorized verified push intentionally starts CI/CD; manual release and production config changes need separate approval.

## Sources of truth

[Architecture](ARCHITECTURE.md) defines ownership; [invariants](RUNTIME-INVARIANTS.md) define hard contracts; [development](DEVELOPMENT.md) defines agent workflow; [release](RELEASE.md) defines production actions. [Decisions](decisions/README.md) record enduring rationale. Reports in `artifacts/`, `docs/audits/`, `docs/research/` and dated performance files are **historical evidence**, not a live operations dashboard.
