# AirRadar post-optimization runtime baseline

Measurement: 2026-09-29 11:26:17–11:56:17 CEST, 30.005 minutes, natural production traffic. No deployment, restart, migration, schema change, cadence change, or optimization code change was made.

## Workspace root cause

`/var/www/airradar` is present on the ZFS root mount, is a valid worktree, and is the service WorkingDirectory. No broken symlink, missing mount, absent checkout, or broken Git metadata was found. The historical runner error cannot be reproduced and no persistent runner log identifies which component disappeared. The evidence supports a transient runner cwd/path state, such as a stale cwd after an external directory interruption, but does not prove that exact mechanism.

## Workspace recovery

- Canonical checkout: `/var/www/airradar`
- `HEAD`: `7a4a4c675ed08ad852ddbd229049634a973b68fc`
- `origin/main`: same SHA
- Tree: clean
- Preserved: 3 stashes and unreachable commits; no reset, prune, reclone, or destructive Git action
- Node/npm: `v22.23.3` / `10.9.9`
- Typecheck, feature check, Prisma verify, and isolated production build passed. Lint passed with 7 warnings and 0 errors.

## Production

Production is healthy and remained running. Public/local health, PostgreSQL, receiver, and SSE checks passed. Runtime version is `1.0.208`, exposed SHA `8ac5b8d4`, built at `08:27:27Z`. It is an ancestor of `main`; `main` adds only repository metadata/changelog commits (`96d4c279` and merge `7a4a4c67`). No automatic alignment deployment was performed.

## CPU and memory

AirRadar averaged 45.54% of one core over the interval. The container exposes 4 logical CPUs, has no CPU quota, and showed no cgroup throttling. PostgreSQL was not separately observable as a process in this container.

Runtime telemetry recorded RSS 1.141 GiB → 0.981 GiB, peak 1.551 GiB; heap used 530.5 MiB → 573.2 MiB, peak 1.103 GiB; cgroup current 1.037 GiB → 0.892 GiB, peak 1.424 GiB. Current admin diagnostics show RSS 1.148 GiB, RssAnon 1.094 GiB, RssFile 54.9 MiB, Private Dirty 1.094 GiB, heap used 450.6 MiB, external 5.4 MiB, and ArrayBuffers 1.7 MiB. This is GC-driven fluctuation, not monotonic growth.

## Disk I/O and storage

The Node process measured 74.2 MB/min of `write_bytes` in a one-minute `/proc/88/io` interval, projecting to 106.9 GiB/day; `read_bytes` was only 0.12 MB/min. This is the largest unexplained resource signal. Exact file attribution requires focused instrumentation; runtime-state inspection showed repeated atomic archive/cache rewrites, including the map-context METAR archive and provider caches.

A device spot check showed 451 MB read and 28.4 MB written per 10 seconds, 325 read IOPS and 3.6 write IOPS. `vmstat` wait was 2–5%. There is no evidence of storage saturation. Do not optimize SSD endurance from logical WAL bytes alone.

## Database size and write attribution

Final database size was 1.63 GB decimal (about 1.52 GiB). Largest tables are `FlightPosition` 860 MiB table + 407 MiB indexes (902 MiB total), `AircraftMetadataCache` 368 MiB, `AircraftWeatherObservation` 114 MiB, `NavigationIntegrityObservation` 75 MiB, and `Flight` 54 MiB.

| Table | INSERT/min | UPDATE/min | DELETE/min | HOT | Size |
|---|---:|---:|---:|---:|---:|
| FlightPosition | 190.27 | 0 | 0 | — | 860 MiB |
| Flight | 5.83 | 189.83 | 0 | 2.41% | 54 MiB |
| ReceiverCoverageHourly | 0 | 115.78 | 0 | 100% | 20 MiB |
| NavigationIntegrityObservation | 155.84 | 0 | 0 | — | 74 MiB |
| NavigationIntegrityAnomaly | 12.66 | 40.89 | 0 | 33.74% | 11 MiB |
| AircraftWeatherObservation | 87.22 | 0 | 0 | — | 114 MiB |
| Aircraft | 0.13 | 14.13 | 0 | 100% | 5.7 MiB |
| ReceiverDailyAircraft | 2.90 | 2.50 | 0 | 100% | 8.6 MiB |

Totals were 463.22 inserts/min, 376.07 updates/min, 5.07 deletes/min, and 564.47 transactions/min. PostgreSQL cache hit ratio was 98.96%; one active and ten idle connections were observed, with no transaction longer than five minutes.

## Feature-specific findings

### FlightPosition

Current rate is 190.27 inserts/min. The table had 4,791,467 rows and 902 MB total size at the audit endpoint, projecting roughly 68 MiB/day of table/index growth during this traffic window. The adaptive policy remains unchanged. The enabled shadow had 295 state entries and zero failures; it predicts more writes than the current policy, so it must not be adopted.

### Aircraft

Aircraft updates were 14.13/min, far below the old ~135/min order of magnitude. The Aircraft optimization remains effective. No new Aircraft optimization is justified.

### Flight

Flight updates were 189.83/min. `lastSeenAt` remains intentionally immediate; no changed-field Flight optimization is proposed.

### Receiver Coverage

ReceiverCoverageHourly updated 115.78/min, with 18 flush attempts, 18 successes, zero failures, and about 231 rows/flush. The last observed flush was 167 ms; the prior measured p95 reference was ~253 ms. The cache remained bounded at 302 entries/1 hour, with a maximum observed dirty/cache footprint of 409 entries. Exact warm-cache SELECT counts were unavailable without intrusive query logging.

ReceiverDailyStats/Aircraft/Coverage/CoverageAltitude were not material write sources; each was below 3.9 updates/min. Navigation Integrity and Aircraft Weather are measurable insert lanes but their semantics and coalescing remain unchanged.

## WAL, dead tuples, SSE, and caches

WAL grew 94,425,074 bytes: 3.00 MB/min, 180 MB/hour, or 4.12 GiB/day projected. Normalize this against the observed 190 FlightPosition inserts/min and 564 transactions/min; do not compare raw WAL with historical intervals without traffic context.

Flight had 13,617 dead tuples and ReceiverCoverageHourly 9,963 at the final snapshot. Autovacuum was active on the newer navigation/weather/anomaly lanes, while Flight and ReceiverCoverageHourly had older last-autovacuum timestamps. No `VACUUM FULL` was run.

SSE clients were zero in the sampled telemetry, with no V1/V2 delta growth observed. Current bounded structures included 87 local aircraft, 1,368 network aircraft, 57,313 trail points, about 5.5 MB estimated trail memory, 2,521 metadata hot-cache entries, 3,701 provider-cache entries, 302 coverage-cache entries, and 295 FlightPosition shadow entries. No unbounded cache was observed.

## Current bottleneck ranking

- **P1 — Node filesystem write amplification:** 74.2 MB/min measured process writes; exact file attribution is the missing evidence.
- **P1 — Transaction/row churn:** 564.5 transactions/min, with Flight and FlightPosition each around 190/min and coverage around 116/min.
- **P2 — Navigation/Weather persistence:** 155.8 and 87.2 inserts/min respectively; material, but no semantic change is justified yet.
- **P3 — Receiver Coverage Batch V2:** V1 is healthy and its ~0.17-second flush is not a material system-level problem.
- **P3 — Physical storage/cache:** no saturation, no CPU throttling, and 98.96% DB cache hit ratio.

## Next optimization

Recommend exactly one next stream: **Node filesystem write attribution and reduction for repeated runtime archive/cache snapshots.** The possible saving may be tens of MB/min, but it is intentionally not quantified until file-level attribution confirms the source. Risk is medium; use shadow counters and one production canary window. Preserve Flight semantics and do not combine this with schema, cadence, or persistence changes.

## Batch V2

**KEEP RECEIVER COVERAGE CACHE V1.** Current health and flush timings do not justify Batch V2 merely for statement-count elegance.

## Database safety and production changes

- schema changed: **NO**
- migration: **NO**
- manual DB changes: **NO**
- optimization code deployed: **NO**
- production restart: **NO**

AIRRADAR POST-OPTIMIZATION BASELINE PASS
