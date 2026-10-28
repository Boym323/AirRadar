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

## Current recheck — 2026-10-28 19:03 UTC

The monitor remains active and waiting with `Persistent=yes` and
`RandomizedDelaySec=15s`. The JSONL now has 24 unique samples through
`2026-10-28T19:02:48.506Z`; the elapsed span is 2.08 hours, not 24 hours.
Using the merged journal-time calculation, there are 20 successful timer
events, 8 missing cadence slots, and 28 expected events: availability is
`71.43%` for this partial post-activation evidence. No duplicate timestamps
were found.

The current descriptive CPU/DB values remain: process CPU P50/P95/max
`14.5046% / 89.7898% / 100%`, RSS P50/P95/max `418045952 / 641462272 /
1193857024` bytes, event-loop P99 P50/P95/max `26.296 / 122.814 / 163.054 ms`,
maximum lock waiting `0`, and 24/24 DB-host CPU observations
`unavailable/not_configured`. Both PostgreSQL transaction deltas remain
unavailable because all 24 database `stats_reset` values are `null`; WAL
`stats_reset` remains stable at `2026-09-06T20:03:35.203Z`.

This recheck does not change the verdict: **INSUFFICIENT_EVIDENCE**, with the
24-hour endpoint still required at or after `2026-10-29T16:58:03.944Z`.

## Latest live recheck — 2026-10-28 19:04 UTC

The host clock is still before the required endpoint. The JSONL now contains
25 unique samples through `2026-10-28T19:03:53.984Z`, an elapsed span of
2.10 hours. The timer remains active/waiting with `Persistent=yes`. The
cadence-aware result is unchanged at `20 / 28 = 71.43%`; there are no duplicate
timestamps and eight timer-gap diagnostics.

Updated descriptive values: process CPU P50/P95/max
`14.5046% / 89.7898% / 100%`, RSS P50/P95/max `464785408 / 641462272 /
1193857024` bytes, event-loop P99 P50/P95/max `26.296 / 122.814 / 163.054 ms`,
maximum lock waiting `0`, PostgreSQL transaction deltas unavailable because
`stats_reset=null` in all 25 samples, and DB-host CPU unavailable in all 25
samples. Verdict remains **INSUFFICIENT_EVIDENCE**; no 24h PASS is claimed.

## Continuity evidence clarification — 2026-10-28

The report now treats continuity as an evidence state, not an assumption:

- `identityStatus=unknown` when samples do not contain a safe process identity;
  the report does not emit the identity value, PID, or another internal ID.
- `identityStatus=stable_observed` only when the supplied safe identity remains
  constant; a change is `restart_detected`.
- `stats_reset=null` is `unknown_stats_reset`. It is not classified as a reset,
  but it also cannot confirm counter continuity, so transaction deltas remain
  unavailable.
- A constant `stats_reset` plus non-decreasing counters is reported as
  `continuous_since_stats_reset`; a changed reset marker or decreasing counter
  is `reset_detected`.

PostgreSQL 17 documents `stats_reset` as the timestamp at which the statistics
were last reset and states that `pg_stat_database` counters are accumulated
since the last reset. The live `null` value therefore does not identify the
reset boundary; no stronger continuity claim is made. Reference: [PostgreSQL
17 cumulative statistics documentation](https://www.postgresql.org/docs/17/monitoring-stats.html).

The report also accepts explicit `startAt`/`endAt` bounds so the final audit can
select a real post-activation interval and report installation-era gaps
separately. The current host still has only 2.10 elapsed hours of data, so no
final 24-hour result is available.

## Continuity-aware live recheck — 2026-10-28 19:13 UTC

The JSONL now contains 31 samples in total. Selecting the explicit
post-activation window from `2026-10-28T18:40:04.847Z` through
`2026-10-28T19:13:07.362Z` yields 25 samples over 0.55 hours. The timer
timeline contains 25 successful events, 12 missing cadence slots, and 37
expected events, giving `67.57%` availability for this partial interval.

The report now records `identityStatus=unknown` because the safe process
identity is absent from all production samples; it does not infer process
stability. Both transaction counters report `unknown_stats_reset` and no delta
because `pg_stat_database.stats_reset` is `null`. Current post-activation
descriptive values are CPU P50/P95/max `14.5046% / 100% / 100%`, RSS
P50/P95/max `605687808 / 641462272 / 1193857024` bytes, event-loop P99
P50/P95/max `26.296 / 127.205 / 163.054 ms`, maximum lock waiting `0`, and
DB-host CPU unavailable for all 25 samples.

This remains **INSUFFICIENT_EVIDENCE**. The timer is still active; no clock,
restart, exporter, collector, authentication, database privilege, or timer
configuration change was made.

## Implementation and production recheck — 2026-10-28 19:32 UTC

The evidence-safe collector/report repair was merged to `main` in PR
[#1145](https://github.com/Boym323/AirRadar/pull/1145), merge commit
`fbd30d4`. CI
([40754803395](https://github.com/Boym323/AirRadar/actions/runs/40754803395)),
Monitoring validation
([40754803273](https://github.com/Boym323/AirRadar/actions/runs/40754803273)),
CodeQL
([40754803287](https://github.com/Boym323/AirRadar/actions/runs/40754803287))
and runtime load scaling
([40754803417](https://github.com/Boym323/AirRadar/actions/runs/40754803417))
passed. The deploy job was intentionally skipped; production still runs exact
commit `e6af8056123d2127b8a3268a182897e213465a37` (`1.0.570`).

The new collector persists only a SHA-256 fingerprint of the authorized
`application.startedAt` and `application.commit` diagnostic. It does not store
PID, secret, or diagnostic-store ID. The report now distinguishes observed
monotonicity from verified continuity and keeps counters unknown when
`stats_reset` is null. Its current live report has 40 samples through
`2026-10-28T19:30:47.849Z`, but those are pre-repair production samples and
therefore still have `identityStatus=unknown`; the report is
**INSUFFICIENT_EVIDENCE**, not PASS.

The current production canary was read-only and non-disruptive: `/api/version`
reported production commit `e6af8056`, `/api/health` reported application and
database `ok` with a fresh readsb update, and the timer remained `active/waiting`
with `RandomizedDelayUSec=15s`. No timer, PostgreSQL privilege, DDL, reset,
restart, or ingest interruption was performed.

The exact next step is to keep the existing timer running until a complete
post-merge window contains samples with the new fingerprint, corresponding
timer/service journal events, known or explicitly unknown statistics reset
boundaries, and no unaccounted interior gaps. Then run the bounded report over
explicit `startAt`/`endAt` boundaries and retain the final CPU, RSS,
event-loop, WAL, transaction, lock-wait, outage, and availability evidence.

## Post-deploy canary — 2026-10-28 19:37 UTC

The production deployment completed in CI run
[40755230952](https://github.com/Boym323/AirRadar/actions/runs/40755230952).
`/api/version` now reports production `1.0.571`, commit `fbd30d46`, and
`/api/health` remains `ok` with fresh local-beast/readsb ingest. The timer is
still `active/waiting` with `OnUnitActiveSec=60s` and
`RandomizedDelaySec=15s`.

The explicit read-only canary at `2026-10-28T19:37:19.771Z` produced a sample
with a 64-hex process fingerprint. The sample contains no PID or secret;
`pg_stat_database.stats_reset` is still `null`, while the WAL reset marker is
`2026-09-06T20:03:35.203Z`. This proves the repaired collector is live, but is
not a 24-hour result. The post-deploy window starts at this canary and remains
**INSUFFICIENT_EVIDENCE** until its complete 24-hour boundary and journal
coverage are available.

The approved T57 automation run
[40756019322](https://github.com/Boym323/AirRadar/actions/runs/40756019322)
did not produce a soak report: its authorized public-endpoint preflight ended
with `response_validation_failure`. This is an automation/diagnostic-contract
limitation, not evidence of an AirRadar ingest outage; the local production
canary above succeeded. The timer-backed monitor JSONL and its journal remain
the authoritative source for issue #1134 until the T57 endpoint contract is
repaired or an equivalent approved read-only automation is used.

Follow-up diagnosis found that the first failed run supplied the full production
SHA while `/api/version` intentionally exposes only the eight-character public
commit prefix. The authorized admin diagnostics validate correctly; that failure
was a soak commit-prefix direction check, not a telemetry or ingest outage. A
corrected read-only run
[40756361032](https://github.com/Boym323/AirRadar/actions/runs/40756361032)
was then started with the safe public prefix `fbd30d46`. It also did not yield a
24-hour report: its preflight stopped on the separate
`t58_operational_twin_forensics_disabled` contract limitation before collection.
This remains an automation limitation, not evidence of an AirRadar outage.
The exact production commit remains `fbd30d4682ac0ce348cafce20496410d463e8386`;
the monitor's own timer-backed JSONL and journal remain the authoritative
follow-up evidence source.
