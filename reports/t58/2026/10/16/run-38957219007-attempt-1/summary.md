# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: f19d457b / 1.0.483
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.996 seconds
- Distinct major GC observations: 51
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 865.012 | 904.148 | 915.086 |
| heapUsed | 483.73 | 568.152 | 619.137 |
| oldSpace | 408.636 | 476.298 | 529.657 |

## Post-major-GC trend (MiB)

- heapUsed: -76.798
- rss: 91.492
- oldSpace: -70.004

## CPU and event loop

- CPU interval P50/P95: 18.884 / 29.586 %
- Completed 60-second event-loop p99 P50/P95/max: 40.108 / 54.067 / 64.946 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.941},"p95Ms":{"count":51,"min":1,"p50":2,"p95":2,"max":3,"mean":1.843},"p99Ms":{"count":51,"min":1,"p50":3,"p95":18,"max":52,"mean":5.51},"maxMs":{"count":51,"min":4,"p50":60,"p95":3503,"max":3513,"mean":495}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.725}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.902},"p95Ms":{"count":51,"min":1,"p50":2,"p95":2,"max":3,"mean":1.824},"p99Ms":{"count":51,"min":1,"p50":3,"p95":18,"max":52,"mean":5.451},"maxMs":{"count":51,"min":4,"p50":60,"p95":3503,"max":3513,"mean":558.706}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":5,"p95":6,"max":6,"mean":5.098},"p95Ms":{"count":51,"min":31,"p50":37,"p95":98,"max":106,"mean":45.51},"p99Ms":{"count":51,"min":106,"p50":298,"p95":298,"max":298,"mean":213.765},"maxMs":{"count":51,"min":298,"p50":298,"p95":298,"max":298,"mean":298}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":1,"mean":0.02},"maxMs":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":2,"p50":2,"p95":2,"max":2,"mean":2},"p95Ms":{"count":51,"min":3,"p50":7,"p95":7,"max":7,"mean":5.922},"p99Ms":{"count":51,"min":10,"p50":60,"p95":60,"max":60,"mean":42.353},"maxMs":{"count":51,"min":10,"p50":60,"p95":60,"max":60,"mean":42.353}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":3.249,"p50":4.251,"p95":4.49,"max":4.49,"mean":4.057},"p95Ms":{"count":51,"min":28.51,"p50":34.71,"p95":49.812,"max":52.969,"mean":36.945},"p99Ms":{"count":51,"min":106.014,"p50":112.35,"p95":298.157,"max":298.157,"mean":171.827},"maxMs":{"count":51,"min":298.284,"p50":298.284,"p95":298.284,"max":298.284,"mean":298.284}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.542,"p50":5.141,"p95":5.376,"max":5.408,"mean":5.072},"p95Ms":{"count":51,"min":31.382,"p50":37.675,"p95":97.58,"max":106.014,"mean":45.546},"p99Ms":{"count":51,"min":106.519,"p50":298.015,"p95":298.157,"max":298.157,"mean":213.977},"maxMs":{"count":51,"min":298.284,"p50":298.284,"p95":298.284,"max":298.284,"mean":298.284}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":1.27,"p50":1.335,"p95":1.359,"max":1.388,"mean":1.335},"p95Ms":{"count":51,"min":3.032,"p50":6.902,"p95":7.344,"max":7.344,"mean":5.905},"p99Ms":{"count":51,"min":9.964,"p50":60.427,"p95":60.427,"max":60.427,"mean":42.617},"maxMs":{"count":51,"min":9.964,"p50":60.427,"p95":60.427,"max":60.427,"mean":42.617}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":2.43,"p50":2.43,"p95":3.155,"max":3.155,"mean":2.757},"p95Ms":{"count":51,"min":3.155,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.247},"p99Ms":{"count":51,"min":3.155,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.247},"maxMs":{"count":51,"min":3.155,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.247}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":51,"min":1.897,"p50":2.43,"p95":2.43,"max":2.43,"mean":2.294},"p95Ms":{"count":51,"min":2.43,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.062},"p99Ms":{"count":51,"min":2.43,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.062},"maxMs":{"count":51,"min":2.43,"p50":5.962,"p95":5.962,"max":5.962,"mean":5.062}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":51,"min":3.155,"p50":3.155,"p95":3.155,"max":3.155,"mean":3.155},"p95Ms":{"count":51,"min":3.155,"p50":3.155,"p95":4.302,"max":4.302,"mean":3.38},"p99Ms":{"count":51,"min":3.155,"p50":3.155,"p95":4.302,"max":4.302,"mean":3.38},"maxMs":{"count":51,"min":3.155,"p50":3.155,"p95":4.302,"max":4.302,"mean":3.38}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 58
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 51
- SSE clients P50: 0
- Network trail points P50/max: 53080 / 58026

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: -4
- networkAircraft: -141
- localStaleRetained: -1
- networkStaleRetained: 0
- sourcePreferences: -141
- lastHistorySample: 100
- networkTrailPoints: -8440

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.apply.total | 51 | 992 | 29943.799 | 0 | 156.988 |
| snapshot.local | 51 | 992 | 29939.346 | 0 | 156.977 |
| history.persist | 51 | 992 | 29767.376 | 1499.614 | 737.642 |
| history.transaction | 51 | 992 | 29745.431 | 1496.274 | 737.622 |
| snapshot.network | 51 | 2692 | 28501.622 | 0 | 74.558 |
| snapshot.operationalTwin | 51 | 992 | 19590.574 | 0 | 110.252 |
| twin.eventOutcome.local | 51 | 992 | 19501.757 | 0 | 110.15 |
| network.metadata | 51 | 988 | 12369.52 | 15101.976 | 3515.126 |
| snapshot.trail-update | 51 | 2339234 | 10865.968 | 0 | 0.276 |
| snapshot.trackFusion | 51 | 3684 | 10515.355 | 0 | 37.498 |
| snapshot.navigationIntegrity | 51 | 3684 | 6280.683 | 0 | 87.241 |
| snapshot.intelligence | 51 | 992 | 3018.055 | 0 | 10.702 |
| twin.outcome.truth | 51 | 992 | 30.134 | 0 | 2.239 |
| twin.trajectoryQualityV2.truth | 51 | 992 | 21.484 | 0 | 0.513 |
| twin.trajectoryQuality.truth | 51 | 992 | 17.925 | 0 | 0.087 |
| twin.regionalAttention.truth | 51 | 992 | 5.175 | 0 | 0.013 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":0.239},"twin.eventOutcome.local":{"samples":51,"r":0.239},"history.persist":{"samples":51,"r":0.216},"network.metadata":{"samples":51,"r":0.057},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":0.059},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

