# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: c7d57580 / 1.0.494
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3602.059 seconds
- Distinct major GC observations: 48
- Distinct completed event-loop windows: 50

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 968.105 | 1512.383 | 1523.941 |
| heapUsed | 531.75 | 1183.942 | 1262.652 |
| oldSpace | 448.724 | 1044.149 | 1129.133 |

## Post-major-GC trend (MiB)

- heapUsed: -88.2
- rss: -434.867
- oldSpace: -69.023

## CPU and event loop

- CPU interval P50/P95: 38.637 / 62.163 %
- Completed 60-second event-loop p99 P50/P95/max: 47.972 / 62.751 / 82.51 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":1,"p50":2,"p95":2,"max":3,"mean":1.843},"p99Ms":{"count":51,"min":2,"p50":4,"p95":47,"max":49,"mean":13.647},"maxMs":{"count":51,"min":6,"p50":66,"p95":3505,"max":3514,"mean":270.961}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":3,"mean":0.941}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1},"p95Ms":{"count":51,"min":1,"p50":2,"p95":2,"max":3,"mean":1.824},"p99Ms":{"count":51,"min":2,"p50":4,"p95":47,"max":49,"mean":15.294},"maxMs":{"count":51,"min":6,"p50":66,"p95":3505,"max":3514,"mean":274.392}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":5,"p50":5,"p95":6,"max":6,"mean":5.196},"p95Ms":{"count":51,"min":27,"p50":31,"p95":94,"max":94,"mean":39.314},"p99Ms":{"count":51,"min":94,"p50":97,"p95":97,"max":97,"mean":96.392},"maxMs":{"count":51,"min":97,"p50":109,"p95":109,"max":109,"mean":104.294}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":2,"p95":2,"max":2,"mean":1.98},"p95Ms":{"count":51,"min":11,"p50":12,"p95":16,"max":16,"mean":13.392},"p99Ms":{"count":51,"min":16,"p50":16,"p95":25,"max":25,"mean":19.176},"maxMs":{"count":51,"min":16,"p50":25,"p95":25,"max":25,"mean":21.471}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":3.673,"p50":4.355,"p95":5.101,"max":5.101,"mean":4.386},"p95Ms":{"count":51,"min":26.575,"p50":28.824,"p95":94.167,"max":94.167,"mean":34.889},"p99Ms":{"count":51,"min":67.854,"p50":95.147,"p95":96.99,"max":96.99,"mean":94.681},"maxMs":{"count":51,"min":96.99,"p50":109.439,"p95":109.439,"max":109.439,"mean":104.557}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":4.723,"p50":4.969,"p95":5.691,"max":5.691,"mean":5.045},"p95Ms":{"count":51,"min":27.63,"p50":31.044,"p95":94.167,"max":94.167,"mean":39.273},"p99Ms":{"count":51,"min":94.167,"p50":96.95,"p95":96.99,"max":96.99,"mean":96.411},"maxMs":{"count":51,"min":96.99,"p50":109.439,"p95":109.439,"max":109.439,"mean":104.557}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":1.312,"p50":1.401,"p95":1.742,"max":1.742,"mean":1.452},"p95Ms":{"count":51,"min":10.272,"p50":11.359,"p95":16.422,"max":16.422,"mean":12.983},"p99Ms":{"count":51,"min":16.422,"p50":16.422,"p95":24.534,"max":24.534,"mean":19.285},"maxMs":{"count":51,"min":16.422,"p50":24.534,"p95":24.534,"max":24.534,"mean":21.353}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":46,"min":5.756,"p50":5.756,"p95":5.756,"max":5.756,"mean":5.756},"p95Ms":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943},"p99Ms":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943},"maxMs":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":46,"min":5.756,"p50":5.756,"p95":5.756,"max":5.756,"mean":5.756},"p95Ms":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943},"p99Ms":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943},"maxMs":{"count":46,"min":5.756,"p50":10.485,"p95":10.485,"max":10.485,"mean":8.943}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":2,"min":4.644,"p50":4.644,"p95":4.644,"max":4.644,"mean":4.644},"p95Ms":{"count":2,"min":4.644,"p50":4.644,"p95":4.644,"max":4.644,"mean":4.644},"p99Ms":{"count":2,"min":4.644,"p50":4.644,"p95":4.644,"max":4.644,"mean":4.644},"maxMs":{"count":2,"min":4.644,"p50":4.644,"p95":4.644,"max":4.644,"mean":4.644}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 71
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 54
- SSE clients P50: 0
- Network trail points P50/max: 88899 / 92981

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 11
- networkAircraft: -55
- localStaleRetained: -1
- networkStaleRetained: -3
- sourcePreferences: -59
- lastHistorySample: 202
- networkTrailPoints: -1445

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.network | 51 | 2890 | 39255.389 | 0 | 61.218 |
| snapshot.apply.total | 51 | 983 | 34818.162 | 0 | 145.989 |
| snapshot.local | 51 | 983 | 34815.708 | 0 | 145.986 |
| history.persist | 51 | 983 | 33997.889 | 437.937 | 799.96 |
| history.transaction | 51 | 983 | 33975.332 | 437.433 | 799.938 |
| ingest.local-beast | 51 | 103142 | 31863.998 | 0 | 10.367 |
| snapshot.operationalTwin | 51 | 983 | 26949.527 | 0 | 116.158 |
| twin.eventOutcome.local | 51 | 983 | 26875.364 | 0 | 116.084 |
| snapshot.network.ingest | 51 | 2890 | 24129.451 | 0 | 30.444 |
| snapshot.trail-update | 51 | 3314437 | 16519.301 | 0 | 0.015 |
| network.metadata | 51 | 979 | 15632.738 | 14556.861 | 3514.316 |
| snapshot.trackFusion | 51 | 3873 | 13788.694 | 0 | 45.328 |
| twin.outcome.truth | 51 | 983 | 24.095 | 0 | 0.161 |
| twin.trajectoryQuality.truth | 51 | 983 | 17.684 | 0 | 0.143 |
| twin.trajectoryQualityV2.truth | 51 | 983 | 16.732 | 0 | 0.076 |
| twin.regionalAttention.truth | 51 | 983 | 4.628 | 0 | 0.013 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.055},"twin.eventOutcome.local":{"samples":51,"r":-0.055},"history.persist":{"samples":51,"r":-0.291},"network.metadata":{"samples":51,"r":-0.017},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":50,"r":-0.179},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

