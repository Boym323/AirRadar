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

## Evidence update — 2026-10-28 19:00 UTC

The earlier wording around the V8 crash is corrected by the system journal
timeline. The crash was **during the installation/release sequence, before the
repaired monitoring timer was activated**:

| Event | Local time | UTC | Evidence |
|---|---|---|---|
| Release of the initial monitoring commit `9cd5acb` | 17:59:59 | 16:59:59 | `release.sh` journal entry |
| V8 fatal error, `status=5/TRAP` | 18:03:01 | 17:03:01 | `airradar-cpu-db-monitor.service` journal |
| Release of timer/JIT repair `9417f52` | 18:05:40 | 17:05:40 | `release.sh` journal entry |
| Monitoring timer became active | 19:40:04 | 18:40:04 | `airradar-cpu-db-monitor.timer` journal |

The local-time labels above are from the host's `+01:00` journal output; the
UTC column is the authoritative comparison. Thus the V8 crash predates the
repaired timer activation by about 1 h 37 min. It is not evidence of a crash
after the repaired timer was active. The later successful samples are real
post-activation samples.

The report implementation now sorts and rejects duplicate `recordedAt` values,
identifies gaps using the configured `OnUnitActiveSec=60s` plus
`RandomizedDelaySec=15s` tolerance, reports process-identity changes as restart
evidence, refuses PostgreSQL counter deltas when `stats_reset` is absent/changed
or a counter decreases, and uses journal timer events for exact availability
when supplied. The sample-only fallback is explicitly labelled as an
inference.

Current read-only evidence contains 21 unique samples from
`2026-10-28T16:58:03.944Z` through `2026-10-28T18:59:16.594Z`, an elapsed span
of about 2.02 hours. The exact journal event set available to this report has
21 successful samples and one pre-activation V8 failure; that yields `95.45%`
event availability for this mixed installation/activation evidence, not a
24-hour availability result. There are no duplicate timestamps. The quality
status is **INSUFFICIENT_EVIDENCE** because the elapsed span is below 24 hours
and the sample stream contains large gaps.

The current CPU/DB report is descriptive only: process CPU P50/P95/max
`14.5046% / 89.7898% / 100%`, RSS P50/P95/max `417562624 / 641462272 /
1193857024` bytes, event-loop P99 P50/P95/max `25.723 / 122.814 / 163.054 ms`,
maximum lock waiting `0`, and PostgreSQL transaction deltas **unavailable**
because every observed database `stats_reset` is `null`. All 21 DB-host CPU
observations are `unavailable/not_configured`; no exporter was installed.

This is still not a final PASS. The 24-hour quality window requires actual
samples through at least `2026-10-29T16:58:03.944Z` (or a later complete
validated endpoint), plus the corresponding timer/service journal.

## Availability correction — 2026-10-28 19:02 UTC

Re-running the merged report against the live timer timestamps exposed one
more reporting defect: counting successful journal events alone falsely gave
100% post-activation availability. PR [#1139](https://github.com/Boym323/AirRadar/pull/1139)
now counts missing cadence slots between actual event timestamps. With
`OnUnitActiveSec=60s` and `RandomizedDelaySec=15s`, the current post-activation
evidence is:

| Quantity | Value |
|---|---:|
| Successful timer events | 19 |
| Missing timer slots | 8 |
| Expected timer events | 27 |
| Availability | **70.37%** |

The current JSONL contains 23 unique samples from
`2026-10-28T16:58:03.944Z` through `2026-10-28T19:01:41.005Z`, an elapsed span
of 2.06 hours. Quality remains **INSUFFICIENT_EVIDENCE**: this is not a 24-hour
quality window. Current descriptive metrics are process CPU P50/P95/max
`14.5046% / 89.7898% / 100%`, RSS P50/P95/max `418045952 / 641462272 /
1193857024` bytes, event-loop P99 P50/P95/max `26.296 / 122.814 / 163.054 ms`,
and maximum lock waiting `0`. PostgreSQL transaction deltas remain unavailable
because `stats_reset` is null in all 23 samples. DB-host CPU remains
`unavailable/not_configured` for all 23 samples.

The report now accepts optional start/finish timestamps for service duration;
duration is reported separately from trigger cadence. No production collection,
authentication, PostgreSQL privilege, timer configuration, or exporter was
changed.
