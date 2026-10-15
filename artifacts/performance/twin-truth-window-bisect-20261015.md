# Operational Twin — truth-window bisection

T58 recorded approximately 40,129 CPU milliseconds across 953 event-outcome calls before PR #895. This measurement cannot establish the speedup of the current optimization.

The input truth points are sorted by timestamp and bounded at 120. The original incremental implementation traversed every point for every pending event, even if most points were outside the event time window. The new implementation uses a binary search to find the first eligible timestamp and breaks as soon as the expiry boundary is exceeded. In-window truth matching, static-content deduplication, correction evaluation, and continuity are unchanged.

The full-scan comparison implementation remains available for differential tests. Additional tests compare semantics for old, out-of-window trail history and preserve existing correction/reordering regression cases. The diagnostic evaluatedTruthPoints now reflects examined window points, rather than every point outside the interval.

No production speedup is claimed until post-release measurement. No schema, API, cadence, or dependency changes are introduced. The rare multi-second event-loop stall remains unexplained. Validate Vitest, typecheck, browser, radar performance gates, and both CodeQL checks on the exact commit before considering a merge.
