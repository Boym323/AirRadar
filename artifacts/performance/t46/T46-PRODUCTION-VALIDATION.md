# AirRadar — T4.6 production performance validation

## Decision

**PASS WITH LIMITATIONS.** The deployed build is the #666 release and the
public production path remained healthy during this read-only audit. The
parallel DB/ATC implementation is present in the deployed commit, but its
phase-level production improvement cannot be proven without the authenticated
process-local telemetry. CPU/RAM root causes and PostgreSQL rollback causes
also remain unconfirmed.

No deployment, restart, migration, configuration change, profiler, inspector,
database maintenance, or synthetic SSE fan-out was performed.

## A — production version and continuity

| Item | Observation |
|---|---|
| Checkout `main` SHA | `6a8d7536dfa0d3f45d6114d3579e3650060ac4e9` |
| Production SHA | `218caff5261166f1d7f3291dbf00bfd054212c52` |
| Production version | `1.0.382`, channel `production` |
| Build time | `2026-10-09T14:53:08Z` |
| Production process | Uptime increased from 114 s at the first probe to 271 s at the final probe; PID is redacted/unavailable publicly |
| #661 | Present as ancestor `274b18b6` |
| #662 | Present as ancestor `68ca33d3` |
| #666 | Deployed commit `218caff5` |
| PostgreSQL | Public health/status reported `ok` throughout sampled probes |
| ADS-B ingest | `readsb` live; snapshot age 2–3 s; aircraft count 72–79 |
| ADSB.lol | Enabled/`ok`, zero consecutive failures in sampled status |
| SSE V1 | HTTP 200, snapshot events received |
| SSE V2 | HTTP 200, initial snapshot and delta events received |

The production commit is intentionally recorded separately from the current
checkout because the running service is the audit target.

## B — diagnostic access

The existing routes were verified. `/api/system/runtime-performance` and
`/api/system/runtime-history` returned HTTP 401 with `auth_required` without an
authorized watchlist session. `/api/system/status` was available only in its
sanitized public projection; process-local fields were zeroed or null.

The source confirms that these routes require the existing watchlist session.
No cookie, token, or password was available or obtained, and authentication
was not bypassed. Therefore the following are **BLOCKED**, rather than
reconstructed from indirect timing:

- `health.total`, `health.ready`, `health.snapshot`, `health.database`, and
  `health.atc` phase distributions;
- process CPU, RSS, heap, cgroup memory, event-loop lag, and GC pauses;
- active V1/V2 client counts, coalescing, SSE serialization counters, and
  metadata/trail cache sizes;
- process-local DB transaction and autocommit lane attribution.

## C — public Health API measurement

Three independent HTTPS windows were sampled on 2026-10-09, with ten
sequential requests per window at approximately one-second spacing. These are
end-to-end public HTTPS timings; they are not phase timings and must not be
added together.

| Window | Count | HTTP 200 | Timeouts/errors | Average | p50 | p95 | p99 | Maximum |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 10 | 10 | 0 | 971 ms | 210 ms | 2,118 ms | 2,118 ms | 2,118 ms |
| 2 | 10 | 10 | 0 | 714 ms | 421 ms | 1,610 ms | 1,610 ms | 1,610 ms |
| 3 | 10 | 10 | 0 | 1,289 ms | 1,222 ms | 2,420 ms | 2,420 ms | 2,420 ms |

The result confirms reliability for this short sample, but it does not prove a
latency improvement over the historical T4 values (`p95 2,215 ms` direct
backend and `392 ms` public HTTPS), because the old paths, load, and sampling
conditions are not reproducibly paired with this run. The current public
sample's p95 is between 1,610 and 2,420 ms; it is not evidence for or against
the parallel probe change at phase level.

## SSE validation

Read-only public connections were held for approximately nine seconds:

| Protocol | Bytes | Events observed |
|---|---:|---|
| V1 | 9,572,991 | 19 snapshots |
| V2 | 1,865,597 | 1 snapshot, 20 deltas |

Both protocols delivered data successfully. These are single-client samples,
not a fan-out benchmark, and the large V1/V2 payload difference is not a
root-cause measurement because traffic state and delta composition differ.

## D — PostgreSQL

**BLOCKED for the requested 15-minute measurement.** Public health/status only
established connectivity and did not expose PostgreSQL commit/rollback
counters, connections, deadlocks, lock waits, statement frequency, or lane
outcomes. No production database credentials or host access were supplied.

The repository review confirms that the current diagnostics are intentionally
process-local and bounded:

- explicit transaction lanes are recorded by `trackDbTransaction`;
- autocommit candidates are recorded by `trackDbOperation`;
- failure families are conservative (`timeout`, `constraint`, `conflict`,
  `connection`, `other`, `unknown`);
- `scripts/reconcile-db-rollbacks.mjs` is candidate reconciliation, not a
  complete PostgreSQL rollback attribution source.

Accordingly, no lane is blamed for the historical rollback rate of
291.53/min or 29.42%. The prior audit's table-write context remains context,
not attribution.

## E — runtime root-cause assessment

No confirmed CPU/RAM root cause was found. The public status response did not
expose the runtime counters needed to test the requested hypotheses:

- repeated aircraft snapshot processing;
- per-client SSE serialization/fan-out;
- unnecessary database writes;
- allocation or GC pressure;
- unbounded caches or object accumulation.

The live system did show a bounded local snapshot and active ingest during the
audit. That establishes continuity, not a causal explanation for historical
CPU/RAM pressure.

## F — optimizations

No performance optimization was implemented. The evidence threshold for a
safe targeted change was not met, and speculative changes could alter history
sampling, ADS-B accuracy, SSE compatibility, or failure isolation. No database
migration or public API change is proposed by this audit.

The next safe step is an authorized read-only telemetry session covering one
15-minute database window and the same three health windows, followed by lane
comparison using matching process identity and timestamps. Only a confirmed
lane should receive a targeted coalescing or write-reduction change.

## Limitations and completion state

- The audit was performed against the live public service, not a local clone.
- The production process restarted shortly before the first observation (the
  reported uptime was 114 s), so long-uptime memory conclusions are invalid.
- Public HTTPS timing cannot distinguish proxy, Node event-loop, snapshot,
  database, or ATC time.
- No authorized admin session, host metrics, `pg_stat_statements`, or direct
  PostgreSQL statistics were available.
- No deployment, restart, migration, or external state change was made.

T4.6 status: **PASS WITH LIMITATIONS**. The release and live paths are
validated; the requested internal root-cause attribution is explicitly
blocked by missing authorized diagnostic access.
