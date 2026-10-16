# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 208bf3e7 / 1.0.481
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.966 seconds
- Distinct major GC observations: 49
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 893.164 | 1427.105 | 1468.215 |
| heapUsed | 400.63 | 706.849 | 923.504 |
| oldSpace | 328.258 | 630.225 | 809.643 |

## Post-major-GC trend (MiB)

- heapUsed: 40.759
- rss: -531.691
- oldSpace: 40.689

## CPU and event loop

- CPU interval P50/P95: 24.843 / 39.241 %
- Completed 60-second event-loop p99 P50/P95/max: 34.603 / 38.306 / 55.312 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":2857,"p50":2857,"p95":2857,"max":2857,"mean":2857},"p95Ms":{"count":51,"min":3183,"p50":3183,"p95":3183,"max":3183,"mean":3183},"p99Ms":{"count":51,"min":3432,"p50":3432,"p95":3432,"max":3432,"mean":3432},"maxMs":{"count":51,"min":3432,"p50":3432,"p95":3432,"max":3432,"mean":3432}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":2857,"p50":2857,"p95":2857,"max":2857,"mean":2857},"p95Ms":{"count":51,"min":3183,"p50":3183,"p95":3183,"max":3183,"mean":3183},"p99Ms":{"count":51,"min":3431,"p50":3431,"p95":3431,"max":3431,"mean":3431},"maxMs":{"count":51,"min":3431,"p50":3431,"p95":3431,"max":3431,"mean":3431}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":9,"p50":9,"p95":9,"max":9,"mean":9},"p95Ms":{"count":51,"min":320,"p50":320,"p95":320,"max":320,"mean":320},"p99Ms":{"count":51,"min":328,"p50":328,"p95":328,"max":328,"mean":328},"maxMs":{"count":51,"min":328,"p50":328,"p95":328,"max":328,"mean":328}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":8,"p50":8,"p95":8,"max":8,"mean":8},"p95Ms":{"count":51,"min":20,"p50":20,"p95":20,"max":20,"mean":20},"p99Ms":{"count":51,"min":20,"p50":20,"p95":20,"max":20,"mean":20},"maxMs":{"count":51,"min":20,"p50":20,"p95":20,"max":20,"mean":20}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":8.645,"p50":8.645,"p95":8.645,"max":8.645,"mean":8.645},"p95Ms":{"count":51,"min":309.086,"p50":309.086,"p95":309.086,"max":309.086,"mean":309.086},"p99Ms":{"count":51,"min":327.194,"p50":327.194,"p95":327.194,"max":327.194,"mean":327.194},"maxMs":{"count":51,"min":327.194,"p50":327.194,"p95":327.194,"max":327.194,"mean":327.194}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":8.949,"p50":8.949,"p95":8.949,"max":8.949,"mean":8.949},"p95Ms":{"count":51,"min":319.351,"p50":319.351,"p95":319.351,"max":319.351,"mean":319.351},"p99Ms":{"count":51,"min":327.194,"p50":327.194,"p95":327.194,"max":327.194,"mean":327.194},"maxMs":{"count":51,"min":327.194,"p50":327.194,"p95":327.194,"max":327.194,"mean":327.194}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":8.599,"p50":8.599,"p95":8.599,"max":8.599,"mean":8.599},"p95Ms":{"count":51,"min":19.327,"p50":19.327,"p95":19.327,"max":19.327,"mean":19.327},"p99Ms":{"count":51,"min":19.327,"p50":19.327,"p95":19.327,"max":19.327,"mean":19.327},"maxMs":{"count":51,"min":19.327,"p50":19.327,"p95":19.327,"max":19.327,"mean":19.327}},"dbMaintenanceSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbMaintenanceCount":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbMaintenancePrune":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 43
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 82
- SSE clients P50: 0
- Network trail points P50/max: 78595 / 83558

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 9
- networkAircraft: 16
- localStaleRetained: 0
- networkStaleRetained: -3
- sourcePreferences: 16
- lastHistorySample: 231
- networkTrailPoints: -1273

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.network | 51 | 2749 | 46438.248 | 0 | 102.652 |
| history.persist | 51 | 1008 | 37723.424 | 3007.425 | 934.02 |
| history.transaction | 51 | 1008 | 37701.18 | 3005.454 | 933.989 |
| snapshot.trail-update | 51 | 3919018 | 17544.381 | 0 | 0.014 |
| snapshot.trackFusion | 51 | 3757 | 17430.455 | 0 | 67.283 |
| snapshot.apply.total | 51 | 1008 | 16230.42 | 0 | 112.404 |
| snapshot.local | 51 | 1008 | 16227.504 | 0 | 112.4 |
| snapshot.navigationIntegrity | 51 | 3757 | 9111.503 | 0 | 98.935 |
| snapshot.intelligence | 51 | 1008 | 4685.373 | 0 | 16.979 |
| atc.dataset.freeze.coordinates | 10 | 203 | 1292.129 | 0 | 12.763 |
| atc.dataset.orm-materialization | 9 | 9 | 1208.264 | 0 | 220.752 |
| atc.dataset.polygon-json-parse | 10 | 1140 | 1155.319 | 0 | 12.333 |
| twin.eventOutcome.local | 51 | 1008 | 46.095 | 0 | 0.128 |
| twin.outcome.truth | 51 | 1008 | 17.846 | 0 | 0.217 |
| twin.trajectoryQuality.truth | 51 | 1008 | 13.695 | 0 | 0.144 |
| twin.trajectoryQualityV2.truth | 51 | 1008 | 11.344 | 0 | 0.063 |
| twin.regionalAttention.truth | 51 | 1008 | 3.147 | 0 | 0.04 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":0,"r":null},"twin.eventOutcome.local":{"samples":51,"r":-0.008},"history.persist":{"samples":51,"r":-0.039},"network.metadata":{"samples":0,"r":null},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":1,"r":null},"gc.pause":{"samples":51,"r":0.014},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

