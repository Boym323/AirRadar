# AirRadar — T3 production performance verification

## Decision

**PASS WITH LIMITATIONS.** Production was verified on commit `a93802329e5329509cf81d651e03185c689ce32e` (version `1.0.377`) and contains PRs #649–#652. No deployment or runtime mutation was performed.

## Summary

| Area | Before T3 | After T3 | Change | Rating |
|---|---:|---:|---:|---|
| CPU | 72.5–76.7% | 42.5–111.4%, avg 83.4% | Higher observed, different traffic | INCONCLUSIVE |
| RSS | 956–1117 MiB | 1089–1217 MiB | Higher observed, short window | INCONCLUSIVE |
| DB transactions | 967.33/min | 1084.0/min | +12.1% | INCONCLUSIVE |
| DB rollbacks | 257.27/min | 299.0/min | +16.2% | INCONCLUSIVE |
| WAL | 5.151 MiB/min | 5.923 MiB/min | +15.0% | INCONCLUSIVE |
| Health API | Timeouts/slow responses | 30/30 HTTP 200, p95 2.604s | Reliability improved | IMPROVED |
| SSE V1 sample | 19,032,916 B/25s | 22,383,869 B/25s | +17.6%, 40 vs 32 snapshots | INCONCLUSIVE |
| SSE V2 sample | unavailable | 5,797,596 B/25s, 1 snapshot + 55 deltas | New protocol sample | INCONCLUSIVE |
| process write_bytes | 0.750 MiB/min | 0.771 MiB/min (0.444–0.938) | +2.8% | STABLE |

## Findings

Health reliability is materially better: all 30 sequential requests returned HTTP 200 and no timeout or 503 occurred. It is not evidence of low server latency: the p95 was 2.604 seconds, and the public response does not separate readiness, database and ATC phase time.

CPU and RSS remain high observations, not proven regressions. The current sample had different local/network traffic and no production-wide client census. The 15-minute PostgreSQL sample recorded 16,294 transactions, 4,489 rollbacks, 5.923 MiB/min WAL, zero deadlocks and zero waiting locks at the endpoint. Aggregate rollback counters do not identify causes.

The V1 SSE sample delivered 40 snapshots and 22.38 MB in 25 seconds to one client. Active clients, V1/V2 distribution, coalescing, rejected connections and serialization/fan-out counters were unavailable because the public system-status boundary redacts process-local values. No synthetic fan-out was created.

## Recommended next work

1. Highest priority: correlate health proxy timing with the existing internal phase measurements and event-loop pressure.
2. Repeat CPU/RSS after stable multi-hour uptime with authenticated bounded runtime telemetry.
3. Add approved DB statement/lane attribution and DBA-owned autovacuum evidence before changing `flight` updates or transaction behavior.
4. Expose sanitized process-local SSE counters through authenticated system status, then measure V1/V2 and fan-out under representative existing clients.

Raw values and unavailable metrics are in the JSON files beside this report. No secrets, private addresses or raw logs are included.
