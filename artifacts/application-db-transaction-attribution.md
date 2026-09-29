# Application DB transaction attribution

## Result

**FINAL ATTRIBUTION PASS — CANDIDATE IDENTIFIED**

Production attribution passed the 95% gate at **98.30% explained** over an
uninterrupted 30.00575-minute window. The instrumentation release was already
running, so no deployment or restart was performed.

## Production

- Version/SHA: `1.0.221 / b19ba467`
- MainPID: `62111`
- Service start: `2026-09-29 19:57:09 CEST`
- Measurement: `2026-09-29T18:06:54.215Z` – `2026-09-29T18:36:54.560Z`
- Restart during window: **NO**
- Transaction store: `dbtx-mumzavc6-ejle1qs4`
- Autocommit store: `dbop-mumzavc6-lc43ospm`

Both diagnostics stores were process-global and stable on MainPID `62111`.

## PostgreSQL

| Metric | Rate/min |
| --- | ---: |
| Commits | 278.28 |
| Rollbacks | 5.63 |
| Transactions | 283.91 |

Fresh deltas were 8,350 commits and 169 rollbacks. Deadlocks were zero.

## Explicit transactions

Total: **99.85/min**, or **35.17%** of PostgreSQL transactions.

| Lane | Attempts/min | Commits/min | Failures/min | Avg ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| history.snapshot | 95.52 | 95.52 | 0 | 429.0 | 1350 |
| receiver.daily-stats | 1.83 | 1.83 | 0 | 391.6 | 906 |
| receiver.coverage | 0.53 | 0.53 | 0 | 499.3 | 1203 |
| receiver.advanced-stats | 1.97 | 1.97 | 0 | 506.7 | 870 |

FlightPosition is already covered by `history.snapshot`; Flight and Aircraft
updates and ReceiverCoverage writes are explicit transaction children and are
not double-counted.

## Autocommit writes

| Lane | Success/min | Failures/min | Avg ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| navigation.observation.create | 68.72 | 5.60 | 16.9 | 1009 |
| navigation.anomaly.upsert | 37.26 | 0 | 5.4 | 785 |
| weather.observation.create | 35.49 | 0 | 203.6 | 1316 |

## Autocommit reads

| Lane | Success/min | Failures/min | Avg ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| aircraft-metadata.cache.lookup | 16.13 | 0 | 7.4 | 1005 |
| atc.dataset.load | 5.60 | 0 | 46.7 | 1018 |
| flight-intelligence.flight-link.query | 0 | 9.03 | 16.0 | 104 |
| system-status.db-health.query | 0.70 | 0 | 2.0 | 12 |
| system-status.airport-count.query | 0.70 | 0 | 64.7 | 126 |

Other registered History/API and Flight Intelligence lanes were zero under
natural traffic; no artificial events were generated.

## System Status observer

System Status requests: **0.70/min**. Each request produced exactly one
DB-health and one airport query, hence **2.00 DB operations/request** and
**1.40 observer operations/min**. Those reads are already included in the
autocommit total.

## Reconciliation and gate

| Class | Rate/min |
| --- | ---: |
| PostgreSQL total | 283.91 |
| Explicit transactions | 99.85 |
| Autocommit operations | 179.23 |
| Explained | 279.08 (98.30%) |
| Unexplained | 4.83 (1.70%) |

**95% attribution gate: PASS.** The residual is within the allowed range for
rare unregistered calls, startup/boundary effects, and in-flight transactions.

## Database health

No lock waits, deadlocks, connection pressure, or long application
transactions were observed. Receiver, database, SSE, radar, weather,
navigation, coverage, and history health checks were operational; navigation
integrity remained degraded as an existing product diagnostic, not a database
failure.

## Decision

**DESIGN WEATHER BATCH INSERT V1**

This is a design candidate only. Weather writes measured 35.49/min at 203.6 ms
average and are material enough to justify design work. The next design should
preserve the current durable-observation policy, retry behavior, and failure
isolation. No optimization was implemented or deployed.

## Database safety

Schema changed: NO. Migration: 0. Persistence semantics changed: NO.
Optimization deployed: NO.

AIRRADAR FINAL DB ATTRIBUTION PASS
