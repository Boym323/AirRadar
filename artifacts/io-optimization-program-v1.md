# AirRadar Maximum I/O Optimization Program V1

## Status

**PARTIAL — Streams A and B deployed and canaried; source-specific counters and clean tag bookkeeping remain incomplete.**

Candidate source SHA: `377aa7a4bc754f0d134e225540ff1ecf4a4c2a5c`.
Deployed build SHA: `2bd4b8ce15b192c1a93846b2914460ad97666560`.
The canonical release restarted production successfully, but its final tag step
reported that existing `v1.0.228` points to the pre-changelog commit.

## Baseline evidence

The checked-in V4 audit attributes Node writes to historical wind at 23.662
MB/min (57.49%, 50.11 atomic replacements/min) and historical METAR at 14.505
MB/min (35.24%, 28.07 replacements/min). Together they account for 92.73% of
logical Node writes. The reference total is 38.607 physical MB/min and 7,760.7
write syscalls/min. These are before values; no after value is claimed yet.

## Implemented candidate

`lib/server/map-context.ts` now coalesces reconstructable JSON archive updates
in RAM, suppresses semantically unchanged METAR and wind snapshots, flushes at
the configured time or mutation threshold, and retains dirty state after a
failed atomic replacement. The existing bounded retention, file format, temp
file, rename, ordering, and canonical shutdown coordinator remain in use.

Defaults are `MAP_CONTEXT_ARCHIVE_FLUSH_INTERVAL_MS=60000` and
`MAP_CONTEXT_ARCHIVE_FLUSH_ENTRY_LIMIT=64`. Graceful shutdown flushes METAR,
wind, and AUP archive buffers. The hard-crash loss window is at most one flush
interval for pending archive data. Live freshness and PostgreSQL persistence
are unchanged.

## Production validation

- Focused archive-buffer test: PASS.
- Prepared typecheck: PASS.
- Targeted ESLint: PASS.
- `git diff --check`: PASS.
- Full production gates, including SSE and desktop/mobile browser checks: PASS.
- Production build: PASS.
- Prisma migration: PASS; 0 migrations applied.
- Post-deploy canary: PASS, 909 seconds, PID 114502.
- Physical `/proc/<PID>/io` write rate: 2.371 MB/min versus 38.607 MB/min reference.
- Exact source-specific mutation/suppression/flush counters: unavailable through production diagnostics.

## Stream decisions

- Wind archive: IMPLEMENTED, production evidence pending.
- Historical METAR archive: IMPLEMENTED, production evidence pending.
- Navigation Integrity batching: KEEP / not changed.
- Aircraft Weather batching: KEEP legacy path; prior production comparison disabled the candidate.
- ReceiverCoverageHourly: KEEP current bounded transaction-safe cache.
- Flight and FlightPosition: KEEP current known-good behavior.

## Next measurement

Add a protected operational diagnostic for the wind and METAR archive counters,
then repeat a source-split canary. Do not begin Streams C/D until that evidence
is collected and the release tag bookkeeping is reconciled.

AIRRADAR MAXIMUM I/O OPTIMIZATION PARTIAL
