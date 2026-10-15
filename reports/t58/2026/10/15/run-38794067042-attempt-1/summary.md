# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 108f7bf8 / 1.0.467
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3601.975 seconds
- Distinct major GC observations: 50
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 892.121 | 910.793 | 926.285 |
| heapUsed | 486.877 | 586.506 | 592.654 |
| oldSpace | 409.537 | 496.336 | 500.339 |

## Post-major-GC trend (MiB)

- heapUsed: 27.564
- rss: 5.969
- oldSpace: 25.94

## CPU and event loop

- CPU interval P50/P95: 24.242 / 50.194 %
- Completed 60-second event-loop p99 P50/P95/max: 47.94 / 71.565 / 76.874 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":2,"p50":2,"p95":5,"max":5,"mean":2.647},"p99Ms":{"count":51,"min":2,"p50":4,"p95":31,"max":51,"mean":9.784},"maxMs":{"count":51,"min":7,"p50":67,"p95":311,"max":3093,"mean":197.451}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.745}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":2,"p50":2,"p95":5,"max":5,"mean":2.627},"p99Ms":{"count":51,"min":2,"p50":5,"p95":31,"max":51,"mean":10.725},"maxMs":{"count":51,"min":7,"p50":69,"p95":311,"max":3093,"mean":200.059}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":6,"p95":6,"max":6,"mean":5.863},"p95Ms":{"count":51,"min":26,"p50":29,"p95":35,"max":35,"mean":29.608},"p99Ms":{"count":51,"min":58,"p50":495,"p95":501,"max":501,"mean":389.922},"maxMs":{"count":51,"min":502,"p50":502,"p95":502,"max":502,"mean":502}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.765}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":6,"p50":6,"p95":7,"max":7,"mean":6.392},"p95Ms":{"count":51,"min":12,"p50":13,"p95":16,"max":16,"mean":12.843},"p99Ms":{"count":51,"min":16,"p50":23,"p95":33,"max":33,"mean":25.686},"maxMs":{"count":51,"min":16,"p50":33,"p95":33,"max":33,"mean":30}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.62,"p50":5.987,"p95":6.192,"max":6.2,"mean":5.987},"p95Ms":{"count":51,"min":25.182,"p50":26.129,"p95":29.147,"max":29.147,"mean":26.26},"p99Ms":{"count":51,"min":53.202,"p50":58.745,"p95":495.643,"max":495.643,"mean":229.24},"maxMs":{"count":51,"min":502.116,"p50":502.116,"p95":502.116,"max":502.116,"mean":502.116}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.503,"p50":5.833,"p95":5.978,"max":5.987,"mean":5.8},"p95Ms":{"count":51,"min":26.129,"p50":29.147,"p95":35.358,"max":35.358,"mean":29.67},"p99Ms":{"count":51,"min":58.745,"p50":495.254,"p95":501.455,"max":501.455,"mean":390.019},"maxMs":{"count":51,"min":502.116,"p50":502.116,"p95":502.116,"max":502.116,"mean":502.116}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.909,"p50":6.428,"p95":6.788,"max":6.788,"mean":6.395},"p95Ms":{"count":51,"min":11.992,"p50":13.062,"p95":15.704,"max":15.704,"mean":13.115},"p99Ms":{"count":51,"min":15.704,"p50":22.884,"p95":33.119,"max":33.119,"mean":25.63},"maxMs":{"count":51,"min":15.704,"p50":33.119,"p95":33.119,"max":33.119,"mean":30.045}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.851,"p50":7.185,"p95":7.185,"max":7.185,"mean":6.499},"p95Ms":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722},"p99Ms":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722},"maxMs":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":51,"min":7.185,"p50":7.185,"p95":7.185,"max":7.185,"mean":7.185},"p95Ms":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722},"p99Ms":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722},"maxMs":{"count":51,"min":7.185,"p50":7.558,"p95":10.352,"max":10.352,"mean":7.722}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":20,"min":4.548,"p50":4.548,"p95":4.548,"max":4.548,"mean":4.548},"p95Ms":{"count":20,"min":4.548,"p50":4.548,"p95":4.548,"max":4.548,"mean":4.548},"p99Ms":{"count":20,"min":4.548,"p50":4.548,"p95":4.548,"max":4.548,"mean":4.548},"maxMs":{"count":20,"min":4.548,"p50":4.548,"p95":4.548,"max":4.548,"mean":4.548}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 86
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 56
- SSE clients P50: 0
- Network trail points P50/max: 54818 / 61329

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: -13
- networkAircraft: -27
- localStaleRetained: -1
- networkStaleRetained: 0
- sourcePreferences: -27
- lastHistorySample: 76
- networkTrailPoints: 509

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.apply.total | 51 | 984 | 41749.425 | 0 | 159.276 |
| snapshot.local | 51 | 984 | 41746.409 | 0 | 159.267 |
| history.persist | 51 | 984 | 36506.742 | 684.967 | 949.029 |
| history.transaction | 51 | 984 | 36474.425 | 684.445 | 948.994 |
| snapshot.network | 51 | 2677 | 35029.782 | 0 | 89.361 |
| snapshot.operationalTwin | 51 | 984 | 29068.724 | 0 | 122.233 |
| twin.eventOutcome.local | 51 | 984 | 28972.73 | 0 | 122.107 |
| network.metadata | 51 | 980 | 17425.21 | 13793.12 | 3508.021 |
| snapshot.trail-update | 51 | 2409832 | 13676.85 | 0 | 0.092 |
| snapshot.trackFusion | 51 | 3661 | 11518.856 | 0 | 61.971 |
| snapshot.navigationIntegrity | 51 | 3661 | 6692.985 | 0 | 63.828 |
| snapshot.intelligence | 51 | 984 | 4009.822 | 0 | 21.866 |
| twin.outcome.truth | 51 | 984 | 29.833 | 0 | 0.15 |
| twin.trajectoryQualityV2.truth | 51 | 984 | 22.036 | 0 | 1.111 |
| twin.trajectoryQuality.truth | 51 | 984 | 21.965 | 0 | 0.916 |
| twin.regionalAttention.truth | 51 | 984 | 5.429 | 0 | 0.015 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":0.289},"twin.eventOutcome.local":{"samples":51,"r":0.289},"history.persist":{"samples":51,"r":-0.031},"network.metadata":{"samples":51,"r":0.145},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":0.133},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

