# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 08b009f7 / 1.0.457
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3602.608 seconds
- Distinct major GC observations: 50
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 1138.227 | 1157.805 | 1158.371 |
| heapUsed | 566.968 | 632.478 | 671.854 |
| oldSpace | 457.275 | 518.881 | 562.89 |

## Post-major-GC trend (MiB)

- heapUsed: 25.112
- rss: 34.977
- oldSpace: 26.401

## CPU and event loop

- CPU interval P50/P95: 31.635 / 39.026 %
- Completed 60-second event-loop p99 P50/P95/max: 86.573 / 104.989 / 110.232 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":2,"mean":1.039},"p95Ms":{"count":51,"min":2,"p50":3,"p95":6,"max":6,"mean":3.333},"p99Ms":{"count":51,"min":2,"p50":4,"p95":42,"max":56,"mean":8.392},"maxMs":{"count":51,"min":14,"p50":80,"p95":1001,"max":3541,"mean":345.333}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.843}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":2,"max":2,"mean":1.059},"p95Ms":{"count":51,"min":2,"p50":3,"p95":5,"max":6,"mean":3.216},"p99Ms":{"count":51,"min":2,"p50":4,"p95":48,"max":56,"mean":8.588},"maxMs":{"count":51,"min":14,"p50":80,"p95":1001,"max":3541,"mean":346.98}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":6,"p50":8,"p95":8,"max":8,"mean":7.647},"p95Ms":{"count":51,"min":77,"p50":84,"p95":99,"max":99,"mean":86.745},"p99Ms":{"count":51,"min":107,"p50":110,"p95":112,"max":113,"mean":110},"maxMs":{"count":51,"min":112,"p50":113,"p95":134,"max":134,"mean":114.784}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":1,"max":1,"mean":0.275},"maxMs":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":7,"p95":8,"max":8,"mean":7.392},"p95Ms":{"count":51,"min":9,"p50":15,"p95":16,"max":16,"mean":14.98},"p99Ms":{"count":51,"min":14,"p50":63,"p95":63,"max":63,"mean":56.471},"maxMs":{"count":51,"min":14,"p50":63,"p95":63,"max":63,"mean":60.196}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.9,"p50":7.581,"p95":7.874,"max":7.912,"mean":7.421},"p95Ms":{"count":51,"min":73.434,"p50":79.602,"p95":96.241,"max":96.595,"mean":80.513},"p99Ms":{"count":51,"min":103.969,"p50":109.758,"p95":111.965,"max":111.965,"mean":108.367},"maxMs":{"count":51,"min":111.965,"p50":112.567,"p95":133.876,"max":133.876,"mean":114.434}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":6.095,"p50":7.581,"p95":7.953,"max":8.088,"mean":7.424},"p95Ms":{"count":51,"min":76.786,"p50":83.645,"p95":99.11,"max":99.11,"mean":86.714},"p99Ms":{"count":51,"min":107.034,"p50":109.758,"p95":111.965,"max":112.567,"mean":109.899},"maxMs":{"count":51,"min":111.965,"p50":112.567,"p95":133.876,"max":133.876,"mean":114.434}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.721,"p50":7.373,"p95":8.233,"max":8.246,"mean":7.481},"p95Ms":{"count":51,"min":8.683,"p50":15.077,"p95":16.439,"max":16.439,"mean":15.325},"p99Ms":{"count":51,"min":14.328,"p50":63.348,"p95":63.348,"max":63.348,"mean":56.836},"maxMs":{"count":51,"min":14.328,"p50":63.348,"p95":63.348,"max":63.348,"mean":60.547}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":2.58,"p50":2.691,"p95":2.691,"max":4.552,"mean":2.684},"p95Ms":{"count":51,"min":2.58,"p50":11.025,"p95":11.025,"max":11.025,"mean":10.197},"p99Ms":{"count":51,"min":2.58,"p50":11.025,"p95":11.025,"max":11.025,"mean":10.197},"maxMs":{"count":51,"min":2.58,"p50":11.025,"p95":11.025,"max":11.025,"mean":10.197}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":46,"min":2.691,"p50":5.888,"p95":11.025,"max":11.025,"mean":6.52},"p95Ms":{"count":46,"min":11.025,"p50":11.025,"p95":11.025,"max":11.025,"mean":11.025},"p99Ms":{"count":46,"min":11.025,"p50":11.025,"p95":11.025,"max":11.025,"mean":11.025},"maxMs":{"count":46,"min":11.025,"p50":11.025,"p95":11.025,"max":11.025,"mean":11.025}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":51,"min":2.58,"p50":2.58,"p95":2.58,"max":2.58,"mean":2.58},"p95Ms":{"count":51,"min":2.58,"p50":2.58,"p95":2.58,"max":4.552,"mean":2.618},"p99Ms":{"count":51,"min":2.58,"p50":2.58,"p95":2.58,"max":4.552,"mean":2.618},"maxMs":{"count":51,"min":2.58,"p50":2.58,"p95":2.58,"max":4.552,"mean":2.618}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"adsblolBatch":null,"adsblolLookup":null,"adsblolError":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 112
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 69
- SSE clients P50: 0
- Network trail points P50/max: 74638 / 78108

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 8
- networkAircraft: -35
- localStaleRetained: -2
- networkStaleRetained: 0
- sourcePreferences: -36
- lastHistorySample: 207
- networkTrailPoints: -5668

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.network | 51 | 2518 | 137481.774 | 0 | 809.546 |
| snapshot.trail-update | 51 | 3370880 | 82354.439 | 0 | 2.841 |
| snapshot.apply.total | 51 | 953 | 80932.147 | 0 | 748.549 |
| snapshot.local | 51 | 953 | 80929.316 | 0 | 748.546 |
| history.persist | 51 | 954 | 69764.181 | 324.967 | 3531.612 |
| history.transaction | 51 | 954 | 69738.096 | 324.522 | 3531.593 |
| snapshot.navigationIntegrity | 51 | 3471 | 57931.552 | 0 | 768.201 |
| snapshot.operationalTwin | 51 | 953 | 40214.785 | 0 | 135.002 |
| twin.eventOutcome.local | 51 | 953 | 40129.021 | 0 | 134.932 |
| network.metadata | 51 | 949 | 28852.093 | 13457.586 | 3546.347 |
| snapshot.trackFusion | 51 | 3471 | 15900.122 | 0 | 53.253 |
| snapshot.intelligence | 51 | 953 | 4354.254 | 0 | 22.03 |
| twin.outcome.truth | 51 | 953 | 26.43 | 0 | 1.186 |
| twin.trajectoryQualityV2.truth | 51 | 953 | 19.955 | 0 | 0.122 |
| twin.trajectoryQuality.truth | 51 | 953 | 18.827 | 0 | 0.178 |
| twin.regionalAttention.truth | 51 | 953 | 5.155 | 0 | 0.021 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.108},"twin.eventOutcome.local":{"samples":51,"r":-0.108},"history.persist":{"samples":51,"r":0.079},"network.metadata":{"samples":51,"r":0.098},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":-0.305},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

