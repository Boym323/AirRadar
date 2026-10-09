# T4 production root-cause audit — 2026-10-09

This is a read-only T4.1/T4.2 production audit of deployed AirRadar
`1.0.379` / `9012aae9`. PRs #656 and #657 are ancestors of the deployed
commit. No restart, deployment, migration, database maintenance,
configuration change, inspector, profiler, SSE fan-out, or persistence change
was performed.

The audit confirms variable direct Health API latency and a 15-minute rollback
rate of 291.53/min, but it does not falsely attribute either to a specific
phase or lane. Public system status is sanitized; the phase and process-local
transaction metrics require an authenticated internal session that was not
available. See `T4-ROOT-CAUSE-REPORT.md` for implementation-specific actions.

All JSON files in this directory are sanitized and validated in CI locally.
