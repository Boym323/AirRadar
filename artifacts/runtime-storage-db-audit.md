# AirRadar Runtime, Storage & Database Performance Audit

Observation window: 2026-09-28, read-only production observation. Machine-readable data is in [runtime-storage-db-audit.json](runtime-storage-db-audit.json).

## Executive summary

- CPU: ~35.5% of one core during the 30-second interval; no CPU exhaustion signal.
- RAM: service RSS ~1.16 GB, systemd current ~1.29 GiB, peak ~1.42 GiB. The sample is too short to call a leak.
- Disk: process `write_bytes` increased ~43.6 MB in 30s, projecting ~125.5 GB/day. This must be attributed by file/source before treating it as device writes.
- Database: 1.41 GB total. `flightPosition` is the largest table plus indexes at 874 MB.
- Writes: ~220 inserts/min, ~270 updates/min, zero deletes in the interval.
- WAL: ~5.38 MB/min, projecting ~323 MB/hour or ~7.75 GiB/day.

## Key findings

`flight` has ~4.71M cumulative updates, `aircraft` ~4.73M, `receiverCoverageHourly` ~1.10M, and `receiverDailyStats` ~78k. The next safe investigation is unchanged-field suppression for active-flight updates, but it was not implemented without a longer before/after benchmark.

The aggregate PostgreSQL buffer hit ratio is ~98.96%. There are 12 temporary files totaling ~591 MiB. `pg_stat_statements` is not installed/enabled, so query ranking and plan selection could not be evidence-backed from production.

History uses a 20-second per-aircraft sampling policy, 30-day retention, 10,000-row batches, and at most 20 batches per maintenance pass. Weather is already sparse/coalesced; navigation-integrity diagnostics show 624 observations created, 315 persisted, and 15,639 rejected as invalid or stale at the sampled runtime.

## Database inventory

Largest relations:

| Relation | Total | Data | Index | Estimated/live rows |
|---|---:|---:|---:|---:|
| flightPosition | 874 MB | 435 MB | 398 MB | 4.58M / 4.69M |
| aircraftMetadataCache | 368 MB | 326 MB | 42 MB | 617k / 617k |
| aircraftWeatherObservation | 63.3 MB | 50.1 MB | 13.2 MB | 56k / 57k |
| flight | 53.1 MB | 17.9 MB | 35.2 MB | 113k / 113k |

No index was added or removed. No PostgreSQL configuration or production data was changed.

## Limitations and release status

The live service is production commit `dcb018d7` / version `1.0.205`; the checkout and `origin/main` are `bfad3bb0`. Public system diagnostics redact process fields, so host/service counters were used. The requested `/var/www/airradar-v3` path was absent; the actual checkout is `/var/www/airradar`.

No optimization was implemented, so there are no before/after metrics or regression tests to report. Production deployment: NO. Migration required: NO.
