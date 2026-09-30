# RESULT

D — ATTRIBUTION INCOMPLETE

# WINDOW

- Duration: 639.793 seconds (10m39.8s)
- PID: 94888; stable for the full window
- Production: `1.0.226`, commit `06e8aae5`
- Window: `2026-09-30T09:58:51+02:00`–`2026-09-30T10:09:31+02:00`

# NODE IO

| Metric | Rate |
|---|---:|
| `write_bytes` | 39.52 MB/min |
| `wchar` | 42.02 MB/min |
| `syscw` | 14,920/min |
| Average `write_bytes`/`syscw` | 2,650 bytes |

The Node physical counter increased by 421,349,700 bytes. `cancelled_write_bytes` stayed at zero.

# ATTRIBUTION

| Path | Subsystem | Observed MB/min | Share of Node physical writes | Pattern |
|---|---|---:|---:|---|
| `/var/lib/airradar/map-context-metar-v1.json` | Historical METAR archive | 14.87 | 37.65% | ATOMIC REPLACE |
| `/var/lib/airradar/map-context-wind-v1.json` | Historical wind archive | 4.83 | 12.23% | ATOMIC REPLACE |
| `/var/lib/airradar/runtime-telemetry-v1.json` | Runtime telemetry | 0.44 | 1.12% | ATOMIC REPLACE |
| `/var/lib/airradar/ogn-ddb-cache-v1.json` | OGN DDB cache | 0.021 | 0.05% | ATOMIC REPLACE |
| `/var/lib/airradar/map-context-aup-v1.json` | AUP/UUP archive | 0.004 | 0.01% | ATOMIC REPLACE |
| `/var/lib/airradar/alert-engine-state.json` | Alert state | 0.003 | 0.008% | ATOMIC REPLACE |
| `/var/lib/airradar/alert-events.jsonl` | Alert ledger | 0.0001 | 0.0003% | APPEND |

Direct visible-path accounting is 215,167,783 bytes, or 51.08% of the Node physical counter. The remaining 206,181,917 bytes cannot be assigned to exact paths with the installed safe tools because short-lived temporary files are not reliably observable at one-second metadata resolution.

# ACCOUNTED

51.08% by direct persistent-path metadata/inode accounting. This does not meet the requested 95% threshold.

# TOP WRITER

The largest directly observed path is `/var/lib/airradar/map-context-metar-v1.json` at 14.87 MB/min and 37.65% of Node `write_bytes`. It was replaced 11 times; the inode changed on each observed replacement.

# SOURCE CODE

- `lib/server/map-context.ts:76-84`: `JsonArchive.replace()` serializes to `<path>.tmp` with `writeFile()` and atomically renames it.
- `lib/server/map-context.ts:260-273`: METAR archive update path.
- `lib/server/map-context.ts:275-284`: wind archive update path.
- `lib/server/map-context.ts:287-295`: AUP/UUP archive update path.
- `lib/server/runtime-telemetry.ts:194-220,309-330`: telemetry sample and synced atomic snapshot.
- `lib/ogn/ddb.ts:716-722`: OGN DDB cache write and rename.
- `lib/server/alert-state.ts:101-102`: alert state `writeFileSync()` plus `fsyncSync()`.
- `lib/server/alert-history.ts:279-310`: alert JSONL `appendFile()` and compaction path.

# SEMANTICS

The dominant visible writer is historical map-context data. It is reconstructable/historical rather than live aircraft state; loss would reduce historical playback coverage but would not stop live radar. Runtime telemetry is diagnostic. OGN DDB is a bounded last-known-good cache.

# ADSBDB

`/var/lib/airradar/adsbdb/adsbdb-cache-v1.json` had 0 observed bytes, unchanged size and inode. Regression: **NO**.

# AVIATION WEATHER

`/var/lib/airradar/weather/weather-cache-v1.json` had 0 observed bytes, unchanged size and inode. Regression: **NO**.

# LOGGING CHECK

Node descriptors showed journald pipes/sockets and no regular file descriptor. Therefore application stdout/stderr and journald forwarding were not identified as Node regular-file writers. PostgreSQL is a separate process and excluded.

# NEXT STEP

RUN DEEPER ATTRIBUTION — use an already-approved low-level syscall/I/O tracer or equivalent kernel accounting to capture every temporary-file write and prove the missing 48.92% by path. Do not optimize before that evidence exists.

No application code, configuration, deployment, restart, database, ADSBDB, Aviation Weather, or aircraft suppression behavior was changed.

AIRRADAR NODE WRITE ATTRIBUTION V2 INCOMPLETE
