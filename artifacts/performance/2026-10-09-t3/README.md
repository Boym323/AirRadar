# AirRadar T3 production performance verification

Read-only production verification performed 2026-10-09. Production contained
PRs #649, #650, #651 and #652 before measurement. No deployment, restart,
configuration change, migration, VACUUM/ANALYZE, inspector, extension or
synthetic fan-out was used.

The full report is [T3-PERFORMANCE-REPORT.md](./T3-PERFORMANCE-REPORT.md).
All JSON files in this directory are machine-readable and anonymized.

The audit branch is intentionally separate from `main`; the PR is draft when
any requested metric remains unavailable or comparison conditions are not
equivalent.
