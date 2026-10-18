# Operations and verification index

[Česky](../cs/operations/RUNBOOKS.md)

Use this index to find the **existing authoritative procedure**, never as authorization to operate on production. Root [AGENTS.md](../../AGENTS.md) and [release procedure](../RELEASE.md) take precedence.

## Choose a procedure

| Situation | Primary source |
| --- | --- |
| Production release, rollback and preflight | [Release](../RELEASE.md) |
| Outage, restore and data integrity | [Recovery](../RECOVERY.md) |
| T58 read-only measurement and canary | [T58 production soak](../T58-PRODUCTION-SOAK.md) |
| Agent performance investigation | [Performance workflow](../agents/PERFORMANCE-WORKFLOW.md) |
| Optional integration failures | [Data sources](../DATA-SOURCES.md) |
| Runtime safety contracts | [Runtime invariants](../RUNTIME-INVARIANTS.md) |

## Documentation impact review

When application code changes, run `node scripts/docs-impact-check.mjs --base <merge-base-sha>`. It prints task-scoped **advisories**, including possible EN/CZ drift, and writes a GitHub step summary in CI. It never edits files and is not a substitute for `npm run docs:check`, `npm run features:check` or a human review of semantic correctness. Historical reports (including previous T58 results) are read-only evidence; always verify current commit and permissions before taking action.
