# AirRadar Historical METAR Archive Write Optimization V1

## Result

**PARTIAL — deployed and canaried; source-specific in-process counters are not exposed by a production endpoint.**

The A/B candidate was deployed through `deploy/release.sh` on 2026-09-30.
Application health, receiver health, database health, SSE, and browser gates
passed. No schema changes or migrations were applied.

## Candidate

- Flush interval: 60 seconds.
- Mutation flush threshold: 64 entries.
- Semantically unchanged METAR observations are suppressed.
- Atomic replacement, bounded retention, ordering, and shutdown flush: preserved.

## Physical canary

The post-deploy canary ran for 909 seconds on PID 114502.

- `/proc/<PID>/io` `write_bytes`: 35,923,116 bytes, **2.371 MB/min**.
- Historical reference: 38.607 MB/min.
- Reduction against reference: **93.86%**.
- Total process `wchar`: 79,039,381 bytes, **5.217 MB/min**.
- `syscw`: 159,776, **10,546/min**.

The physical result is process-wide and cannot be split exactly by archive.
METAR mutation, unchanged-suppression, flush, and bytes-per-flush counters were
not externally readable during this canary.

## Integrity

Persisted METAR archive: 29,017 entries, 29,017 unique station/timestamp keys,
ordered, zero duplicate keys. Observed-time range was 2026-09-07 through
2026-09-30 UTC and remained within the configured retention bound.

AIRRADAR METAR ARCHIVE WRITE OPTIMIZATION PARTIAL
