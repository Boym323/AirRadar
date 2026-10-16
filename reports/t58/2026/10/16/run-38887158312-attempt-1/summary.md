# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 47a1286d / 1.0.477
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.915 seconds
- Distinct major GC observations: 50
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 1015.938 | 1043.059 | 1044.98 |
| heapUsed | 474.051 | 564.236 | 591.066 |
| oldSpace | 394.991 | 479.464 | 492.752 |

## Post-major-GC trend (MiB)

- heapUsed: 34.956
- rss: 10.512
- oldSpace: 33.768

## CPU and event loop

- CPU interval P50/P95: 19.551 / 28.257 %
- Completed 60-second event-loop p99 P50/P95/max: 49.316 / 65.339 / 87.097 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":1,"max":1,"mean":0.098},"p95Ms":{"count":51,"min":1,"p50":2,"p95":3,"max":4,"mean":1.804},"p99Ms":{"count":51,"min":1,"p50":3,"p95":4,"max":5,"mean":2.843},"maxMs":{"count":51,"min":8,"p50":21,"p95":72,"max":3508,"mean":94.804}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.725}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":1,"max":1,"mean":0.098},"p95Ms":{"count":51,"min":1,"p50":2,"p95":3,"max":4,"mean":1.784},"p99Ms":{"count":51,"min":1,"p50":3,"p95":4,"max":5,"mean":2.843},"maxMs":{"count":51,"min":8,"p50":21,"p95":72,"max":3508,"mean":94.804}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":8,"p50":8,"p95":8,"max":9,"mean":8.02},"p95Ms":{"count":51,"min":37,"p50":41,"p95":94,"max":94,"mean":45.02},"p99Ms":{"count":51,"min":121,"p50":175,"p95":414,"max":414,"mean":235.843},"maxMs":{"count":51,"min":415,"p50":415,"p95":415,"max":415,"mean":415}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":2,"max":2,"mean":1.431},"p95Ms":{"count":51,"min":11,"p50":11,"p95":11,"max":11,"mean":11},"p99Ms":{"count":51,"min":508,"p50":508,"p95":508,"max":508,"mean":508},"maxMs":{"count":51,"min":508,"p50":508,"p95":508,"max":508,"mean":508}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":6.695,"p50":7.149,"p95":7.611,"max":7.715,"mean":7.177},"p95Ms":{"count":51,"min":37.366,"p50":39.44,"p95":45.842,"max":53.665,"mean":40.567},"p99Ms":{"count":51,"min":130.277,"p50":245.388,"p95":414.533,"max":414.533,"mean":265.119},"maxMs":{"count":51,"min":507.886,"p50":507.886,"p95":507.886,"max":507.886,"mean":507.886}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":7.575,"p50":8.116,"p95":8.477,"max":8.518,"mean":8.167},"p95Ms":{"count":51,"min":37.382,"p50":40.435,"p95":94.073,"max":94.073,"mean":44.828},"p99Ms":{"count":51,"min":120.058,"p50":174.816,"p95":414.459,"max":414.459,"mean":235.99},"maxMs":{"count":51,"min":414.695,"p50":414.695,"p95":414.695,"max":414.695,"mean":414.695}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":1.318,"p50":1.342,"p95":1.448,"max":1.448,"mean":1.379},"p95Ms":{"count":51,"min":11.164,"p50":11.164,"p95":11.164,"max":11.164,"mean":11.164},"p99Ms":{"count":51,"min":507.886,"p50":507.886,"p95":507.886,"max":507.886,"mean":507.886},"maxMs":{"count":51,"min":507.886,"p50":507.886,"p95":507.886,"max":507.886,"mean":507.886}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":3.417,"p50":14.763,"p95":25.556,"max":25.556,"mean":14.161},"p95Ms":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556},"p99Ms":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556},"maxMs":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":46,"min":3.417,"p50":9.875,"p95":14.763,"max":14.763,"mean":11.328},"p95Ms":{"count":46,"min":14.763,"p50":14.763,"p95":14.763,"max":14.763,"mean":14.763},"p99Ms":{"count":46,"min":14.763,"p50":14.763,"p95":14.763,"max":14.763,"mean":14.763},"maxMs":{"count":46,"min":14.763,"p50":14.763,"p95":14.763,"max":14.763,"mean":14.763}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":51,"min":2.666,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.107},"p95Ms":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556},"p99Ms":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556},"maxMs":{"count":51,"min":25.556,"p50":25.556,"p95":25.556,"max":25.556,"mean":25.556}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 129
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 79
- SSE clients P50: 0
- Network trail points P50/max: 76643 / 80895

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 22
- networkAircraft: 63
- localStaleRetained: 0
- networkStaleRetained: 0
- sourcePreferences: 64
- lastHistorySample: 172
- networkTrailPoints: 708

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| history.persist | 51 | 993 | 46905.122 | 3153.371 | 865.254 |
| history.transaction | 51 | 993 | 46878.567 | 3149.774 | 865.237 |
| snapshot.network | 51 | 2682 | 45102.095 | 0 | 120.866 |
| snapshot.apply.total | 51 | 993 | 28870.946 | 0 | 129.658 |
| snapshot.local | 51 | 993 | 28868.374 | 0 | 129.655 |
| snapshot.trail-update | 51 | 3641352 | 16540.521 | 0 | 0.359 |
| snapshot.trackFusion | 51 | 3675 | 16448.384 | 0 | 65.431 |
| snapshot.operationalTwin | 51 | 993 | 14140.36 | 0 | 73.356 |
| twin.eventOutcome.local | 51 | 993 | 14061.516 | 0 | 73.283 |
| network.metadata | 51 | 991 | 10156.414 | 6635.223 | 3513.87 |
| snapshot.navigationIntegrity | 51 | 3675 | 8585.631 | 0 | 90.822 |
| snapshot.intelligence | 51 | 993 | 5051.658 | 0 | 18.529 |
| twin.outcome.truth | 51 | 993 | 24.837 | 0 | 0.109 |
| twin.trajectoryQualityV2.truth | 51 | 993 | 18.493 | 0 | 0.101 |
| twin.trajectoryQuality.truth | 51 | 993 | 17.009 | 0 | 0.118 |
| twin.regionalAttention.truth | 51 | 993 | 5.106 | 0 | 0.014 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":0.333},"twin.eventOutcome.local":{"samples":51,"r":0.333},"history.persist":{"samples":51,"r":0.348},"network.metadata":{"samples":51,"r":0.03},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":0.029},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

