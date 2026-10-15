# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: c5539b03 / 1.0.469
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.627 seconds
- Distinct major GC observations: 50
- Distinct completed event-loop windows: 50

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 877.918 | 897.762 | 922.949 |
| heapUsed | 410.631 | 491.743 | 533.179 |
| oldSpace | 335.286 | 404.903 | 460.946 |

## Post-major-GC trend (MiB)

- heapUsed: 13.038
- rss: 43.625
- oldSpace: 12.884

## CPU and event loop

- CPU interval P50/P95: 25.946 / 94.139 %
- Completed 60-second event-loop p99 P50/P95/max: 35.095 / 46.105 / 47.841 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":1,"p50":2,"p95":3,"max":3,"mean":2.039},"p99Ms":{"count":51,"min":2,"p50":4,"p95":43,"max":50,"mean":7.725},"maxMs":{"count":51,"min":10,"p50":72,"p95":697,"max":3526,"mean":283.078}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":2,"mean":0.745}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":2,"p50":2,"p95":3,"max":3,"mean":2.059},"p99Ms":{"count":51,"min":2,"p50":4,"p95":44,"max":50,"mean":8.725},"maxMs":{"count":51,"min":10,"p50":64,"p95":697,"max":3526,"mean":255.118}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":6,"p50":7,"p95":10,"max":11,"mean":6.941},"p95Ms":{"count":51,"min":25,"p50":28,"p95":137,"max":137,"mean":52.51},"p99Ms":{"count":51,"min":138,"p50":138,"p95":141,"max":141,"mean":139.412},"maxMs":{"count":51,"min":141,"p50":534,"p95":534,"max":534,"mean":341.353}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":1,"max":1,"mean":0.196},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.745}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":5,"p95":8,"max":9,"mean":5.275},"p95Ms":{"count":51,"min":14,"p50":18,"p95":25,"max":76,"mean":21.275},"p99Ms":{"count":51,"min":76,"p50":76,"p95":76,"max":76,"mean":76},"maxMs":{"count":51,"min":76,"p50":76,"p95":76,"max":76,"mean":76}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.514,"p50":5.788,"p95":9.843,"max":9.944,"mean":6.253},"p95Ms":{"count":51,"min":24.56,"p50":25.084,"p95":135.815,"max":135.815,"mean":40.59},"p99Ms":{"count":51,"min":136.301,"p50":137.358,"p95":140.63,"max":140.63,"mean":137.538},"maxMs":{"count":51,"min":140.63,"p50":533.468,"p95":533.468,"max":533.468,"mean":340.9}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.902,"p50":6.651,"p95":10.416,"max":11.507,"mean":7.029},"p95Ms":{"count":51,"min":24.975,"p50":27.028,"p95":136.301,"max":136.301,"mean":52.074},"p99Ms":{"count":51,"min":137.358,"p50":137.358,"p95":140.63,"max":140.63,"mean":138.898},"maxMs":{"count":51,"min":140.63,"p50":533.468,"p95":533.468,"max":533.468,"mean":340.9}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.762,"p50":4.813,"p95":7.407,"max":9.843,"mean":5.261},"p95Ms":{"count":51,"min":13.899,"p50":18.613,"p95":24.56,"max":75.677,"mean":21.442},"p99Ms":{"count":51,"min":75.677,"p50":75.677,"p95":75.677,"max":75.677,"mean":75.677},"maxMs":{"count":51,"min":75.677,"p50":75.677,"p95":75.677,"max":75.677,"mean":75.677}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":46,"min":9.365,"p50":9.365,"p95":10.633,"max":10.633,"mean":9.778},"p95Ms":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645},"p99Ms":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645},"maxMs":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":46,"min":9.365,"p50":9.365,"p95":10.633,"max":10.633,"mean":9.778},"p95Ms":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645},"p99Ms":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645},"maxMs":{"count":46,"min":10.633,"p50":10.633,"p95":10.633,"max":11.173,"mean":10.645}},"dbMaintenancePrune":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 61
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 44
- SSE clients P50: 0
- Network trail points P50/max: 25967 / 30752

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: -8
- networkAircraft: -146
- localStaleRetained: -1
- networkStaleRetained: 0
- sourcePreferences: -145
- lastHistorySample: 109
- networkTrailPoints: -7352

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.apply.total | 51 | 990 | 43904.928 | 0 | 121.08 |
| snapshot.local | 51 | 990 | 43902.782 | 0 | 121.078 |
| snapshot.operationalTwin | 51 | 990 | 36008.757 | 0 | 87.372 |
| twin.eventOutcome.local | 51 | 990 | 35928.668 | 0 | 87.313 |
| history.persist | 51 | 990 | 27928.514 | 1561.722 | 659.241 |
| history.transaction | 51 | 990 | 27905.498 | 1558.631 | 659.22 |
| snapshot.network | 51 | 2700 | 15228.329 | 0 | 83.108 |
| network.metadata | 51 | 987 | 14126.788 | 13121.264 | 3529.79 |
| snapshot.trail-update | 51 | 1247941 | 5390.979 | 0 | 0.128 |
| snapshot.trackFusion | 51 | 3690 | 5327.495 | 0 | 20.63 |
| snapshot.navigationIntegrity | 51 | 3690 | 4603.709 | 0 | 63.197 |
| snapshot.intelligence | 51 | 990 | 2802.642 | 0 | 18.391 |
| twin.outcome.truth | 51 | 990 | 24.11 | 0 | 0.13 |
| twin.trajectoryQuality.truth | 51 | 990 | 18.921 | 0 | 1.8 |
| twin.trajectoryQualityV2.truth | 51 | 990 | 17.312 | 0 | 0.102 |
| twin.regionalAttention.truth | 51 | 990 | 5.341 | 0 | 0.065 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.183},"twin.eventOutcome.local":{"samples":51,"r":-0.183},"history.persist":{"samples":51,"r":-0.076},"network.metadata":{"samples":51,"r":0.069},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":50,"r":-0.176},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

