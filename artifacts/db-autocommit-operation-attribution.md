# PostgreSQL autocommit operation attribution

## Result

**ATTRIBUTION BLOCKED — instrumentation is implemented but not yet production-measured.**

The previous stable window explained 92.70% of PostgreSQL transactions. This
report corrects the source classification and records the follow-up lanes. A
release and fresh 5–10 minute canary were not run, so no new production rate
or 95% claim is made.

## Git and production identity

- `HEAD`: `a3345d04bf3cba4f1788853f0ff0c3c58e8d08eb`
- `origin/main`: `a3345d04bf3cba4f1788853f0ff0c3c58e8d08eb`
- Current public production: version `1.0.220`, SHA `740ddd03`
- Previous measured window: version `1.0.219`, SHA `06f8f7ba`, 30m47s

## Source classification correction

FlightPosition persistence is already covered by `history.snapshot` and is not
an uninstrumented autocommit source. The same explicit transaction owns
Flight updates, Aircraft persistence, and ReceiverCoverage writes. No child ORM
counters were added.

## Existing measured lanes

| Lane | Kind/op | Success/min | Avg ms | Max ms |
| --- | --- | ---: | ---: | ---: |
| navigation.observation.create | WRITE/INSERT | 70.39 | 24.2 | 2,910 |
| navigation.anomaly.upsert | WRITE/UPSERT | 40.77 | 8.4 | 1,135 |
| weather.observation.create | WRITE/INSERT | 44.85 | 228.2 | 3,207 |
| aircraft-metadata.cache.lookup | READ/SELECT | 20.82 | 11.9 | 3,190 |
| atc.dataset.load | READ/SELECT | 9.29 | 48.3 | 3,068 |

## Newly instrumented, pending production measurement

- `system-status.db-health.query` — Aircraft `SELECT id LIMIT 1`
- `system-status.airport-count.query` — Airport bounded count probe
- `flight-intelligence.airport-index.query` — Airport and AirportRunway reads
- `flight-intelligence.event.query` — FlightEvent read
- `flight-intelligence.flight-link.query` — Flight lookup before event persistence
- `flight-intelligence.event.create` — FlightEvent insert
- `history.list.query`, `history.flight-detail.query`,
  `history.aircraft-quick.query`, `history.aircraft-detail.query` — concrete
  History/API ORM reads

`readSystemStatus()` now increments a process-local in-memory request counter;
it creates no extra database query. Metadata sync remains startup/maintenance
classification and is not instrumented.

## Previous reconciliation

| Class | Rate/min |
| --- | ---: |
| Explicit transactions | 117.20 |
| Autocommit writes | 156.01 |
| Instrumented autocommit reads | 30.11 |
| Observer minimum | 1.04 |
| Explained | 304.36 (92.70%) |
| Unexplained | 27.66 (7.30%) |

## Decision

**ATTRIBUTION BLOCKED.** The implementation must be deployed and measured
before selecting exactly one optimization candidate. No optimization is
implemented or selected.

## Safety

Schema changed: NO. Migration: NO. Persistence semantics changed: NO.
Optimization deployed: NO.

AIRRADAR FINAL DB ATTRIBUTION BLOCKED
