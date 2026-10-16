# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: a19febff / 1.0.482
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.817 seconds
- Distinct major GC observations: 44
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 993.453 | 1483.367 | 1520.078 |
| heapUsed | 485.968 | 991.108 | 1135.244 |
| oldSpace | 410.674 | 875.023 | 1029.166 |

## Post-major-GC trend (MiB)

- heapUsed: 16.815
- rss: -492.781
- oldSpace: 19.576

## CPU and event loop

- CPU interval P50/P95: 20.561 / 37.091 %
- Completed 60-second event-loop p99 P50/P95/max: 51.347 / 65.864 / 70.058 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.843},"p95Ms":{"count":51,"min":1,"p50":2,"p95":4,"max":4,"mean":2.137},"p99Ms":{"count":51,"min":2,"p50":4,"p95":52,"max":76,"mean":7.49},"maxMs":{"count":51,"min":5,"p50":32,"p95":2577,"max":3522,"mean":214.176}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":2,"mean":0.961}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.843},"p95Ms":{"count":51,"min":1,"p50":2,"p95":4,"max":4,"mean":2.137},"p99Ms":{"count":51,"min":2,"p50":4,"p95":58,"max":76,"mean":8.667},"maxMs":{"count":51,"min":5,"p50":32,"p95":2577,"max":3522,"mean":214.059}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":4,"p50":6,"p95":7,"max":7,"mean":5.843},"p95Ms":{"count":51,"min":21,"p50":46,"p95":47,"max":47,"mean":41.706},"p99Ms":{"count":51,"min":61,"p50":62,"p95":69,"max":69,"mean":64.529},"maxMs":{"count":51,"min":71,"p50":71,"p95":72,"max":72,"mean":71.392}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.882}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":2,"p50":3,"p95":5,"max":5,"mean":3.314},"p95Ms":{"count":51,"min":10,"p50":10,"p95":13,"max":13,"mean":10.451},"p99Ms":{"count":51,"min":13,"p50":277,"p95":277,"max":277,"mean":209.706},"maxMs":{"count":51,"min":277,"p50":277,"p95":277,"max":277,"mean":277}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.64,"p50":5.305,"p95":5.764,"max":5.777,"mean":5.326},"p95Ms":{"count":51,"min":18.183,"p50":43.356,"p95":46.165,"max":46.354,"mean":38.615},"p99Ms":{"count":51,"min":60.966,"p50":62.727,"p95":71.049,"max":71.049,"mean":65.818},"maxMs":{"count":51,"min":277.289,"p50":277.289,"p95":277.289,"max":277.289,"mean":277.289}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.312,"p50":5.862,"p95":6.755,"max":6.755,"mean":5.883},"p95Ms":{"count":51,"min":20.224,"p50":46.059,"p95":46.684,"max":47.06,"mean":41.52},"p99Ms":{"count":51,"min":60.966,"p50":62.727,"p95":69.021,"max":69.021,"mean":64.808},"maxMs":{"count":51,"min":71.049,"p50":71.049,"p95":71.225,"max":71.225,"mean":71.118}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":2.281,"p50":3.167,"p95":4.739,"max":4.739,"mean":3.333},"p95Ms":{"count":51,"min":9.899,"p50":10.183,"p95":12.544,"max":12.544,"mean":10.384},"p99Ms":{"count":51,"min":12.544,"p50":277.289,"p95":277.289,"max":277.289,"mean":209.805},"maxMs":{"count":51,"min":277.289,"p50":277.289,"p95":277.289,"max":277.289,"mean":277.289}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":47,"min":4.123,"p50":4.123,"p95":4.123,"max":4.123,"mean":4.123},"p95Ms":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21},"p99Ms":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21},"maxMs":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":47,"min":4.123,"p50":4.123,"p95":4.123,"max":4.123,"mean":4.123},"p95Ms":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21},"p99Ms":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21},"maxMs":{"count":47,"min":4.123,"p50":10.319,"p95":10.319,"max":10.319,"mean":8.21}},"dbMaintenancePrune":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 36
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 59
- SSE clients P50: 0
- Network trail points P50/max: 73827 / 80660

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: -10
- networkAircraft: -227
- localStaleRetained: 1
- networkStaleRetained: 2
- sourcePreferences: -227
- lastHistorySample: 191
- networkTrailPoints: -6587

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.network | 51 | 2704 | 42452.551 | 0 | 105.983 |
| history.persist | 51 | 990 | 39779.134 | 2895.105 | 688.376 |
| history.transaction | 51 | 990 | 39740.67 | 2895.269 | 688.345 |
| snapshot.apply.total | 51 | 990 | 34279.53 | 0 | 230.573 |
| snapshot.local | 51 | 990 | 34274.718 | 0 | 230.566 |
| snapshot.operationalTwin | 51 | 990 | 19850.403 | 0 | 104.33 |
| twin.eventOutcome.local | 51 | 990 | 19767.768 | 0 | 104.234 |
| snapshot.trail-update | 51 | 3514526 | 16117.915 | 0 | 0.344 |
| snapshot.trackFusion | 51 | 3694 | 15831.345 | 0 | 55.289 |
| network.metadata | 51 | 987 | 14388.359 | 10382.685 | 3521.251 |
| snapshot.navigationIntegrity | 51 | 3694 | 8203.598 | 0 | 90.131 |
| snapshot.intelligence | 51 | 990 | 3812.317 | 0 | 17.465 |
| twin.outcome.truth | 51 | 990 | 25.203 | 0 | 0.118 |
| twin.trajectoryQualityV2.truth | 51 | 990 | 18.279 | 0 | 0.097 |
| twin.trajectoryQuality.truth | 51 | 990 | 17.378 | 0 | 0.128 |
| twin.regionalAttention.truth | 51 | 990 | 4.939 | 0 | 0.079 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.02},"twin.eventOutcome.local":{"samples":51,"r":-0.02},"history.persist":{"samples":51,"r":0.111},"network.metadata":{"samples":51,"r":0.26},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":0.067},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

