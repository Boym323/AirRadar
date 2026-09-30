# RESULT

D — ATTRIBUTION STILL INCOMPLETE

# WINDOW

No syscall window was started. The V3 audit requires an already-installed syscall tracer; none is available on this host. Starting a metadata-only window would not satisfy the stated objective of accounting for logical writes by syscall return value.

Production verification at `2026-09-30T10:20:00+02:00`:

- Version/SHA: `1.0.226` / `06e8aae5`
- Node PID: `94888`
- Service start: `2026-09-30T07:38:13+02:00`
- Health: OK; database OK; local-beast+json-failover OK

# NODE IO

The available point-in-time `/proc/94888/io` snapshot was:

| Counter | Value |
|---|---:|
| `write_bytes` | 6,135,964,649 |
| `wchar` | 6,495,985,986 |
| `syscw` | 2,035,314 |
| `cancelled_write_bytes` | 0 |

Rates are intentionally not reported because no V3 start/end window exists.

# SYSCALL ATTRIBUTION

None. No compliant tracer is installed. Checked and absent: `bpftrace`, BCC file-write tools, `strace`, `perf`, `inotifywait`, `sysdig`, `fsatrace`, `fatrace`, `trace-cmd`, and the checked BCC module paths.

# ACCOUNTED LOGICAL WRITES

0% in V3. The previous V2 metadata result was 51.08% direct final-path accounting, but it did not meet the syscall-level requirement and is not relabeled as V3 evidence.

# PHYSICAL VS LOGICAL

Not computable for V3. The missing relationship remains the distinction between logical writes to short-lived atomic temporary files and Node `write_bytes` writeback accounting. PostgreSQL remains excluded as a separate process.

# TOP WRITER

No V3 syscall winner. The V2 observation identified `/var/lib/airradar/map-context-metar-v1.json` as the largest directly visible path, but this does not prove its share of V3 logical syscall bytes.

# METAR ARCHIVE

- Path: `/var/lib/airradar/map-context-metar-v1.json`
- Configuration: `archiveMetadataPath("map-context-metar-v1.json")` in `lib/server/map-context.ts:97`, under the production weather-radar state directory
- Module/function: `lib/server/map-context.ts`, `MapContextArchive.addMetar()` → `JsonArchive.replace()`
- API: `fs.promises.writeFile(<path>.tmp, JSON)` followed by `rename(<path>.tmp, <path>)` at lines 76–84 and 260–273
- Cadence: `getMapContextPollIntervalMs()`, default 60 seconds, bounded to 30 seconds–15 minutes in `lib/server/config.ts:125-126`
- Pattern: ATOMIC REPLACE
- Semantics: historical map-context archive used for playback/resolution; reconstructable, bounded by retention, and independent of live aircraft state
- Durability: immediate durability requirement and acceptable loss window are unknown; no optimization is recommended

# TEMP/DELETED FILES

Not observable. No tracer was available to capture temporary names, deleted-but-open files, rename sources, or successful syscall return values.

# STDOUT/STDERR

Not quantified in V3. The prior descriptor inventory showed journald pipes/sockets and no regular Node log file. Journald physical writes must not be attributed to Node `write_bytes` without evidence.

# ADSBDB

Not sampled in a V3 window. V2 observed 0 writes and unchanged size/inode; no regression was observed there.

# AVIATION WEATHER CACHE

Not sampled in a V3 window. V2 observed 0 writes and unchanged size/inode; no regression was observed there.

# NEXT STEP

RUN DEEPER ATTRIBUTION — install/enablement is outside this audit’s authority because the brief forbids package installation. If an approved existing tracer becomes available, attach it only to PID 94888 for approximately five minutes and aggregate successful `write`, `writev`, `pwrite64`, and `pwritev` return values by resolved path.

No application code, configuration, deployment, restart, database, or cache behavior was changed. No raw trace was created or retained.

AIRRADAR NODE WRITE ATTRIBUTION V3 INCOMPLETE
