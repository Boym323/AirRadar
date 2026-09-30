# AirRadar Node Write Attribution V4

## RESULT

C — MULTIPLE MATERIAL WRITERS

## STRACE

- Installed before: NO
- Temporarily installed: YES (`6.13+ds-1`)
- Removed afterward: YES; only `strace` was removed, with no autoremove.
- Raw pilot and full traces were aggregated and then deleted from `/tmp`.

## WINDOW

PID `94888` remained stable. Production version `1.0.226`, API commit `06e8aae5`, repository runtime SHA `67953ab8d39e522edbedc5e4e6b8b024b936c298`. The configured trace was 300 seconds; observed syscall interval was 299.322 seconds (`10:54:29.410212`–`10:59:28.732514` CEST). Natural traffic only.

## HEALTH

Application, database, receiver/source, and readsb health were OK before, during, and after. MainPID stayed `94888`. A final `/api/stream` request delivered an SSE snapshot. No restart occurred.

## NODE IO

| Metric | Delta | Rate |
|---|---:|---:|
| `write_bytes` | 192,598,883 | 38.607 MB/min |
| `wchar` | 205,541,730 | 41.201 MB/min |
| `syscw` | 38,716 | 7,760.7/min |

## ATTRIBUTION

| Path | Subsystem | Type/pattern | MB/min | Share | Calls/min | Avg write |
|---|---|---|---:|---:|---:|---:|
| `/var/lib/airradar/map-context-wind-v1.json.tmp` → `map-context-wind-v1.json` | Historical wind | temp, atomic replace | 23.662 | 57.49% | 50.11 | 472,175 B |
| `/var/lib/airradar/map-context-metar-v1.json.tmp` → `map-context-metar-v1.json` | Historical METAR | temp, atomic replace | 14.505 | 35.24% | 28.07 | 516,853 B |
| `/var/lib/airradar/runtime-telemetry-v1.json.tmp-94888` | Runtime telemetry | temp, atomic replace | 0.429 | 1.04% | 1.00 | 427,615 B |

The remaining regular-file writers were OGN DDB (0.011%), AUP/UUP (0.010%), alert state (0.005%), weather radar (0.002%), and alert JSONL append (0.0002%). No deleted-but-open regular file was held by PID `94888` at the final check. One failed cleanup `unlink` returned `ENOENT`.

## LOGICAL ACCOUNTING

Successful write-family syscall returns totaled 205,332,937 bytes across 28,783 calls: 41.160 MB/min. This reconciles to 99.898% of the `/proc/94888/io` `wchar` delta. Write-size buckets were `<1 KB`: 25,655; `1–4 KB`: 2,090; `4–16 KB`: 667; `16–64 KB`: 1; `>64 KB`: 370.

## PHYSICAL VS LOGICAL

Logical writes were 41.160 MB/min versus physical `write_bytes` of 38.607 MB/min (93.80% of logical). The difference is expected from page-cache, overwrite, filesystem-block, and metadata accounting.

## SOURCE CODE

The material file writers map exactly to [`lib/server/map-context.ts`](../lib/server/map-context.ts): `JsonArchive.replace()` uses `writeFile` then `rename`; `MapContextArchive.addWind()` writes five wind levels per map-context poll, and `addMetar()` writes one batched airport observation snapshot per poll. The runtime telemetry writer is [`lib/server/runtime-telemetry.ts`](../lib/server/runtime-telemetry.ts), `RuntimeTelemetryStore.writeSnapshot()`.

## METAR ARCHIVE

`/var/lib/airradar/map-context-metar-v1.json.tmp` accounted for 72,359,375 logical bytes: 14.505 MB/min, 35.24% of traced logical writes, 28.07 calls/min, and 516,853 bytes/write. The pattern was atomic replacement, batch/timer based at approximately one map-context poll per minute—not one write per METAR. It stores historical Aviation Weather Center observations. It is reconstructable historical/cache data; minutes of loss are acceptable under the observed product semantics. No buffering change was implemented.

## OTHER DOMINANT ARCHIVE

The wind archive was larger: `/var/lib/airradar/map-context-wind-v1.json.tmp` accounted for 118,043,675 bytes, 23.662 MB/min and 57.49%. It stores five historical model snapshots per poll and is also reconstructable historical/cache data. Together wind and METAR account for 92.73%, therefore the correct decision is multiple material writers.

## TEMP/DELETED FILES

All listed temporary files were atomic-rename sources. No deleted-but-open Node regular file remained at final inspection. Raw trace files were deleted and verified absent.

## STDOUT/STDERR

The journal payload for PID `94888` during the trace window was 259 bytes, approximately 0.000052 MB/min. UNIX-stream writes to stdout/stderr were classified separately from persistent files and were not attributed to the filesystem total; they were not a material filesystem writer.

## ADSBDB / AVIATION WEATHER CACHE

ADSBDB checkpoint writes: 0. Aviation-weather checkpoint writes: 0. Neither regressed during the window.

## TRACE OVERHEAD

The 50-second pilot kept health, database, receiver, and SSE behavior OK. CPU remained about 53.3% before/during, with no observed material latency or event-loop symptom. The 5-minute trace completed without restart or PID change.

## NEXT STEP

SEPARATE MULTIPLE WRITE STREAMS

AIRRADAR NODE WRITE ATTRIBUTION V4 PASS
