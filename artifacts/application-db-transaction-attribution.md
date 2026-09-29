# Application DB transaction attribution

## Result

**AUTOCOMMIT ATTRIBUTION BLOCKED** — 92.70% explained; required gate is 95%.

The stable production window ran from `2026-09-29 18:54:14 CEST` to
`2026-09-29 19:25:01 CEST` (30m47s) on version `1.0.219 / 06f8f7ba`, MainPID
`53003`. The process, transaction store, and autocommit store remained stable;
there was no restart.

## PostgreSQL totals

- Commits: 10,108 (328.34/min)
- Rollbacks: 113 (3.67/min)
- Total transactions: 10,221 (332.02/min)
- Deadlocks: 0; lock waits: 0; long transactions: 0
- `pg_stat_statements`: unavailable

## Explicit transactions

| Lane | Commits | Rate/min |
| --- | ---: | ---: |
| history.snapshot | 3,478 | 112.98 |
| receiver.daily-stats | 53 | 1.72 |
| receiver.coverage | 16 | 0.52 |
| receiver.advanced-stats | 61 | 1.98 |
| All explicit lanes | 3,608 | 117.20 |

## Autocommit operations

Instrumented successes totaled 5,730 (186.13/min): navigation observations
2,167, navigation anomaly upserts 1,255, weather observations 1,381, metadata
reads 641, and ATC dataset reads 286. Navigation observation failures were 113;
all other measured lanes had zero failures.

Table deltas were plausible: navigation observation inserts 2,280, weather
observation inserts 1,379, and navigation anomaly insert+update changes 1,255.

## Reconciliation and decision

Explicit transactions contributed 117.20/min, instrumented autocommit writes
156.01/min, instrumented reads 30.11/min, and the bounded measurement observer
at least 1.04/min. Together these explain 304.36/min, or 92.70% of the fresh
PostgreSQL total. The remaining 27.66/min is untracked application activity.

The source audit identifies likely missing classes including FlightPosition
persistence and several route/status/catalog ORM reads. No optimization may be
selected until those paths are classified and attribution reaches 95%.

## Safety

Schema changed: NO. Migration: NO. Persistence semantics changed: NO.
Optimization deployed: NO. Deployment or restart during measurement: NO.
