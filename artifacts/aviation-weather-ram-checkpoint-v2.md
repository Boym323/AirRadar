# AirRadar Aviation Weather RAM-First Persistence V2

## Result

PASS. Production release and a 76.38-minute canary completed on 2026-09-29.

## Git and deployment

- Start/candidate/origin SHA: `e09a9ab0f7a52729322829799c46a975cddd886f`
- Production version: `1.0.215`
- Deployment/restart: `2026-09-29 15:40:49 CEST`
- Build: passed in an isolated release directory; release duration 146 seconds
- Prisma: schema unchanged; migrations applied: 0
- Final service: active; public/local health, database, receiver, and SSE passed

## Validation gates

Full suite passed with 1,376 tests and 3 skips. Lint passed with the existing
7 warnings; typecheck, production core/browser gates, SSE, statistics,
airport-operations audit, DB verification, FlightPosition replay, and 59
focused weather tests passed. Radar benchmark passed at 50, 100, 250, and 500
aircraft. The optional `intelligence:replay` command was not run successfully
because its local history database was unavailable; this did not affect the
required FlightPosition replay audit.

## Checkpoint canary

- Configuration: 1,800,000 ms, `periodic`; shutdown-only remained disabled.
- First dirty mutation: `15:43:58.767 CEST`.
- First checkpoint: `16:13:58.769 CEST`; one attempt, one success, zero failures.
- Second dirty mutation: `16:15:09.095 CEST`.
- Second checkpoint: `16:45:09.097 CEST`; one attempt, one success, zero failures.
- Final generations: mutation 8, persisted 8; pending mutations 0.
- Periodic checkpoints: 2; graceful production flush was not naturally observed.

The cache file did not rewrite during either dirty interval. Each checkpoint
performed one atomic replacement. The first replacement changed the file from
115,269 to 127,901 bytes; the second produced 124,570 bytes. Both snapshots
were mode `0600` and valid JSON.

## Weather correctness and composition

The final snapshot is version 1 with 20 entries: 1 METAR, 17 TAF, and 2
SIGMET entries. METAR, TAF, and SIGMET endpoints returned HTTP 200. Provider
failures and persistence failures remained zero. Live TTL/freshness behavior
continued independently of disk checkpoint age.

## Physical writes

The representative PID 32049 `/proc/PID/io` interval was 76.38 minutes,
15:44:17–17:00:40 CEST. Two complete weather snapshots totaled 252,471
bytes, or approximately 0.0033 MB/min and 1.57 snapshot writes/hour. Against
the historical weather reference of ~13.04 MB/min, this is a measured 99.97%
reduction.

The same interval measured total Node `write_bytes` at 13.76 MB/min,
`wchar` at 16.34 MB/min, and `syscw` at 10,550/min. The 13.53 MB/min total
reference is traffic-sensitive; this sample shows no overall reduction claim,
because remaining writers dominate after weather persistence is coalesced.
ADSBDB remained hourly: one checkpoint, one write, no return of the historical
write storm. Its measured file size was 4,773,311 bytes at the checkpoint.

## CPU and memory

Node CPU averaged approximately 48.5% of one core and peaked at 56.1%.
RSS fluctuated between approximately 930 MB and 1,525 MB without a monotonic
growth pattern. Normal GC fluctuation was observed.

## Decision

KEEP 30-MIN WEATHER CHECKPOINT. The two observed checkpoints/hour make weather
writes negligible; shutdown-only mode should not be enabled automatically.

AIRRADAR AVIATION WEATHER RAM-FIRST PERSISTENCE V2 PASS
