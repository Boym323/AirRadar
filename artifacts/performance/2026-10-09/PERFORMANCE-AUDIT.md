# AirRadar production performance audit — T1/T2 baseline

Measurement time: 2026-10-09 10:31:57–10:46:57 UTC. The local production
service was observed read-only. No service restart, deployment, migration,
configuration change, database write, inspector, or aggressive synthetic load
was used.

## Executive summary

No P0 incident was observed. The strongest signals are sustained process CPU
of 72.5–76.7%, RSS growth from about 956 MiB to 1.1 GiB during a five-minute
runtime sample, and a partial health probe with repeated slow responses and
timeouts. These are confirmed observations, but the audit does not establish
their cause.

Process physical-write accounting was low and stable in two of three windows
(0.429, 0.903, 0.917 MiB/min). This is not evidence that all historical write
pressure disappeared: it is process `write_bytes`, not physical device I/O,
and differs from the historical 74.2 MB/min reference in both unit convention
and measurement conditions.

## Method and environment

The existing `scripts/audit-process-io.mjs` sampled `/proc/<pid>/io` for three
independent five-minute windows and verified process start identity at both
ends. Runtime values were sampled approximately every 10 seconds. PostgreSQL
queries were read-only catalog/statistics queries with a 5-second statement
timeout. One ordinary SSE connection was observed for 25 seconds; no client
fan-out was created.

The measured process was `airradar.service`, PID 228018, with one AirRadar
Node process and 11 threads. It had zero systemd restarts and stable kernel
process identity. The production standalone process used AirRadar deployment
commit `e15e89a4`, Next.js 16.3.8, Node.js 22.23.3, PostgreSQL server 17.10,
four CPU cores and 10 GiB RAM. The service had started shortly before the
measurement (about 24 minutes before its end), which limits conclusions about
long-term memory behavior.

The checkout was advanced by an external repository update from `7a906753` to
`e15e89a4` during the audit. The audit branch was fast-forwarded to the latter
commit before staging artifacts; this is recorded explicitly in
`environment.json`.

## Measurements

| Area | Current result | Historical/reference | Confidence |
| --- | --- | --- | --- |
| Process `write_bytes` | 0.429 / 0.903 / 0.917 MiB/min; average 0.750 | 74.2 MB/min on 2026-09-29 (70.763 MiB/min) | Low for comparison; metric/traffic differ |
| Process `wchar` | 4.511–8.014 MiB/min; average 5.717 | None | Descriptive |
| CPU | 72.5–76.7%, p50 74.1% | None | Descriptive |
| RSS | 956–1117 MiB sampled; cgroup peak 1388.5 MiB | None | Descriptive; short window |
| DB transactions | 14,510 in 15 min = 967.33/min | 564.47/min on 2026-09-29 | Low; different windows |
| DB rollback counter delta | 3,859 in 15 min | None | Confirmed counter observation |
| DB cache hit ratio | 98.46% cumulative; 92.02% interval | None | Descriptive |
| DB deadlocks / lock waits | 0 / 0 at end; deadlock delta 0 | None | Good for this window |
| WAL | 80,965,914 bytes; 5.151 MiB/min | None | Descriptive |
| SSE single client | 32 snapshots / 25 s = 1.28/s; 19,032,916 bytes | None | Single-client only |

Readable I/O series:

```text
write_bytes MiB/min:  W1 0.429 ── W2 0.903 ── W3 0.917
wchar       MiB/min:  W1 8.014 ── W2 4.511 ── W3 4.626
RSS sample:           956 MiB ──────────────── 1117 MiB (5 min)
CPU sample:           72.5% ───────────────── 76.7%
```

## Database findings

The database grew by 9,371,648 bytes during the 15-minute interval. Relevant
end-state dead tuples were: `flightPosition` 614,477,
`receiverCoverageHourly` 10,500, `predictiveObservation` 7,617 and `flight`
8,979. Autovacuum was enabled, but detailed activity was not available from
the sampled statistics. `pg_stat_statements` was not installed and was not
installed for this audit; `track_io_timing` was off.

The transaction counters include reads and writes and cannot be attributed to
individual SQL operations without statement statistics. Rollbacks are an
absolute counter delta, not proof of failed application behavior by themselves.

## I/O and runtime findings

The process I/O sampler proved the PID did not restart. `cancelled_write_bytes`
was zero in all windows. `read_bytes` varied from 0.125 to 2.113 MiB/min,
while logical `rchar` was much higher, as expected. No separate block-device
physical-write statistic was collected.

RSS rose during the short sample and the process sustained approximately three
quarters of one CPU according to `ps`. This supports a P1 investigation, not
a claim of memory leak or CPU regression. Add bounded heap/RSS, GC pause and
event-loop lag telemetry before selecting a code-level optimization.

## SSE and API findings

The single SSE observation was intentionally bounded and is not a production
client census. Active clients, rejected connections, queue depth, changed
aircraft per update, fan-out and serialization counters were unavailable from
existing safe metrics.

A small health probe was stopped after 15 samples because it encountered two
approximately five-second timeouts and several 3–4.6 second responses. Since
the sample was incomplete and the probe itself could add load, no p50/p95/p99
is reported and no latency regression is declared.

## Prioritized findings and recommendations

1. **P1 — CPU/RSS:** instrument bounded runtime health and investigate event
   loop, GC and serialization cost in a controlled window. Do not enable the
   inspector in production by default.
2. **P1 — health responsiveness:** correlate proxy timing, event-loop lag,
   upstream readiness and database waits using existing diagnostics before
   changing code.
3. **P2 — rollback and dead tuples:** obtain approved statement-level
   attribution and DBA-owned autovacuum activity data; do not install
   `pg_stat_statements` or change PostgreSQL settings as part of this audit.
4. **P3 — observability:** expose sanitized, bounded active-SSE, fan-out and
   runtime metrics through the existing internal system-status boundary while
   preserving the repository's secret and receiver-coordinate redaction rules.

No percentage improvement is promised. The write-rate difference versus the
historical value is a comparison signal only, not an optimization result.

## Further T1–T5 stages

- **T1:** repeat I/O and DB windows after a full stable runtime, with an
  approved low-overhead path attribution method.
- **T2:** add or consume bounded runtime/event-loop/GC and SSE diagnostics;
  repeat API sampling only after responsiveness is understood.
- **T3:** correlate database statement classes, autovacuum and WAL with the
  application lanes in a read-only observation.
- **T4:** run controlled code changes in an isolated environment and compare
  same-traffic canaries; preserve live/SSE invariants.
- **T5:** production canary and rollback decision using the release procedure;
  deployment is explicitly outside this audit.

## Reproduction

```bash
AIRRADAR_AUDIT_PID=<airradar-node-pid> \
AIRRADAR_AUDIT_DURATION_MS=300000 \
node scripts/audit-process-io.mjs

node scripts/audit-performance-regressions.mjs report.json budgets.json
```

Database reproduction uses read-only `pg_stat_database`, `pg_stat_user_tables`,
`pg_locks`, `pg_stat_wal` and catalog queries with a short statement timeout.
Use the production release procedure only for releases; this audit performed
none.
