# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: e8282c48 / 1.0.462
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Duration: 3602.177 seconds
- Distinct major GC observations: 46
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 1122.16 | 1539.383 | 1547.672 |
| heapUsed | 529.479 | 1083.777 | 1169.934 |
| oldSpace | 447.741 | 979.222 | 1060.055 |

## Post-major-GC trend (MiB)

- heapUsed: 27.556
- rss: -383.379
- oldSpace: 27.97

## CPU and event loop

- CPU interval P50/P95: 25.832 / 51.936 %
- Completed 60-second event-loop p99 P50/P95/max: 60.654 / 79.888 / 86.573 ms

## Route Cache V4/V5

- Measured: yes
- Phase latency P50/P95/P99 (ms): {"routeResolution":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":2,"mean":1.039},"p95Ms":{"count":51,"min":2,"p50":2,"p95":4,"max":5,"mean":2.667},"p99Ms":{"count":51,"min":2,"p50":4,"p95":50,"max":59,"mean":11.373},"maxMs":{"count":51,"min":12,"p50":84,"p95":3509,"max":3510,"mean":518.314}},"memoryLookup":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":0,"p50":1,"p95":1,"max":1,"mean":0.706}},"readThroughLoad":{"measured":true,"p50Ms":{"count":51,"min":1,"p50":1,"p95":1,"max":2,"mean":1.039},"p95Ms":{"count":51,"min":2,"p50":2,"p95":4,"max":5,"mean":2.627},"p99Ms":{"count":51,"min":2,"p50":4,"p95":50,"max":59,"mean":12.941},"maxMs":{"count":51,"min":12,"p50":84,"p95":3509,"max":3510,"mean":518.588}},"postgresCacheRequest":{"measured":true,"p50Ms":{"count":51,"min":8,"p50":8,"p95":8,"max":8,"mean":8},"p95Ms":{"count":51,"min":38,"p50":43,"p95":88,"max":88,"mean":48.314},"p99Ms":{"count":51,"min":87,"p50":88,"p95":107,"max":107,"mean":89.882},"maxMs":{"count":51,"min":107,"p50":107,"p95":107,"max":107,"mean":107}},"concurrencyBudget":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbConnection":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"resultProcessing":{"measured":true,"p50Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p95Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"p99Ms":{"count":51,"min":0,"p50":0,"p95":0,"max":0,"mean":0},"maxMs":{"count":51,"min":1,"p50":1,"p95":1,"max":1,"mean":1}},"cacheUpdate":{"measured":true,"p50Ms":{"count":51,"min":7,"p50":7,"p95":8,"max":8,"mean":7.49},"p95Ms":{"count":51,"min":14,"p50":15,"p95":18,"max":18,"mean":15.627},"p99Ms":{"count":51,"min":22,"p50":34,"p95":34,"max":34,"mean":30.706},"maxMs":{"count":51,"min":34,"p50":34,"p95":34,"max":34,"mean":34}},"callerTimeout":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"dbCallSettlement":{"measured":true,"p50Ms":{"count":51,"min":7.15,"p50":7.661,"p95":7.849,"max":7.926,"mean":7.653},"p95Ms":{"count":51,"min":26.356,"p50":33.773,"p95":56.944,"max":86.209,"mean":37.736},"p99Ms":{"count":51,"min":60.632,"p50":88.144,"p95":88.519,"max":106.715,"mean":83.063},"maxMs":{"count":51,"min":106.715,"p50":106.715,"p95":106.715,"max":106.715,"mean":106.715}},"dbReadSettlement":{"measured":true,"p50Ms":{"count":51,"min":7.381,"p50":7.902,"p95":8.291,"max":8.291,"mean":7.932},"p95Ms":{"count":51,"min":38.211,"p50":42.439,"p95":88.144,"max":88.144,"mean":48.219},"p99Ms":{"count":51,"min":86.209,"p50":88.309,"p95":106.715,"max":106.715,"mean":89.708},"maxMs":{"count":51,"min":106.715,"p50":106.715,"p95":106.715,"max":106.715,"mean":106.715}},"dbWriteSettlement":{"measured":true,"p50Ms":{"count":51,"min":7.035,"p50":7.298,"p95":7.748,"max":7.748,"mean":7.351},"p95Ms":{"count":51,"min":14.206,"p50":15.039,"p95":17.103,"max":17.103,"mean":15.436},"p99Ms":{"count":51,"min":21.523,"p50":33.773,"p95":33.773,"max":33.773,"mean":30.411},"maxMs":{"count":51,"min":33.773,"p50":33.773,"p95":33.773,"max":33.773,"mean":33.773}},"dbMaintenanceSettlement":{"measured":true,"p50Ms":{"count":51,"min":3.195,"p50":6.055,"p95":6.055,"max":6.055,"mean":4.933},"p95Ms":{"count":51,"min":3.195,"p50":21.71,"p95":21.71,"max":21.71,"mean":15.346},"p99Ms":{"count":51,"min":3.195,"p50":21.71,"p95":21.71,"max":21.71,"mean":15.346},"maxMs":{"count":51,"min":3.195,"p50":21.71,"p95":21.71,"max":21.71,"mean":15.346}},"dbMaintenanceCount":{"measured":true,"p50Ms":{"count":47,"min":6.055,"p50":6.055,"p95":10.506,"max":10.506,"mean":7.552},"p95Ms":{"count":47,"min":6.055,"p50":21.71,"p95":21.71,"max":21.71,"mean":16.38},"p99Ms":{"count":47,"min":6.055,"p50":21.71,"p95":21.71,"max":21.71,"mean":16.38},"maxMs":{"count":47,"min":6.055,"p50":21.71,"p95":21.71,"max":21.71,"mean":16.38}},"dbMaintenancePrune":{"measured":true,"p50Ms":{"count":51,"min":2.357,"p50":3.195,"p95":3.195,"max":3.195,"mean":3.179},"p95Ms":{"count":51,"min":3.195,"p50":3.195,"p95":3.195,"max":3.195,"mean":3.195},"p99Ms":{"count":51,"min":3.195,"p50":3.195,"p95":3.195,"max":3.195,"mean":3.195},"maxMs":{"count":51,"min":3.195,"p50":3.195,"p95":3.195,"max":3.195,"mean":3.195}},"dbLateSettlement":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null},"callerTimeoutOvershoot":{"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}}
- Counter deltas: {"ramHit":null,"dbHit":null,"dbMiss":null,"dbWrite":null,"dbError":null,"dbBypassed":null,"adsbdbLookup":null,"adsblolBatch":null,"adsblolLookup":null,"adsblolError":null,"dbLatencySamples":null,"dbLatencyTotalMs":null}
- Circuit OPEN samples/ratio: 0 / 0
- DB active max / writes max / rejected max: 4 / 0 / 108
- Caller timeouts delta / completed after timeout delta: unavailable / 0
- Timer overshoot (process-local recent sample distributions): {"measured":false,"p50Ms":null,"p95Ms":null,"p99Ms":null,"maxMs":null}
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: db_call_elapsed; server-side SQL latency NOT MEASURED

## Retention

- Over-limit aircraft observed: false
- Aircraft P50: 71
- SSE clients P50: 0
- Network trail points P50/max: 75185 / 77984

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: 10
- networkAircraft: -54
- localStaleRetained: 1
- networkStaleRetained: 1
- sourcePreferences: -55
- lastHistorySample: 222
- networkTrailPoints: -2086

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| snapshot.network | 51 | 2674 | 49953.915 | 0 | 197.227 |
| history.persist | 51 | 983 | 44161.701 | 892.558 | 850.037 |
| history.transaction | 51 | 983 | 44137.057 | 891.684 | 850.015 |
| snapshot.apply.total | 51 | 983 | 44017.142 | 0 | 161.101 |
| snapshot.local | 51 | 983 | 44014.65 | 0 | 161.097 |
| snapshot.operationalTwin | 51 | 983 | 26423.729 | 0 | 126.041 |
| twin.eventOutcome.local | 51 | 983 | 26336.229 | 0 | 125.95 |
| network.metadata | 51 | 980 | 24098.082 | 13756.115 | 3520.188 |
| snapshot.trail-update | 51 | 3634404 | 19842.275 | 0 | 0.041 |
| snapshot.trackFusion | 51 | 3657 | 16627.977 | 0 | 179.619 |
| snapshot.navigationIntegrity | 51 | 3657 | 8965.268 | 0 | 103.49 |
| snapshot.intelligence | 51 | 983 | 4557.205 | 0 | 12.449 |
| twin.outcome.truth | 51 | 983 | 25.416 | 0 | 0.158 |
| twin.trajectoryQuality.truth | 51 | 983 | 21.649 | 0 | 4.022 |
| twin.trajectoryQualityV2.truth | 51 | 983 | 19.584 | 0 | 0.121 |
| twin.regionalAttention.truth | 51 | 983 | 5.387 | 0 | 0.013 |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":51,"r":-0.191},"twin.eventOutcome.local":{"samples":51,"r":-0.191},"history.persist":{"samples":51,"r":0.101},"network.metadata":{"samples":51,"r":-0.001},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":-0.067},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- Continuous clean windows and two major GC observations are required for evidence.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

