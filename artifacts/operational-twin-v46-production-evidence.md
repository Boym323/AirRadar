# Operational Twin V4.6 production evidence

## Sources and scope

Read-only review of the V4.5 T5.7C journal and summary at
`/var/lib/airradar/t57-soak-20261015T065700+0200/`, plus the process-local
runtime telemetry history. No production setting, service, or database was
changed. The T5.7C run identifies `1.0.453 / e8260a6a`; it collected 57 of 61
planned samples over one hour and is explicitly `INSUFFICIENT_EVIDENCE`.

## Observed production behavior

- `twin.eventOutcome.local` ran 701 times and received 920,754.833 ms of
  synchronous CPU attribution. Async wait was 0 ms. It accounted for 99.98%
  of the measured `snapshot.operationalTwin` CPU.
- Across the 59 available minute buckets inside the soak window, the path ran
  12 times per minute at P50, 16 at P95, and 19 at maximum. Attributed CPU per
  minute was 17,037.951 ms at P50, 27,071.779 ms at P95, and 29,262.879 ms
  maximum. The path's per-minute P99 was 2,301.237 ms at P50, 4,818.766 ms at
  P95, and 5,011.605 ms maximum.
- The T5.7C event-loop windows report P99 P50/P95/max of 305.136 / 618.660 /
  721.945 ms. Their maximum observed stall was 14,025.753 ms. Overlap-aligning
  57 path CPU buckets with event-loop windows gives Pearson r=0.743 for
  path CPU versus event-loop P99, and r=-0.009 versus event-loop maximum.
  This supports an association with sustained event-loop delay; the largest
  isolated stall does not line up with path CPU in these aggregates.
- In 724 adjacent, approximately 60-second runtime telemetry intervals for
  `e8260a6a`, Event Outcome p95 has Pearson r=0.600 with process CPU percent.
  Event Outcome p95 has weak association with interval major-GC pause deltas
  (r=0.096); process CPU has r=0.238 with those deltas. These are observational
  correlations and do not show that GC caused the hot path.
- The soak reports RSS P50/P95/max of 1,153.754 / 1,164.438 / 1,168.383 MiB,
  heap-used 632.113 / 745.501 / 784.570 MiB, and early-to-late post-major-GC
  differences of +7.088 MiB heap and +10.106 MiB old space. Those deltas do
  not show material retained-heap growth, though the incomplete run cannot
  establish a long-term memory trend.
- The soak context reports ATC `false/false` per the supplied production
  evidence. The journal does not include an ATC truth lookup count, so that
  flag state alone does not establish whether pending sector outcomes still
  invoke local truth dataset checks.

## Metrics absent from the production evidence

The V4.3/V4.5 telemetry schema and saved T5.7C rows do not include any of the
following. They remain unknown; no value is inferred from total call counts,
calibration aggregates, or memory measurements.

| Requested measure | Evidence available |
| --- | --- |
| Pending event population over time | None; only an instantaneous pending count is available from a separate live validator report, not retained in this journal |
| Events captured or expired per minute | None |
| Pending events per aircraft | None; aircraft-level identity data is deliberately not present |
| Truth-state invalidation rate | None |
| Snapshot cadence | `twin.eventOutcome.local` invocations are an observed proxy for local snapshot processing: 12/min at P50, 16/min at P95, 19/min maximum. Provider fetch timestamps are not retained, so exact readsb polling intervals remain unknown |
| Per-phase CPU/wall time and allocation rate | None; current path timing is inclusive at the whole-operation boundary |
| GC pauses aligned to each hot-path call | None; only sampled aggregate pause counters are available |

Runtime telemetry carries aggregate aircraft count (median 59, P95 85, max
100), but not how pending events are distributed across them. Separately, 725
same-commit samples report the rolling path p95 as 2,094.581 ms at P50,
4,642.739 ms at P95, and 6,188.316 ms maximum. This is not a per-call
distribution. Neither series establishes which internal operation dominates
or why a 60-aircraft/360-pending microbenchmark under-represents production.

## Evidence needed to reproduce the workload gap

Add bounded aggregate counters for pending-count buckets, capture/expiry
counts per minute, and pending-per-aircraft histogram buckets. Record local
truth invalidations and snapshot interval histograms alongside the existing
Event Outcome CPU windows. Add opt-in bounded phase timing for fingerprinting,
truth-point construction/diffing, pending traversal/evaluation, spatial checks,
ATC preparation/cache, cleanup, expiry, and eviction. Keep these diagnostics
free of ICAO, coordinates, callsigns, dataset identifiers, and raw provider
data. Collect the same counters during a deterministic 60-minute benchmark
with 120-point trails and matched baseline/optimized traffic, then compare
phase CPU, pending distribution, GC deltas, and heap/RSS under identical
traffic.

## Partial aged-state benchmark

The existing deterministic aged-state benchmark was run at 250 aircraft,
120-point trails, and the 6,000 pending cap. It captures three sector
predictions per aircraft per simulated minute for 45 minutes, followed by five
measurement snapshots. Both variants use the same expiry queue and ATC cache;
the reference disables only incremental truth evaluation. Three independent
unprofiled Node processes produced these per-run P50/P95/max snapshot times:

| Variant | P50 range (median) | P95 range (median) | max range (median) |
| --- | ---: | ---: | ---: |
| e8260a6a-style full truth evaluation | 514.026–533.375 (522.125) ms | 555.806–597.518 (572.435) ms | 581.799–643.842 (600.396) ms |
| V4.6 incremental truth evaluation | 385.630–404.838 (394.552) ms | 419.284–579.930 (432.742) ms | 446.204–839.045 (493.581) ms |

Across those runs, pending ended at 6,000 and both variants evicted 27,750
entries. The optimized variant evaluated 6.39M truth points versus 11.34M in
the reference, a 43.7% reduction. Median P50/P95/max improved 24.4% / 24.4% /
17.8%. The P95 and max ranges overlap, including an optimized max outlier of
839.045 ms, so stable tail improvement is not established. These are useful
aged-state results, not production acceptance: they
cover one aircraft count and one pending level, use one-minute position
updates, run 45 simulated minutes, and benchmark the validator alone. They do
not contain one-second unchanged snapshots or full `AircraftStateService`
processing. No P99 is claimed.

One opt-in profiled run of the same workload measured 12,500 aircraft visits.
The inclusive pending evaluation phase totaled 21,022.084 ms; spatial checks
16,024.765 ms; `computeAtcContext` 8,917.491 ms; cache lookup 3,400.391 ms;
truth input fingerprinting 430.554 ms; truth-point construction 376.549 ms;
truth-state diffing 959.886 ms; cache cleanup 1.842 ms; expiry 4.947 ms; and
capacity eviction 22.803 ms. These phase totals overlap and instrumentation
adds timer overhead; they must not be summed or treated as production CPU
shares. The 735,250 `computeAtcContext` calls confirm this synthetic workload
does execute ATC truth dataset lookups. The benchmark's single heap-used
snapshots varied substantially between repetitions and provide no GC or RSS
regression conclusion.

## Verdict

The high synchronous Event Outcome CPU and sustained event-loop P99 association
are reproduced from production evidence. The production pending workload and
internal dominant phase are not reproduced because the required population,
capture, expiry, invalidation, and phase metrics were not recorded. This
evidence does not yet justify another optimization.
