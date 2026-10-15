# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 8cad3141 / 1.0.464
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3602.189 seconds
- Distinct major GC observations: 50
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 910.938 | 945.859 | 953.211 |
| heapUsed | 500.28 | 550.776 | 552.204 |
| oldSpace | 411.425 | 466.318 | 475.465 |

## Post-major-GC trend (MiB)

- heapUsed: 125.307
- rss: 50.867
- oldSpace: 112.327

## CPU and event loop

- CPU interval P50/P95: 20.036 / 30.731 %
- Completed 60-second event-loop p99 P50/P95/max: 48.366 / 57.901 / 63.209 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":2,"mean":1.039},"p95Ms":{"count":51,"min":2,"p50":2,"p95":4,"max":5,"mean":2.373},"p99Ms":{"count":51,"min":2,"p50":4,"p95":52,"max":55,"mean":9.353},"maxMs":{"count":51,"min":4,"p50":64,"p95":4336,"max":6379,"mean":501.667}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.745}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":2,"mean":1.039},"p95Ms":{"count":51,"min":2,"p50":2,"p95":3,"max":5,"mean":2.333},"p99Ms":{"count":51,"min":2,"p50":4,"p95":53,"max":56,"mean":9.392},"maxMs":{"count":51,"min":4,"p50":64,"p95":4336,"max":6379,"mean":500.824}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":6,"p50":7,"p95":7,"max":7,"mean":6.745},"p95Ms":{"count":51,"min":28,"p50":29,"p95":90,"max":97,"mean":39.725},"p99Ms":{"count":51,"min":90,"p50":97,"p95":625,"max":625,"mean":178.412},"maxMs":{"count":51,"min":625,"p50":625,"p95":625,"max":625,"mean":625}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.588}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":6,"p95":7,"max":7,"mean":6.118},"p95Ms":{"count":51,"min":10,"p50":11,"p95":14,"max":14,"mean":11.608},"p99Ms":{"count":51,"min":13,"p50":13,"p95":36,"max":36,"mean":18.392},"maxMs":{"count":51,"min":13,"p50":13,"p95":38,"max":38,"mean":18.941}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.979,"p50":6.363,"p95":6.74,"max":6.763,"mean":6.409},"p95Ms":{"count":51,"min":26.058,"p50":27.897,"p95":83.32,"max":83.32,"mean":32.147},"p99Ms":{"count":51,"min":83.32,"p50":96.572,"p95":624.22,"max":624.22,"mean":134.894},"maxMs":{"count":51,"min":624.22,"p50":624.22,"p95":624.22,"max":624.22,"mean":624.22}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":5.971,"p50":6.818,"p95":7.206,"max":7.206,"mean":6.681},"p95Ms":{"count":51,"min":28.373,"p50":29.268,"p95":89.279,"max":96.572,"mean":39.747},"p99Ms":{"count":51,"min":89.279,"p50":96.572,"p95":624.22,"max":624.22,"mean":178.293},"maxMs":{"count":51,"min":624.22,"p50":624.22,"p95":624.22,"max":624.22,"mean":624.22}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.596,"p50":5.962,"p95":6.604,"max":6.604,"mean":6.013},"p95Ms":{"count":51,"min":10.038,"p50":10.965,"p95":13.884,"max":13.884,"mean":11.465},"p99Ms":{"count":51,"min":13.166,"p50":13.166,"p95":35.817,"max":35.817,"mean":18.233},"maxMs":{"count":51,"min":13.166,"p50":13.166,"p95":37.896,"max":37.896,"mean":18.807}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":9.1,"p50":9.1,"p95":9.1,"max":9.1,"mean":9.1},"p95Ms":{"count":51,"min":9.1,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.471},"p99Ms":{"count":51,"min":9.1,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.471},"maxMs":{"count":51,"min":9.1,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.471}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":31,"min":9.71,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.71},"p95Ms":{"count":31,"min":9.71,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.71},"p99Ms":{"count":31,"min":9.71,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.71},"maxMs":{"count":31,"min":9.71,"p50":9.71,"p95":9.71,"max":9.71,"mean":9.71}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":51,"min":9.1,"p50":9.1,"p95":9.1,"max":9.1,"mean":9.1},"p95Ms":{"count":51,"min":9.1,"p50":9.1,"p95":9.1,"max":9.1,"mean":9.1},"p99Ms":{"count":51,"min":9.1,"p50":9.1,"p95":9.1,"max":9.1,"mean":9.1},"maxMs":{"count":51,"min":9.1,"p50":9.1,"p95":9.1,"max":9.1,"mean":9.1}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"adsblolBatch":null,"adsblolLookup":null,"adsblolError":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 85
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 58
- SSE clients P50: 0
- Network trail points P50/max: 54981 / 59927

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 8
- networkAircraft: -72
- localStaleRetained: -1
- networkStaleRetained: 0
- sourcePreferences: -70
- lastHistorySample: 184
- networkTrailPoints: 635

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| history.persist | 51 | 994 | 36590.322 | 476.056 | 713.899 |
| history.transaction | 51 | 994 | 36562.085 | 475.559 | 713.861 |
| snapshot.network | 51 | 2705 | 35184.755 | 0 | 89.429 |
| snapshot.apply.total | 51 | 994 | 33147.973 | 0 | 136.109 |
| snapshot.local | 51 | 994 | 33145.344 | 0 | 136.106 |
| network.metadata | 51 | 990 | 24849.536 | 13063.033 | 6384.372 |
| snapshot.operationalTwin | 51 | 994 | 20693.404 | 0 | 80.995 |
| twin.eventOutcome.local | 51 | 994 | 20604.189 | 0 | 80.894 |
| snapshot.trail-update | 51 | 2506013 | 13869.813 | 0 | 0.115 |
| snapshot.trackFusion | 51 | 3699 | 11618.741 | 0 | 68.266 |
| snapshot.navigationIntegrity | 51 | 3699 | 6716.515 | 0 | 64.253 |
| snapshot.intelligence | 51 | 994 | 3683.309 | 0 | 20.541 |
| twin.outcome.truth | 51 | 994 | 27.848 | 0 | 0.282 |
| twin.trajectoryQualityV2.truth | 51 | 994 | 20.325 | 0 | 0.201 |
| twin.trajectoryQuality.truth | 51 | 994 | 18.662 | 0 | 0.264 |
| twin.regionalAttention.truth | 51 | 994 | 5.668 | 0 | 0.019 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.036},"twin.eventOutcome.local":{"samples":51,"r":-0.035},"history.persist":{"samples":51,"r":0.141},"network.metadata":{"samples":51,"r":0.182},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":-0.144},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

