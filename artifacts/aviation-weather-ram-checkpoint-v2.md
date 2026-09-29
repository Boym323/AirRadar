# AirRadar Aviation Weather RAM-First Persistence V2

## Result

BLOCKED for production canary/deployment. The implementation is present and
focused validation is green; no release was performed because the repository
instructions require an explicit release request.

## Baseline

- Production SHA: `6798494adabcb4ab93af5c78988c1cf5ca89ca90`
- `origin/main`: same SHA at measurement time
- Cache path: `/var/lib/airradar/weather/weather-cache-v1.json`
- Observed file: 115,269 bytes, mode `0600`
- Observed mtime: `2026-09-29 12:32:06 +0200`
- Historical weather attribution supplied in the request: ~13.04 MB/min
- A 10-second live sample showed no weather-cache mtime or `write_bytes`
  increase; total process `wchar` increased by 666,252 bytes and `syscw` by
  3,610, which cannot be attributed to this file alone.

## Design

- RAM is authoritative during runtime.
- Weather mutations increment a generation and mark the persistence dirty.
- The current bounded state is materialized only at checkpoint time.
- Default checkpoint: 1,800,000 ms from the first dirty mutation.
- `AVIATION_WEATHER_CACHE_CHECKPOINT_MS=0` provides shutdown/manual-flush-only
  behavior.
- Atomic temporary-file write, `fsync`, mode `0600`, and rename are preserved.
- Mutations during a write remain dirty for a later checkpoint.
- Failed writes retain dirty state and retry with bounded backoff.
- Canonical shutdown flushes weather persistence with the existing coordinator.

## Semantics

Live METAR/TAF/SIGMET TTLs, request cadence, stale-if-error behavior, fetchedAt
timestamps, and persisted product max ages are unchanged. A hard crash can lose
up to one checkpoint interval of recovery-only weather data.

## Validation

- `tests/aviation-weather-persistence.test.ts`: 7 tests passed
- `tests/shutdown.test.ts`: 5 tests passed
- Added fake-timer coverage for 30-minute coalescing and shutdown-only mode.
- `npm run typecheck`: passed
- Production build, browser gates, full suite, and canary: not run.

## Deployment

- Database schema changed: no
- Migration: 0
- Production deployment: not performed
- Candidate SHA: working-tree changes, not committed

## Next step

After explicit release authorization, run the authoritative release procedure,
observe at least two natural checkpoints, and repeat file-attribution and live
weather correctness measurements before marking the canary passed.

AIRRADAR AVIATION WEATHER RAM-FIRST PERSISTENCE V2 BLOCKED
