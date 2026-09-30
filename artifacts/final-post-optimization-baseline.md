# AirRadar final post-optimization baseline and closure audit

Measurement ran on natural production traffic from **2026-09-30 06:48:59 to 07:18:59 CEST** (30.005 minutes). A separate `/proc/PID/io` interval ran for **30.330 minutes**. No synthetic traffic, application-code change, configuration change, schema change, deployment, or intentional restart was performed.

## Closure decision

**NO FURTHER OPTIMIZATION CURRENTLY JUSTIFIED**

The service stayed healthy, memory-stable after normal GC fluctuation, below CPU saturation, without a memory limit, without disk-saturation evidence, without persistence failures, without restart, and without an unbounded cache signal. The remaining measurable write and row-activity costs are traffic-dependent and do not currently justify semantic or production-risky changes.

## Repository and production state

- Local `HEAD` and `origin/main`: `2f646910a552cd74b973638f6d1a7250a680e734`; working tree clean.
- Production: version `1.0.225`, runtime SHA `111a3c2c`, built `2026-09-29T19:34:34Z`, uptime about 8.7 hours at final check, `NRestarts=0`.
- The runtime SHA is an ancestor of `main`; the difference is metadata/changelog-only. No alignment deployment was made.

## Runtime and traffic

Application, PostgreSQL, receiver/readsb, SSE, and system status stayed healthy. Local aircraft ranged from 51–71 (62 at start, 56 at end); readsb reported GOOD quality and fresh positions. adsb.lol had 23 timeouts and 6 HTTP errors, all in a recover-and-continue pattern. ADSBDB had 4 temporary unavailable events and 4 recoveries. These were upstream transient events, not live-path or persistence failures. Aviation Weather was on-demand and received no requests during the window.

CPU averaged **47.81% of one logical core** (48.96% in the IO interval), on 4 logical CPUs with unlimited quota and no observed throttling. Host one-minute load was 0.83–2.09. Event-loop p50/p95/p99 and direct GC metrics are unavailable without adding instrumentation; no serialization, synchronous-I/O, or long-block evidence was inferred from the observed health/CPU trend.

RSS was approximately 906 MiB at the first sample, peaked around 1.49 GiB, and ended around 1.12 GiB. Cgroup current memory was 895 MiB → 1.17 GiB, with a peak around 1.49 GiB; `memory.max` is unlimited. The post-peak plateau and heap-independent public telemetry support normal GC fluctuation, not a monotonic leak.

## Filesystem and disk

Node `/proc/PID/io` over 30.330 minutes measured:

| Metric | Rate |
|---|---:|
| Physical `write_bytes` | 37.17 MB/min |
| Logical `wchar` | 39.14 MB/min |
| Physical `read_bytes` | 0.076 MB/min |
| Write syscalls | 17,778/min |

Non-invasive attribution identifies bounded runtime categories including map-context archives, runtime telemetry, alert history/state, weather-radar frames, and the hourly ADSBDB checkpoint. Exact per-path shares require invasive tracing and were intentionally not added. `iostat` and `pidstat` are unavailable; no disk saturation symptom was observed. ZFS root usage is 9.2 GiB of 20 GiB (46%). This is an observation for future monitoring, not a P1 optimization stream.

## PostgreSQL

The database is about **1.76 GiB** with a **98.94%** global cache hit ratio. There was 1 active and 10 idle connection, no transaction older than five minutes, and no observed DB error. The 30-minute rates were 404.46 transactions/min, 333.94 inserts/min, 283.72 updates/min, 0.53 deletes/min, and 3.82 MB/min WAL (229.37 MB/hour; 5.50 GiB/day projection, traffic-dependent).

| Table | INSERT/min | UPDATE/min | DELETE/min | HOT | Total |
|---|---:|---:|---:|---:|---:|
| `Flight` | 4.37 | 144.74 | 0 | 9.67% | 56 MB |
| `FlightPosition` | 144.74 | 0 | 0 | — | 896 MB |
| `NavigationIntegrityObservation` | 91.35 | 0 | 0 | — | 206 MB |
| `ReceiverCoverageHourly` | 9.70 | 88.82 | 0 | 81.13% | 22 MB |
| `AircraftWeatherObservation` | 72.45 | 0 | 0 | — | 189 MB |
| `NavigationIntegrityAnomaly` | 6.37 | 25.83 | 0 | 36.39% | 27 MB |
| `Aircraft` | 0.03 | 13.66 | 0 | 100% | 5.7 MB |

`FlightPosition` remains the largest table/index footprint. Dead tuples were not pathological for the measured traffic, autovacuum/analyze activity was present, and `VACUUM FULL` was not run. Exact SQL statement attribution was unavailable because `pg_stat_statements` is not enabled; existing application lane diagnostics were used where exposed.

## Optimization streams

- **Aircraft UPDATE suppression: PASS / closed.** Current Aircraft updates are about 13.66/min, near the optimized 7–14/min range and far below the old ~135/min reference.
- **ReceiverCoverage cache: PASS / closed.** Cache remains bounded, cadence remains 120 seconds, and flush failures are zero. No Batch V2 work is justified.
- **ADSBDB persistence: PASS / closed.** The 60-minute checkpoint is retained; 8/8 observed checkpoints succeeded, cache entries remain bounded, and no write storm occurred.
- **Aviation Weather persistence: no failure observed / closed.** The 30-minute checkpoint is retained; the provider was inactive/on-demand in this window, with no checkpoint failure and no write storm.
- Flight `lastSeenAt` remains intentionally immediate. FlightPosition persistence and detector semantics were not changed.

## Ranking and future triggers

There is no current P0 or P1. Node physical writes are a P2 observation because storage is healthy and exact attribution would require invasive tracing; Flight/FlightPosition churn is P3/report-only because it is intentional and traffic-dependent. Re-audit if CPU sustains above 70–80% of one core, RSS approaches a real cgroup limit, DB/WAL growth materially increases, disk utilization/await becomes meaningful, persistent errors rise, traffic grows materially, or new features change persistence behavior.

