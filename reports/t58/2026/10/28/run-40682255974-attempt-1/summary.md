# AirRadar T5.7C – 24-hour read-only production soak

**Verdict:** PASS_WITH_LIMITATIONS

- Commit/version: 3cbd777f / 1.0.563
- Valid / unavailable / planned samples: 61 / 0 / 61
- Sanitized unavailable-sample categories: {"http_timeout":0,"authentication_failure":0,"response_validation_failure":0,"collection_interruption":0,"network_failure":0,"http_failure":0,"unclassified_legacy":0}
- Polling-delay context: {"delayedPollingMisses":0,"eventLoopSchedulingDelayCorrelatedMisses":0,"interpretation":"Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample."}
- Process segments: 1; stable: true
- Primary process identity: 95d1466b738aeb41dc9f1e26
- Timestamp continuity gaps: 0
- Segment transitions: []
- Segment windows: [{"segment":1,"processIdentity":"95d1466b738aeb41dc9f1e26","commit":"3cbd777f","version":"1.0.563","samples":61,"from":"2026-10-28T11:44:28.306Z","to":"2026-10-28T12:44:29.910Z","durationSeconds":3601.604}]
- Duration: 3601.604 seconds
- Distinct major GC observations: 0
- Distinct completed event-loop windows: 51

## Memory P50/P95/max (MiB)

| Metric | P50 | P95 | Max |
| --- | ---: | ---: | ---: |
| rss | 757.469 | 780.965 | 797.184 |
| heapUsed | 333.706 | 419.104 | 424.593 |
| heapTotal | 465.824 | 508.852 | 529.746 |
| external | 4.753 | 5.321 | 5.657 |
| arrayBuffers | unavailable | unavailable | unavailable |
| oldSpace | unavailable | unavailable | unavailable |
| cgroupMemoryCurrent | unavailable | unavailable | unavailable |
| cgroupMemoryMax | unavailable | unavailable | unavailable |

## Post-major-GC trend (MiB)

- heapUsed: unavailable
- rss: unavailable
- oldSpace: unavailable

## CPU and event loop

- CPU interval P50/P95: 14.455 / 17.671 %
- Cgroup CPU throttle telemetry: {"statuses":{"available":0,"controller_disabled":0,"unavailable":0},"coverageComplete":false}
- Completed 60-second event-loop p99 P50/P95/max: 36.241 / 38.732 / 39.453 ms

## Route Cache V4/V5

- Measured: NOT MEASURED
- Phase latency P50/P95/P99 (ms): null
- Counter deltas: null
- Circuit OPEN samples/ratio: unavailable / unavailable
- DB active max / writes max / rejected max: unavailable / unavailable / unavailable
- Caller timeouts delta / completed after timeout delta: unavailable / unavailable
- Timer overshoot (process-local recent sample distributions): null
- Event-loop utilization during timed-out calls, P95% series P50/P95/max: unavailable / unavailable / unavailable
- SQL latency scope: unavailable

## Retention

- Over-limit aircraft observed: null
- Aircraft P50: unavailable
- SSE clients P50: unavailable
- Network trail points P50/max: unavailable / unavailable

### Early/late steady-state decile difference (counts; not leak proof)

- localAircraft: unavailable
- networkAircraft: unavailable
- localStaleRetained: unavailable
- networkStaleRetained: unavailable
- sourcePreferences: unavailable
- lastHistorySample: unavailable
- networkTrailPoints: unavailable

## CPU-attributed hot paths (completed windows, approximate)

| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |

## Event-loop stall correlations (descriptive only)

{"snapshot.operationalTwin":{"samples":0,"r":null},"twin.eventOutcome.local":{"samples":0,"r":null},"history.persist":{"samples":0,"r":null},"network.metadata":{"samples":0,"r":null},"operationalTwin.nonOverlappingTopLevelPhases":{"samples":0,"r":null},"gc.pause":{"samples":51,"r":0.228},"cgroup.cpuThrottledUsecDelta":{"samples":0,"r":null}}

## Limitations

- PUBLIC ONLY: retention, major-GC/old-space, SQL, hot-path/Twin attribution and exact process identity were NOT MEASURED.
- A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.
- Process CPU attribution for overlapping async paths is not a per-operation profiler.
- Old-space growth and bounded-container counts alone do not prove a leak.
- Traffic mix, cold caches and 0 SSE clients can limit inference.
- No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.

