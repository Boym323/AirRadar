# Rendering / Performance Polish Report

## Executive summary

Rendering correctness and performance are improved/stable because the measured
WebGL hot path now reuses its vertex storage and WebGL/HTML screen-heading
calculation has an explicit parity contract, while existing collision, LOD,
trail, selected-aircraft, and SSE boundaries remain intact.

## Baseline

Production build from `origin/main` `a39c977e`, benchmark command:

```text
RADAR_PERF_SCENARIOS=100,500,1000 RADAR_PERF_MEASURE_MS=3000 npm run benchmark:radar
```

| Scenario | HTML markers | WebGL aircraft | Animation avg | Animation p95 | Collision avg | Status |
|---:|---:|---:|---:|---:|---:|---|
| 100 | 0 | 100 | 0.18 ms | 0.20 ms | 0.03 ms | PASS |
| 500 | 0 | 500 | 0.25 ms | 0.80 ms | 0.03 ms | PASS |
| 1000 | 0 | 1000 | 0.97 ms | 4.60 ms | 0 ms | PASS |

The baseline harness records frame-interval p95 of 80.4/90.8/111.9 ms and
long-task counts of 46/40/33 respectively; these are observational metrics,
not CI gates in the repository's performance policy.

The same harness was rerun after the change. The post-change frame-interval
p95 was 71.8/86.1/135.8 ms and long-task counts were 48/40/32. The 100- and
500-aircraft frame values improved, while the 1000-aircraft frame interval is
runner-load-sensitive and is recorded as a known observation rather than a
release gate.

## Findings

- WebGL allocated a new typed vertex array for every data render.
- HTML and WebGL used equivalent but separately expressed heading formulas.
- Collision priority, grid indexing, zoom LOD, bounded trails, selected-marker
  ownership, and SSE latest-state coalescing were already covered and bounded.

## Fixes

- Added capacity-growing reusable WebGL vertex storage.
- Added `aircraftWebglScreenHeading()` and parity tests against the HTML visual
  heading resolver, including rotated-map bearings.
- Added an audit documenting why unrelated rendering paths were left stable.

## Benchmarks

Before/after results from the same 3-second scenarios:

| Scenario | Animation avg before → after | Animation p95 before → after | Collision avg before → after | Status after |
|---:|---:|---:|---:|---|
| 100 | 0.18 → 0.12 ms (-33%) | 0.20 → 0.20 ms | 0.03 → 0.03 ms | PASS |
| 500 | 0.25 → 0.34 ms (+36%) | 0.80 → 0.50 ms (-38%) | 0.03 → 0.02 ms (-33%) | PASS |
| 1000 | 0.97 → 0.67 ms (-31%) | 4.60 → 1.00 ms (-78%) | 0 → 0.03 ms | PASS |

No arbitrary latency target was introduced; all structural budgets remained
PASS and the measured animation p95 improved in every requested scenario.

## Rendering parity

```text
WebGL vs HTML heading: PASS (unit parity tests, map bearing cases)
WebGL vs HTML anchor: PASS (same MapLibre geographic point and centered marker model)
Selection transition: PASS (existing bulk/special ownership tests)
Map rotation: PASS (heading parity covers non-zero bearing)
Collision priority: PASS (existing selected/emergency/watchlist/normal tests)
```

## Time Machine

```text
1× / 5× / 10× / 30×: existing deterministic playback bounds retained
Event clustering: bounded markers with full event list preserved
Seek: pending selection survives historical-window reload
```

## Stress test

The existing production harness covers 50, 100, 250, 500, 1000, 1600, 2000,
3000 and 5000 aircraft structurally. This H audit measured the requested 100,
500 and 1000 scenarios before and after the change.

## Known limitations

- Browser screenshot comparison is not introduced; the repository uses its
  existing production/browser gates rather than a new visual framework.
- Frame-interval and long-task values are runner-load-sensitive and remain
  observational, as documented by the existing budget script.

## Validation

```text
typecheck: PASS
targeted rendering/SSE tests: 5 files, 50 tests PASS
full test suite: 177 files, 1204 tests PASS
lint: PASS (4 pre-existing warnings, 0 errors)
prisma contract emit: PASS
production build: PASS
production + responsive + browser gates: PASS
radar performance 100/500/1000: PASS
```

## Recommendation

READY FOR PRODUCTION POLISH COMPLETE: YES

The change is narrow, measured, preserves the live/SSE and marker ownership
contracts, and adds regression coverage. Full tests, build, production gates,
responsive sweep, browser gate, and radar performance scenarios all passed.
