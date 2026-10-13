# Autonomous performance and reliability optimization

[Česká verze](../cs/performance/AUTONOMOUS-OPTIMIZATION.md)

Status: runtime fix deployed; post-release soak in progress. Last updated:
2026-10-13 (Europe/Prague).

## Scope and evidence

This report records the production investigation for measurement ID
`9b6f1bd2-1efa-4846-a1cc-a45b086d16ca`. The source artifact remains at
`/tmp/airradar-t57-v5-aSXmmm/soak.ndjson`; it is not copied into the
repository or uploaded. The artifact's analyzer correctly refused to process
the journal without authorized diagnostics, so the figures below are derived
from the bounded samples and correlated with local systemd evidence.

The baseline soak was captured on version `1.0.437`, commit `3596e96e`. During
the investigation production advanced through `1.0.438`; the confirmed fix is
now deployed as version `1.0.439`, commit `954fab24`, built at
`2026-10-13T12:23:12Z`. The production service remains `airradar.service`, one
Node process, with systemd restart policy `Restart=on-failure` and no service
`MemoryMax` limit; the enclosing `system.slice` is where memory pressure and
the recorded OOM kills occurred.

## Baseline

The soak produced three valid sample segments separated by unavailable
periods:

| Segment | Samples | UTC interval | CPU p50 / p95 | RSS p50 / max | event-loop p99 maximum |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 45 | 08:22:10–09:15:12 | 82.9% / 92.0% | 1.84 / 1.91 GiB | 8.3 s |
| 2 | 26 | 09:22:13–09:50:11 | 77.8% / 99.0% | 1.38 / 1.92 GiB | 6.5 s |
| 3 | 19 | 09:54:11–10:22:15 | 93.1% / 100% | 1.68 / 1.73 GiB | 9.6 s |

The route-cache circuit was open in 44/45, 25/26, and 19/19 samples. The
samples show elapsed route-cache DB settlement and caller timeout behavior;
they do not prove server-side SQL time. The highest final-segment inclusive
hot-path percentiles were approximately `history.persist` 55.6 s,
`history.transaction` 55.6 s, `network.metadata` 4.5 s, `atc.resolve` 4.5 s,
`snapshot.apply.total` 3.7 s, and the operational-twin/event-outcome scopes
3.6 s. Nested timings are intentionally not summed as exclusive CPU.

## Process-segment correlation

The gaps in the soak are process segments, not assumed deployment boundaries.
The journal confirmed:

- 11:21:03 CEST: PID 249582 killed by the OOM killer; systemd result
  `oom-kill`; 1.9 GiB peak.
- 11:53:03 CEST: PID 251820 killed by the OOM killer; systemd result
  `oom-kill`; 1.9 GiB peak.
- 13:26:47 CEST: PID 252336 killed by the OOM killer; systemd result
  `oom-kill`; 1.9 GiB peak.

Earlier clean SIGTERM restarts were kept separate from the soak correlation.
After the latest restart, the service recovered and the public health endpoint
reported local source data, but production remained on `1.0.437` until this
change is released.

## Root-cause assessment

Confirmed reliability failure: the single live Node process reached the
enclosing systemd/cgroup memory-pressure condition and was killed, while CPU
and event-loop delay were already high. The service cgroup itself has
`MemoryMax=infinity`, so the evidence does not identify a service-local hard
limit. Confirmed latency evidence includes multi-second event-loop windows and
late route-cache settlements. Bounded retention diagnostics did not identify a
single unbounded aircraft map or trail as the cause; the underlying allocation
retainer therefore remains unproven and is not changed speculatively here.

Confirmed avoidable overhead: the one-minute systemd watchdog polled the full
`/api/system/status` response. That path performs broad diagnostics, optional
provider checks, and database work, and its requests were observed aborting
during event-loop stalls. The watchdog only needs ADSB.lol freshness, so this
was selected as the first safe optimization.

## Permanent monitoring change

The existing 60-second, 24-hour, 1,440-sample runtime telemetry file now also
stores bounded process-local aggregates: PID/build identity, CPU, event-loop
percentiles, GC totals, route DB settlement p95, circuit state, selected hot
path p95 values, and retention counts. It maintains a small persisted incident
ledger with stable IDs (`runtime-cpu`, `runtime-event_loop`,
`runtime-database_call`, `runtime-route_circuit`, and `runtime-availability`).

Thresholds are CPU p95 >85%, event-loop p99 >1,000 ms, DB-call p95 >1,000 ms,
circuit open >50%, and availability <95%. A warning is emitted for a current
breach, degraded for 3 of 5 windows, and critical for three consecutive
windows. Sampling failures increase the bounded availability ledger; no raw
request, aircraft, provider response, or secret is persisted. The monitor has
no code/config/schema/deploy mutation path.

The systemd watchdog now uses `/api/health?watchdog=1`, a minimal readiness and
ADSB freshness response. The full status route remains available for
authorized diagnostics.

The main hot-path optimization is now deployed. The Operational Twin
event-outcome validator keeps a bounded reverse index from ICAO hex to pending
outcome IDs, iterates only aircraft present in the current local snapshot, and
skips trail-point work when the pending time window cannot overlap the current
truth trail. Resolution, expiry, capacity eviction, and reset remove entries
from both maps, preserving the existing bounded queue contract.

The change was merged in PR #847 (`f4bbf269`) and released with the identity
fix in PR #848 (`954fab24`). CI passed the full Vitest/typecheck gate, prepared
build, critical runtime smoke, production browser gate, performance regression,
and CodeQL. The synthetic event-outcome benchmark was run as a regression
check, but its scenario was not treated as proof of a production speedup.

Post-release evidence at 2026-10-13 14:29 CEST: public health returned `200`
with database and local-beast source healthy, `/api/version` returned
`1.0.439` / `954fab24` / `production`, the service was active with
`NRestarts=0`, and the new process was approximately 0.7 GiB resident. This is
an initial post-restart observation, not evidence that the leak question is
closed.

## Verification and follow-up

Focused tests cover the health probe, watchdog stale/recent behavior, monitor
incident transitions, unavailable samples, telemetry persistence, and bounded
event-outcome index cleanup. The full CI typecheck and Vitest gate passes. A
24-hour post-release soak must verify reduced watchdog overhead and recheck
RSS, event-loop delay, DB settlement, and the incident ledger. If RSS still
trends toward system memory pressure, the next investigation is an authorized
heap/retainer capture correlated with the persisted retention and hot-path
counters; no heap snapshot is stored by the monitor.
