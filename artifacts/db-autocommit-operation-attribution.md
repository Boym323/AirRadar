# PostgreSQL autocommit operation attribution V1

## Result

**AUTOCOMMIT ATTRIBUTION BLOCKED.** The committed registry was measured in
production, but it explains only 92.70% of PostgreSQL commits, below the
required 95% gate. No optimization was selected or implemented.

## Stable production window

- Start: `2026-09-29 18:54:14 CEST`
- End: `2026-09-29 19:25:01 CEST`
- Duration: 30m47s, uninterrupted
- Version/SHA: `1.0.219 / 06f8f7ba`
- MainPID/process: `53003`
- Transaction store: `dbtx-mumwww8a-zfs56zn`
- Autocommit store: `dbop-mumwww8b-mys50qou`
- Restart during window: NO

## Measured lanes

| Lane | Kind/op | Attempts | Success | Failures | Success/min | Avg ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| navigation.observation.create | WRITE/INSERT | 2,280 | 2,167 | 113 | 70.39 | 24.2 | 2,910 |
| navigation.anomaly.upsert | WRITE/UPSERT | 1,255 | 1,255 | 0 | 40.77 | 8.4 | 1,135 |
| weather.observation.create | WRITE/INSERT | 1,381 | 1,381 | 0 | 44.85 | 228.2 | 3,207 |
| aircraft-metadata.cache.lookup | READ/SELECT | 641 | 641 | 0 | 20.82 | 11.9 | 3,190 |
| atc.dataset.load | READ/SELECT | 286 | 286 | 0 | 9.29 | 48.3 | 3,068 |
| receiver.reception-record.query | READ/SELECT | 0 | 0 | 0 | 0 | — | — |

`navigation.history.query` and `weather.observation.query` were legitimately
zero during this natural-traffic window.

## Table cross-check

- Navigation observations: 2,280 table inserts; the 113 failed attempts
  correspond to PostgreSQL rollbacks.
- Weather observations: 1,379 table inserts vs 1,381 successes; two writes
  were in flight at the final snapshot, so the agreement is plausible.
- Navigation anomalies: 1,255 diagnostic upserts vs 1,255 insert+update table
  changes.

## Reconciliation

| Class | Rate/min |
| --- | ---: |
| Explicit transactions | 117.20 |
| Autocommit writes | 156.01 |
| Instrumented autocommit reads | 30.11 |
| Bounded observer minimum | 1.04 |
| PostgreSQL total transactions | 332.02 |
| Explained | 304.36 (92.70%) |
| Unexplained | 27.66 (7.30%) |

`pg_stat_statements` is unavailable. Source audit found uninstrumented
production ORM paths, including FlightPosition persistence and route/status/
catalog reads. These must be classified and instrumented before a valid 95%
attribution claim. The current result is blocked, not a candidate selection.

## Safety

No schema or migration changes, persistence changes, cadence changes,
optimization, deployment, or restart occurred during measurement.
