# Operational Twin V4.6 iteration 1

## Production baseline

Source: read-only T5.7 soak at `/var/lib/airradar/t57-soak-20261015T065700+0200/`.

- Version/commit: `1.0.453` / `e8260a6a`
- `twin.eventOutcome.local`: 701 calls, 920,754.833 attributed CPU ms, 0 wait ms, worst window p99 5,011.605 ms.
- `snapshot.operationalTwin`: 920,914.709 CPU ms. Event Outcome accounts for 99.98% of that measured total.
- CPU P95: 100%; RSS P50: 1,153.754 MiB; heap used P50: 632.113 MiB.
- The user-provided V4.5 summary reports a 14,025.8 ms maximum event-loop stall and 40 unique windows above five seconds.

The T5.7 report attributes process CPU synchronously to Event Outcome and separately measures async database settlement/timeout overshoot. Async wait is not counted as Event Outcome CPU.

## Code evidence

Before this iteration, every unchanged local refresh could serialize up to 120 trail points per aircraft into a new JSON fingerprint. Provider age fields (`lastSeen`, `seenSeconds`, `seenPosSeconds`) were included separately even when their derived `positionObservedAt()` stayed unchanged. The validator also traversed all pending IDs and repeated the ATC endpoint cache lookup when an aircraft's canonical truth version had not changed.

## Iteration 1 changes

- The local `AircraftStateService` reuses its immutable local trail array when the position timestamp and all truth-relevant position fields are unchanged. Same-time corrections still replace the point.
- Truth invalidation now uses the canonical derived position timestamp and truth fields. A same-reference trail can reuse the parsed/sorted truth state without allocating a full fingerprint.
- Newly captured outcomes are kept in a per-ICAO dirty set. A repeated snapshot with no truth change skips pending traversal and ATC lookup; a truth change still traverses that ICAO's pending set.
- Report counters expose fingerprint builds, trail points fingerprinted, truth-state reuses, pending visits, and truth points built/evaluated.
- The full-scan reference path remains available for differential comparison.

## Matched microbenchmark

Command: `npm run benchmark:twin-event-outcome`  
Node: `v22.23.3`  
Input: 60 aircraft, 120 trail points, 360 captured pending outcomes, 10 refreshes. Provider age values change each refresh while `positionObservedAt()` stays fixed; the trail includes a replacement and an older-point correction. ATC cache is enabled in both algorithms.

| Metric | Full-scan reference | Incremental |
| --- | ---: | ---: |
| Warm observe P50 | 17.723 ms | 0.246 ms |
| Warm observe P95/P99/max (10 samples) | 28.341 ms | 39.369 ms |
| CPU over run | 279.551 ms | 189.932 ms |
| Pending entries visited | 2,700 | 900 |
| Pending entries skipped without new truth | 0 | 1,800 |
| Truth points built | 72,300 | 21,720 |
| Truth points evaluated | 325,800 | 44,457 |
| Canonical fingerprint builds | n/a | 180 |
| Unchanged truth-state reuses | n/a | 420 |
| Heap delta | +12.72 MiB | +13.10 MiB |
| RSS delta | +0.25 MiB | +0.25 MiB |

Differential semantic reports matched. The 10-sample P95/P99/max is noisy and regressed in this run, so these measurements do not establish a reliable tail-latency improvement. Heap deltas are process snapshots, not an allocation profiler; GC events were not attributed by phase.

## Acceptance gaps

This iteration does not yet meet the V4.6 release verdict. The matched benchmark does not cover the full 1s/3s/10s × 50/70/100/250 aircraft × 1k/3k/6k pending matrix, 60 minutes, realistic prediction recovery/expiry, or pending-event end-to-end `AircraftStateService` load. Per-operation wall time for truth parsing/diff, cache cleanup, heap work, and allocations/GC is not yet sampled. No stable production-equivalent tail-latency reduction has been demonstrated.

**Verdict: V4.6 BLOCKED — ROOT CAUSE NOT RESOLVED.**
