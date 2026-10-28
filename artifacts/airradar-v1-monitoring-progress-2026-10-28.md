# AirRadar V1 monitoring — interim evidence for issue #1134

Date: 2026-10-28 (UTC)  
Production release: `1.0.570`  
Status: **OPEN — no valid 24-hour window yet**

This is a read-only evidence record. No production configuration, database
privilege, timer schedule, clock, or sample data was changed.

## Observed history

The live JSONL store contains 17 samples with unique `recordedAt` values:

| Item | Value |
|---|---|
| First sample | `2026-10-28T16:58:03.944Z` |
| Last sample at audit time | `2026-10-28T18:53:48.721Z` |
| Elapsed span | `1:55:44.777` |
| Required end for a 24-hour elapsed window from first sample | `2026-10-29T16:58:03.944Z` |
| Remaining elapsed time at audit time | `22:04:15.223` |
| Exact duplicate timestamps | 0 |
| Whole-host/PostgreSQL CPU samples | **unavailable** (`not_configured`) |

Observed gaps larger than the one-minute timer cadence (including the
configured 15-second random delay):

| From | To | Gap |
|---|---|---:|
| `16:58:07.421Z` | `17:45:31.549Z` | 47:24.128 |
| `17:45:31.735Z` | `18:40:00.884Z` | 54:29.149 |
| `18:43:48.964Z` | `18:45:36.239Z` | 1:47.275 |
| `18:47:54.636Z` | `18:49:28.252Z` | 1:33.616 |
| `18:50:48.782Z` | `18:52:36.258Z` | 1:47.476 |

The journal records a monitor process V8 fatal error at `2026-10-28T17:03:01Z`
(`status=5/TRAP`) and successful samples after the service became runnable
again. This is evidence of an outage in the monitoring sample stream, not a
claim about application availability.

The timer is observed as `enabled`, `active`, `waiting`, and `Persistent=yes`.
The actual trigger timestamps, rather than an idealized minute grid, must be
used for availability.

## Interim measurements (not a 24-hour result)

These values describe only the incomplete span above and must not be used as
the final issue conclusion:

| Metric | Interim value |
|---|---:|
| Process CPU P50 / P95 / max | 15.3817% / 89.7898% / 89.7898% |
| RSS P50 / P95 / max | 385.996 / 1138.551 / 1138.551 MiB |
| Event-loop P99 P50 / P95 / max | 26.296 / 122.814 / 122.814 ms |
| PostgreSQL commit delta | 31,130 |
| PostgreSQL rollback delta | 3 |
| WAL record delta | 387,500 |
| WAL byte delta | 257,178,560 |
| Maximum observed lock-waiting sessions | 0 |
| Maximum observed waiting sessions (all wait types) | 13 |
| Maximum idle-in-transaction sessions | 0 |

The deltas above are real counter deltas between the first and last available
sample, but are not 24-hour deltas. They must be recalculated for the final
validated interval. The database `stats_reset` field is `null` in all observed
samples; its reset time is therefore **unavailable**. WAL `stats_reset` is
stable at `2026-09-06T20:03:35.203Z` in all observed samples.

## Remaining verification requirement

Keep the existing timer and read-only monitor running without changing time or
creating samples. For a final result, retain the real samples through at least
`2026-10-29T16:58:03.944Z`, then validate the complete interval from the first
usable sample to the last usable sample. The final audit must account for every
missing interval and crash, reject duplicates, detect counter/statistics resets,
calculate the requested CPU/RSS/event-loop and PostgreSQL deltas for the same
validated interval, evaluate lock waits and rollbacks, and calculate
availability from actual timer/service timestamps. Host CPU remains
**unavailable** until a private authenticated exporter supplies it.

No final alert threshold has been accepted from this incomplete window.

## Safe database-host CPU monitoring proposal

Deploy a node exporter (or equivalent read-only host agent) on the database
host, bound only to a private management address or Unix socket. Scrape it from
an internal collector over mTLS/VPN or an allowlisted management network; do
not publish port 9100 or any exporter endpoint on a public interface. Restrict
the collector firewall to the collector's source address, keep exporter
metrics free of query text and credentials, and retain only aggregated CPU
metrics needed for the audit.

The AirRadar sampler should consume only `node_cpu_seconds_total` from that
private endpoint, with a short timeout and explicit `unavailable` status on
failure. This requires no PostgreSQL connection, SQL, extension, role, grant,
restart, or production database change. A separate host-level collector is
preferred to making the application account responsible for database-host
telemetry.

Recommended rollout gates are: private bind verified, firewall allowlist
verified, TLS/authentication verified, exporter endpoint absent from public
scans, one non-production scrape test, and then a production read-only scrape
with rollback consisting of removing the collector target. Until those gates
are met, PostgreSQL-host CPU remains **unavailable**.
