# AirRadar Post-Archive DB Baseline V2

## RESULT

**A — NO MATERIAL DB OPTIMIZATION CURRENTLY JUSTIFIED**

## WINDOW

- Start: `2026-09-30T11:40:46.886Z`
- End: `2026-09-30T11:55:47.254Z`
- Duration: `15.0061 minutes`
- Traffic: natural production traffic; no synthetic load.
- End context: 82 local aircraft; local Beast + JSON failover healthy; PostgreSQL healthy.
- Production build: `1.0.229`, commit `f12940e0`, PID `116274`.

## DATABASE

| Metric | Observed |
|---|---:|
| Transactions/min | 560.04 |
| Commits/min | 551.09 |
| Rollbacks/min | 8.93 |
| Inserts/min | 453.48 |
| Updates/min | 377.05 |
| Deletes/min | 2.67 |
| WAL | 4.13 MB/min |
| Database size (end check) | 1,949 MB |

The WAL delta was 64,963,366 bytes. The audit did not enable `pg_stat_statements`; SQL statement attribution therefore remains source- and process-diagnostics-based, without invasive logging.

## TOP WRITERS

| Table | INSERT/min | UPDATE/min | DELETE/min | HOT % | Dead tuples | Size |
|---|---:|---:|---:|---:|---:|---:|
| Flight | 5.26 | 205.18 | 0.00 | 2.60% | 19,410 | 57 MB |
| FlightPosition | 204.25 | 0.00 | 0.00 | n/a | 438 | 914 MB |
| AircraftWeatherObservation | 106.16 | 0.00 | 0.00 | n/a | 178 | 228 MB |
| NavigationIntegrityObservation | 121.15 | 0.00 | 0.00 | n/a | 854 | 273 MB |
| NavigationIntegrityAnomaly | 9.33 | 39.85 | 0.00 | 50.50% | 2,715 | 36 MB |
| ReceiverCoverageHourly | 0.00 | 107.82 | 0.00 | 100.00% | 8,778 | 22 MB |
| Aircraft | 0.20 | 12.00 | 0.00 | 100.00% | 1,114 | 5.7 MB |
| ReceiverDailyAircraft | 2.33 | 2.80 | 0.00 | 100.00% | 2,316 | 8.9 MB |
| ReceiverDailyStats | 0.00 | 3.87 | 0.00 | 100.00% | 15 | 80 kB |
| ReceiverDailyCoverage | 0.00 | 0.93 | 0.00 | 100.00% | 105 | 168 kB |
| ReceiverDailyCoverageAltitude | 0.00 | 0.27 | 0.00 | 100.00% | 129 | 384 kB |

## AIRCRAFT

Observed `Aircraft` update rate: **12.00/min**. Suppression remains effective and passes the expected ~10–15/min range. HOT is 100%. No change made.

## FLIGHT

Observed `Flight` update rate: **205.18/min**. Source review shows one normal open-Flight update per persisted aircraft snapshot, inside the history transaction, plus occasional close/create work for callsign changes or continuity breaks. The rate tracks the FlightPosition persistence rate and is not evidence of a clearly redundant same-iteration write. Changed-field suppression was not implemented; Temporal.Instant semantics were preserved.

## FLIGHTPOSITION

Observed `FlightPosition` rate: **204.25 inserts/min**. This is the active persistence cadence under natural traffic. The adaptive shadow remained observational only. **Status: KEEP.**

## NAVIGATION INTEGRITY

- `NavigationIntegrityObservation`: **121.15 inserts/min**.
- Current shape: one `create()` per persisted observation, autocommit; the service serializes work through an in-process promise tail.
- Anomaly persistence is a separate `upsert()` path, observed at 39.85 updates/min and 9.33 inserts/min.
- The source has no `createMany()` path and no explicit transaction around observation inserts. Transaction attribution is not directly exposed for this lane; the autocommit operation diagnostics classify it as one insert operation per row.
- Batching could reduce round trips, but the observed WAL/write level does not establish it as a clear P1.

## AIRCRAFT WEATHER

- `AircraftWeatherObservation`: **106.16 inserts/min**.
- Production path used during the audit: one-row `create()` autocommit writes because `AIRRADAR_WEATHER_BATCH_INSERT_ENABLED` is not enabled.
- The source contains an opt-in bounded batch path using one SQL batch operation, with single-row fallback for data conflicts; no explicit transaction is added by the current batch operation.
- This is a batching opportunity, but not a clear P1 from this window: rows are genuine sparse observations, dead tuples are low, and WAL is below the prior reference.

## RECEIVER COVERAGE

- `ReceiverCoverageHourly`: **107.82 updates/min**.
- The existing flush cadence remains 120 seconds.
- Source review shows one explicit `receiver.coverage` transaction per flush, with row-by-row lookup/update/create statements inside that transaction.
- SQL statement batching could reduce round trips, but the aggregate is already transaction-bounded and HOT is 100%; no material P1 is justified by this observation alone.

## TRANSACTION / ROUND-TRIP SHAPE

| Subsystem | Boundary observed or inferred |
|---|---|
| Flight/history | One explicit transaction per aircraft snapshot; Aircraft/Flight/FlightPosition work is contained in it. |
| Navigation integrity | One autocommit observation insert per persisted row; anomaly upserts are separate. |
| Aircraft weather | One autocommit row insert in the current production path; bounded batch path exists but is disabled. |
| Receiver coverage | One explicit transaction per flush; row operations are sequential inside it. |
| Daily statistics | One explicit transaction per statistics save; daily aggregate/aircraft/coverage writes are sequential inside it. |

## CONNECTIONS / VACUUM

End check: 1 active and 10 idle PostgreSQL connections. No pre-existing long-running transaction was found; the only active transaction visible in the bounded query was the audit query itself. Autovacuum is active on write-heavy tables. The highest dead-tuple counts are Flight (19,478 at the end check) and ReceiverCoverageHourly (8,778); neither warrants a destructive or emergency action in this read-only window. No `VACUUM FULL` or database modification was performed.

Relevant end-check index counts: Flight 7, FlightPosition 4, Aircraft 2, AircraftWeatherObservation 6, NavigationIntegrityObservation 6, NavigationIntegrityAnomaly 4, ReceiverCoverageHourly 3. No index was removed or proposed as clearly redundant.

## DECISION

**NO MATERIAL DB OPTIMIZATION CURRENTLY JUSTIFIED.**

The post-archive result is stable: WAL is lower than the previous reference, Aircraft suppression is effective, FlightPosition writes are expected persistence, and the remaining batch/round-trip opportunities are safe candidates for a later dedicated design but not a single clear P1 from this baseline.

AIRRADAR POST-ARCHIVE DB BASELINE PASS
