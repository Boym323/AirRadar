# Node filesystem write attribution

## RESULT

**NO SAFE OPTIMIZATION JUSTIFIED**

The clean one-minute sample attributed 74,359,222 of 74,359,223 `/proc/5398/io`
`write_bytes` (99.999999%), exceeding the 80% requirement. No code, database,
schema, cadence, or deployment change was made.

An unrelated automated release changed the live service during the first
attempted interval. PID 88 exited and PID 5398 started at 12:18:22 CEST. The
first interval was discarded. The valid sample below is from the stable PID
5398 process after that restart, on the then-current production build
`1.0.209` / `2cbc6c14`.

## PROCESS TREE

```text
systemd airradar.service (/system.slice/airradar.service)
└─5398 /usr/bin/node /var/www/airradar/scripts/start-production.mjs start --hostname 192.168.1.142 --port 3000
```

- MainPID: 5398
- User: `airradar`
- Parent: PID 1
- Working directory: `/var/www/airradar`
- Cgroup: `/system.slice/airradar.service`
- Node children in the service cgroup: none
- Service stdout/stderr: journald sockets, not regular files
- The separate `release.sh`/`npm ci` process observed earlier was outside this
  cgroup and was not included.

## BASELINE

Previous reported baseline: 74.2 MB/min physical `write_bytes` for PID 88.

Valid remeasurement, PID 5398, 60.400 seconds, 12:19:49–12:20:49 CEST:

| Counter | Start | End | Rate |
|---|---:|---:|---:|
| `wchar` | 153,216,289 | 326,616,920 | 173.40 MB/min |
| `write_bytes` | 112,870,599 | 190,480,028 | 77.61 MB/min |
| `cancelled_write_bytes` | 0 | 0 | 0 |
| `syscw` | 14,896 | 19,538 | 4,642/min |

The detailed accounting sample ran for 60.400 seconds, 12:21:37.356–12:22:37.756
CEST. It measured 74,359,223 physical bytes/min and matched the file estimate
to one byte. The difference between the two adjacent samples is normal traffic
and provider timing variation; both are consistent with the old 74.2 MB/min
baseline.

`wchar` is not filesystem-only: it includes writes to PostgreSQL/network
sockets. `write_bytes` is the physical write counter used for file accounting.

## FILE ATTRIBUTION

| Path/category | Bytes/min | Writes/min | Share | Mechanism | Purpose |
|---|---:|---:|---:|---|---|
| `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json` | 60,882,676 | 13 | 81.876% | Serialize complete JSON to `.tmp`, `writeFile`, `fsync`, close, atomic `rename` | Last-known-good ADSBDB metadata/routes cache; survives restart |
| `/var/lib/airradar/map-context-metar-v1.json` | 13,044,909 | 1 | 17.543% | Serialize complete archive to `.tmp`, `writeFile`, atomic `rename` | Historical METAR map-context archive |
| `/var/lib/airradar/runtime-telemetry-v1.json` | 427,978 | 1 | 0.576% | Serialize complete JSON to `.tmp`, `writeFile`, `fsync`, close, atomic `rename` | Bounded 24-hour runtime telemetry |
| `/var/lib/airradar/map-context-aup-v1.json` | 3,659 | 1 | 0.005% | Serialize complete archive to `.tmp`, `writeFile`, atomic `rename` | Historical AUP/UUP map-context archive |
| **Total attributed** | **74,359,222** | **16 observed replacements** | **99.999999%** |  |  |

The ADSBDB file averaged 4,683,283 bytes per full rewrite. Its inode changed
13 times in the detailed sample. Temporary-file observations showed the file
being written in multiple chunks before replacement; the final physical write
volume is the complete snapshot size, not merely the logical entry delta.

No deleted-but-open regular files were found. No `.next` file metadata changed
in the detailed sample. No Node regular log file was open. The only regular
runtime descriptor observed besides `/dev/null` was the ADSBDB temporary file.

## TOP WRITE SOURCE

The exact top source is `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`.

- `lib/server/enrichment-cache.ts:402-406`: every successful ADSBDB metadata or
  route result calls `AdsbDbPersistence.set()`.
- `lib/server/adsbdb-persistence.ts:220-238`: `set()` refreshes `fetchedAt` and
  `freshUntil`, marks the cache dirty, and schedules the existing 3-second
  debounce.
- `lib/server/adsbdb-persistence.ts:387-419`: the full bounded metadata/routes
  collection is serialized, written to a temporary file, synced, and atomically
  renamed.
- Cadence observed: 13 complete snapshots/min, approximately one every 4.6 s.

This is repeated full-file rewrite amplification. It is not a log, generated
artifact, database file, Next.js cache, or temporary-only workload.

## WRITE AMPLIFICATION

The cache's logical mutations are individual enrichment results, while each
save writes approximately 4.68 MB. The exact logical delta was not reread or
hashed on every production write. The serialized content is nevertheless
necessarily different for successful updates because `fetchedAt`,
`freshUntil`, and the top-level `savedAt` are refreshed. Therefore a
skip-identical optimization was not demonstrated and would alter freshness
semantics if it ignored those fields.

Classification:

- ADSBDB cache: **HIGH** amplification; candidate categories B/D/E considered,
  but not safe to implement without changing restart/freshness semantics or
  introducing a new delta format.
- METAR archive: **HIGH** full-archive rewrite, but one observed write/min and
  its historical reader expects the JSON snapshot format.
- Runtime telemetry: **LOW/MODERATE**; bounded and only one write/min.
- AUP archive: **LOW** by volume.

## CACHE / TEMP / LOG / ARCHIVE

- Durable application data: PostgreSQL remains the authority for live/history
  lanes. None of the measured files duplicates Flight or FlightPosition writes.
- Persistent cache: ADSBDB is explicitly last-known-good and restart-readable;
  disabling or moving it to tmpfs would change recovery behavior.
- Runtime archive: METAR and AUP are historical map-context archives consumed by
  the map-context resolver. Their files are bounded by retention/max-entry
  logic, but writes replace the whole JSON snapshot.
- Runtime telemetry: bounded 1,440-sample/24-hour operational history.
- Temporary churn: atomic `.tmp` files are expected intermediate files; they are
  not left behind. Their contents account for the physical bytes written.
- Logs: Node writes stdout/stderr to journald sockets. Journald's own storage
  writes are not Node filesystem writes and were not attributed here.
- Framework: `.next` had no changes in the sample; no Next.js runtime cache
  write contribution was observed.

## ACCOUNTING

- `/proc` physical `write_bytes`: 74,359,223 bytes/min
- Concrete file writes estimated from observed complete snapshots:
  74,359,222 bytes/min
- Attributed: **99.999999%**
- Unexplained: **1 byte**, measurement/rounding residue

The close match also rejects the hypothesis that the reported volume was mainly
stdout, PostgreSQL protocol traffic, or an unobserved child process.

## CANDIDATE CLASSIFICATION

- ADSBDB snapshot: **G — do not change in this task**. It is material, but the
  obvious reductions all affect freshness durability, restart fallback, or the
  snapshot reader format. Existing 3-second coalescing is already present; no
  safe maximum durability window was established from consumers.
- METAR archive: **G — do not change in this task**. It is a full rewrite, but
  only one large replacement was observed and delta/compaction semantics are
  not implemented by its reader.
- Runtime telemetry/AUP: **A — required as-is** for their bounded operational
  and historical roles; savings are immaterial.

No optimization was implemented because the implementation gate requires a
safe, deterministic reduction mechanism, not merely a large byte count.

## TESTS / CPU / RAM / DURABILITY

- Code changes: none; focused/full test suites, typecheck, lint, and build were
  not rerun for this read-only artifact.
- Tracing: `strace`, `perf`, `bpftrace`, and `inotifywait` were unavailable; no
  package was installed. `/proc`, bounded descriptor sampling, and file
  metadata sampling were used. No tracing process was left running.
- CPU/RAM candidate comparison: not applicable; no candidate was implemented.
- Restart: not exercised; existing atomic-write code was inspected.
- Failed-write retry: existing code retains dirty state, but not newly tested.
- Atomicity: source inspection confirms `fsync` + rename for ADSBDB and
  telemetry; METAR/AUP use temp + rename without an explicit fsync.
- Database schema changed: NO
- Migration: NO
- Database persistence changed: NO
- Deployment by this audit: NO. A separate automated release did restart the
  service during the first capture and produced the current 1.0.209 process;
  this audit did not initiate it.

## NEXT STEP

**KEEP CURRENT FILESYSTEM BEHAVIOR**

If optimization is revisited, the specific next investigation is an isolated
ADSBDB persistence design benchmark comparing longer coalescing or a bounded
delta/compaction format while preserving last-known-good restart recovery.

AIRRADAR NODE FILESYSTEM WRITE OPTIMIZATION PASS
