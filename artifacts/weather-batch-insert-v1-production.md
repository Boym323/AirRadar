# AirRadar Weather Batch Insert V1 — Production Rollout

Date: 2026-09-29

## Result

**WEATHER BATCH INSERT V1 PASS — DISABLE**

The implementation passed semantic and health checks, but production evidence did not show reduced weather-writer occupancy. Legacy single-row persistence was restored after the comparison.

## Production

- Version: `1.0.225`
- SHA: `111a3c2c`
- Final switch: `AIRRADAR_WEATHER_BATCH_INSERT_ENABLED=false`
- Final MainPID: `84409`
- Final service start: `2026-09-29 22:40:04 CEST`
- Schema changes: none
- Migrations: 0

## OFF baseline

Window: approximately 13.0 minutes, MainPID `81462`.

- Durable weather rows: 356 (`27.46/min`)
- Single-row statements: 356 (`27.46/min`)
- Batch statements: 0
- Fallback statements: 0
- Weather persistence failures: 0
- PostgreSQL application transaction failures: 0
- Weather writer DB time: 69.509 s total (`5.36 s/min`)
- Natural invocations: 257
- Natural distribution: 63 empty, 99 single, 87 in 2–4, 8 in 5–8
- Natural selected rows: 356
- Natural multi-row invocations: 95 (`37.0%`)

Health gates passed for application, database, receiver, radar/SSE path, history/statistics, weather, METAR/TAF/SIGMET surfaces, and navigation. Direct PostgreSQL lock/deadlock/connection counters were not available on this host (`psql` is not installed); application transaction diagnostics reported no failures.

## ON canary

Window: approximately 12.7 minutes, MainPID `83029`.

- Durable rows: 627 (`49.09/min`)
- Batch attempts/successes: 187/187 (`14.68/min`)
- Average rows/batch: 3.35
- Maximum batch size: 16
- Batch failures: 0
- Fallback rows: 0
- Fallback failures: 0
- Circuit openings: 0
- Weather persistence failures: 0

## ON long comparison

Window: approximately 29.3 minutes, same MainPID `83029`.

- Durable rows: 1,723 (`58.75/min`)
- Batch attempts/successes: 561/561 (`19.13/min`)
- Average rows/batch: 3.07
- Maximum batch size: 16
- Batch failures: 0
- Fallback rows: 0
- Circuit openings: 0
- Weather persistence failures: 0
- Natural invocations: 577
- Natural distribution: 16 empty, 93 single, 366 in 2–4, 101 in 5–8, 1 in 9–16
- Natural multi-row invocations: 468 (`81.1%`)
- Batch DB time: 410.723 s (`14.00 s/min`)

Exact batch-size p50/p95 was not exposed by the production counters; the measured average and maximum are reported instead.

## Benefit and decision

For the ON long window, 1,723 measured rows were persisted in 561 statements rather than 1,723 single-row statements: a measured 67.4% reduction in weather statements, based on natural traffic rather than a cap-16 assumption. There were no semantic or health regressions, and no fallback or breaker activity.

However, measured weather-writer DB time was approximately 14.00 s/min ON versus 5.36 s/min OFF. Normalized by durable row, this was approximately 238 ms/row ON versus 195 ms/row OFF. Because the KEEP gate requires materially reduced writer occupancy, the final decision is DISABLE despite the statement reduction.

The switch was set back to OFF and the legacy path was verified with new single-row writes and zero batch activity.

## Final decision

**DISABLE WEATHER BATCH INSERT V1**

Next step: keep legacy single-row weather writes and retain the implementation for future measurement after writer-occupancy instrumentation or query-path optimization improves the economics.

`AIRRADAR WEATHER BATCH INSERT V1 PASS`
