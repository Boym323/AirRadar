# AirRadar Maximum I/O Optimization Program V1

## Status

**PARTIAL — Streams A and B implemented locally; production canary pending.**

Start SHA, local `main`, and `origin/main`: `21a9ee355b7b3c3217546b95393bfb5f8911a025`.
No release, restart, production database change, or production filesystem change
was performed in this task.

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

## Validation

- Focused archive-buffer test: PASS.
- Prepared typecheck: PASS.
- Targeted ESLint: PASS.
- `git diff --check`: PASS.
- Production canary: NOT RUN.
- Production build/release/browser gates: NOT RUN; release is not implicit.

## Stream decisions

- Wind archive: IMPLEMENTED, production evidence pending.
- Historical METAR archive: IMPLEMENTED, production evidence pending.
- Navigation Integrity batching: KEEP / not changed.
- Aircraft Weather batching: KEEP legacy path; prior production comparison disabled the candidate.
- ReceiverCoverageHourly: KEEP current bounded transaction-safe cache.
- Flight and FlightPosition: KEEP current known-good behavior.

## Next measurement

Run a separate natural-traffic canary and compare wind/METAR logical and
physical MB/min, replacement calls/min, archive freshness, queue counters,
CPU/RSS, and live/database health. Do not treat the target HDD reduction as
proven until that canary exists.

AIRRADAR MAXIMUM I/O OPTIMIZATION PARTIAL
