# AirRadar ADSBDB RAM checkpoint v2

## Result

PASS. Production `v1.0.213` (`89ba0ff0fe01f4b1ae5ec833ba71ceb824b76a5c`) was deployed at 2026-09-29 13:25:06 CEST. The natural canary ran approximately 96 minutes.

## Release validation

The isolated production build, core/runtime gates, standalone desktop/mobile browser gate, radar benchmark, SSE validation, statistics validation, FlightPosition replay, Airport Operations audit, and DB verification passed. Prisma reported zero migrations and no schema change. The full suite passed with 1,374 tests passed and 3 skipped.

## Checkpoint behavior

Configuration was hourly (`ADSBDB_CACHE_CHECKPOINT_MS=3600000`). The first dirty mutation was at 13:25:07.623. The first natural checkpoint ran at 14:25:08.411:

- attempts: 1
- successes: 1
- failures: 0
- periodic checkpoints: 1
- ADSBDB persistence writes: 1
- snapshot: 4,732,956 bytes, valid schemaVersion 1 JSON, mode `0600`

The cache file mtime/inode changed once. At the checkpoint, mutation generation was 72,688 and persisted generation 72,546; mutations during/after the write remained dirty and in RAM. At canary end the generations were 120,343 and 72,546 respectively. No write storm occurred.

## Filesystem measurement

Reference ADSBDB activity was approximately 60.88 MB/min and 13 snapshots/min. During the canary, one 4.73 MB snapshot was observed over approximately 96 minutes: 0.625 snapshots/hour observed, or the configured steady-state rate of approximately one snapshot/hour, and 0.049 MB/min over the measured canary. The one-per-hour normalized reduction from the old snapshot rate is approximately 99.87%.

Node `/proc/PID/io` `write_bytes` increased from 13,578,228 to 1,312,142,518, approximately 13.53 MB/min over the canary, versus the 74.2 MB/min reference. `wchar` and `syscw` were also captured; `write_bytes` is the physical-write metric used for attribution.

The next dominant writer is the unchanged METAR archive, `/var/lib/airradar/map-context-metar-v1.json`, at the previously measured 13.04 MB/min. Against the post-deploy Node rate this is approximately 96.38% of measured Node physical writes. This is an attribution result only; METAR was not modified.

## Runtime and provider

Observed CPU ranged approximately 45.6–56.7% of one core, with a 67% startup peak, against the 45.5% reference. RSS started around 524 MB, peaked around 1.37 GB during warm-up/GC fluctuation, and ended around 941 MB. Final bounded ADSBDB maps contained 2,391 metadata and 1,901 route entries. Public heap fields are redacted, so RSS was measured from `/proc`.

Final provider counters were memory hits 172,105, persistent hits 2, live hits 820, and stale fallback 5. Several upstream refresh failures recovered; there was no persistence failure or provider regression.

## Correctness and rollback

Periodic checkpoint, atomic snapshot, hard-crash simulation, graceful-shutdown tests, database verification, SSE, receiver, radar, System Status, and public/local health checks passed. A graceful shutdown flush was not naturally observed during the canary; it remains covered by tests. No rollback was required.

## Next step

`AUDIT METAR WRITE PERSISTENCE`
