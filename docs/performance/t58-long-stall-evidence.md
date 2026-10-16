# T58 long-stall evidence (opt-in)

The 60-minute T58 #38887158312 sampled a 4.94 s maximum event-loop delay
despite much better routine CPU and p99 statistics. One-minute inclusive hot
paths cannot identify a causal call stack and the 0 SSE-client workload is a
limitation. No Rust or SQL rewrite is justified by those observations alone.

## Safe deployment gate

Default: OFF. Set `AIRRADAR_STALL_EVIDENCE_ENABLED=1` only for a bounded,
operator-approved controlled diagnostic and restart through the normal release
gate. The feature adds **one unref'd 1-second heartbeat** and a bounded ring of
slow (>25 ms) synchronous, allowlisted code scopes. A heartbeat arriving at
least 1,000 ms late produces a report: timestamp, overshoot, CPU usage averaged
over the heartbeat interval, and at most one completed synchronous scope
covering at least half the late period. Records are limited to 24 recent stalls
and 64 recent spans. No payload, aircraft identity, raw URL, coordinate, stack
trace, SQL query, heap snapshot, or on-disk event log is collected.

The authenticated `/api/system/runtime-performance` response adds
`stallEvidence.status`, `totalStalls`, and `recentStalls`.
Public /system/status output is unchanged. A temporal overlap is **not**
a causal stack trace; a GC pause, scheduler suspension, native work, or a scope
without instrumentation can remain `unattributed`. An idle or starved timer
may report delayed polling; the event-loop monitor remains the independent
reference.

### Validation

Run `npx vitest run tests/runtime-stall-evidence.test.ts tests/runtime-health-observation.test.ts`,
then typecheck, lint and CI. Do not silently enable the flag during a release.
If overhead or tail latency regresses, remove the flag, restart normally and
compare a matched-workload T58; the default (disabled) path adds no timer.
Memory retention diagnosis still requires longer read-only observation and a
separately approved offline heap profile before claiming a leak.

[Česká verze](../cs/performance/t58-long-stall-evidence.md)
