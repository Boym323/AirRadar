# PostgreSQL autocommit operation attribution

## Result

**FINAL ATTRIBUTION PASS — CANDIDATE IDENTIFIED**

The stable production process was measured for 30.00575 minutes. The final
instrumentation was already deployed; no redeploy or restart was performed.

## Git and production identity

- `HEAD`: `bbb2ca2fb0369e2709c58915c859198edd7f2dca`
- `origin/main`: `bbb2ca2fb0369e2709c58915c859198edd7f2dca`
- Production version/SHA: `1.0.221 / b19ba467`
- MainPID: `62111`
- Service start: `2026-09-29 19:57:09 CEST`

## Measurement

- Window: `2026-09-29T18:06:54.215Z` – `2026-09-29T18:36:54.560Z`
- Restart during window: **NO**
- Transaction diagnostics: `dbtx-mumzavc6-ejle1qs4`, PID `62111`
- Autocommit diagnostics: `dbop-mumzavc6-lc43ospm`, PID `62111`
- Both store IDs and the process identity were stable.
- System Status requests: `21` (`0.70/min`)

FlightPosition, Flight, Aircraft, and ReceiverCoverage persistence remain
children of explicit transactions, especially `history.snapshot`; they are
not counted again as autocommit operations.

## Autocommit lanes

| Lane | Kind/op | Attempts/min | Success/min | Failures/min | Avg ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| navigation.observation.create | WRITE/INSERT | 74.32 | 68.72 | 5.60 | 16.9 | 1009 |
| navigation.anomaly.upsert | WRITE/UPSERT | 37.26 | 37.26 | 0.00 | 5.4 | 785 |
| weather.observation.create | WRITE/INSERT | 35.49 | 35.49 | 0.00 | 203.6 | 1316 |
| aircraft-metadata.cache.lookup | READ/SELECT | 16.13 | 16.13 | 0.00 | 7.4 | 1005 |
| atc.dataset.load | READ/SELECT | 5.60 | 5.60 | 0.00 | 46.7 | 1018 |
| flight-intelligence.flight-link.query | READ/SELECT | 9.03 | 0.00 | 9.03 | 16.0 | 104 |
| system-status.db-health.query | READ/SELECT | 0.70 | 0.70 | 0.00 | 2.0 | 12 |
| system-status.airport-count.query | READ/SELECT | 0.70 | 0.70 | 0.00 | 64.7 | 126 |

All other registered autocommit lanes were zero during the natural-traffic
window. Flight Intelligence and History/API zeroes are valid when those
endpoints are not called. The Flight Intelligence flight-link failures are
application-level failed lookups, not persistence failures.

System Status consistency passed exactly: 21 requests produced 21 DB-health
queries and 21 airport queries, or 2.00 instrumented DB operations/request.
ATC was 5.60 operations/min versus the 1.40/min expected from System Status
alone; the shared ATC loader also has other callers, so this is not unexplained
PostgreSQL activity.

## PostgreSQL reconciliation

| Class | Rate/min |
| --- | ---: |
| PostgreSQL commits | 278.28 |
| PostgreSQL rollbacks | 5.63 |
| PostgreSQL transactions | 283.91 |
| Explicit transactions | 99.85 |
| Autocommit operations | 179.23 |
| Explained | 279.08 (98.30%) |
| Unexplained residual | 4.83 (1.70%) |

Navigation observation failures account for 168 failed autocommit attempts;
they are included once in the 5.60 failures/min and correspond to rollback
volume. System Status observer reads are included in the autocommit lanes, not
subtracted twice. The audit connection itself was a bounded measurement
observer; no unrelated production client was observed.

## Database and cost evidence

- Connections at end: 11 AirRadar client connections; the remaining local
  sessions were PostgreSQL/local observer sessions.
- Active AirRadar sessions: 1; idle: 10.
- Lock waits: 0; deadlocks: 0; long application transactions: 0.
- Service CPU: 30.15% of one core over the window.
- Service memory: 712,978,432 → 695,230,464 bytes.

The highest measured application lane by latency burden was
`history.snapshot` (95.52 explicit transactions/min at 429.0 ms average).
Among selectable autocommit candidates, `weather.observation.create` was
material at 35.49/min and 203.6 ms average, with no failures. Navigation
observation volume was higher, but its average operation was 16.9 ms and its
failure semantics require preserving isolation.

## Decision

**DESIGN WEATHER BATCH INSERT V1**

Expected benefit is design-only at this stage: potentially fewer write
round-trips and lower weather persistence latency, affecting approximately
35.49 operations/min. Risk is preserving durable observation semantics and
failure isolation; complexity is medium. No batching was implemented or
deployed in this measurement.

## Safety

Schema changed: NO. Migration: 0. Persistence semantics changed: NO.
Optimization deployed: NO.

AIRRADAR FINAL DB ATTRIBUTION PASS
