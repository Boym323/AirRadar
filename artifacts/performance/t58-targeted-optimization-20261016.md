# T58 follow-up: bounded metadata work and disabled shadow fast path

Date: 2026-10-16. Prepared against `main` after #939; branch-only change.

## Evidence and limitations

T58 run #38867894053 (600 seconds, 61 valid samples at 10s cadence,
production 1.0.472 / d06b3ea1) observed CPU P50 20.704% / P95 50.946% /
max 62.3% of one core, 0 flagged 85%-threshold intervals, 11,146.557 ms
of GC pause (1.852% wall time) and rolling event-loop P99 P95 114.295ms.
Cgroup throttle counters were missing for ALL 60 intervals.
Named inclusive paths (including network.metadata and history.persist) are
NOT actual JS stacks, are overlapping, and are not additive.

## Exact changes

1. `EnrichmentService.enrich()` accepts the current observation's optional
   enrichment; if metadata is already present, it does not schedule metadata
   lookup, and if a valid same-callsign route is present it does not schedule
   route lookup. Explicitly missing or callsign-stale routes remain eligible.
   Existing optional two-argument callers retain the old behavior. The caller
   supplies the latest process-local enrichment. Keep callsign/lastSeen
   freshness check before applying results; no provider concurrency change.
2. Initial icon hydration returns only *changed metadata patches*, never a
   reconstructed 8k-aircraft snapshot. Empty/no-provider returns [].
   Both local and network consumers continue to enforce matching lastSeen.
3. History: when FlightPosition shadow is disabled (default), skip shadow
   candidate construction, optional airport proximity haversine and active-key
   buffer. The real write cadence, transactions, retries, alerts and weather
   persistence do NOT change. When enabled, preserve the entire shadow path.
4. Shadow: replace rare full-map sorting at >10k bound with single oldest
   scan; stable insertion-order tie break is preserved.
5. Fix the T58 Markdown interval label to use its measured 10-second cadence.

## Validation

- `npm run test:targeted -- tests/enrichment-cache.test.ts tests/aircraft-state.test.ts tests/flight-position-persistence-shadow.test.ts`
- `node --test tests/t58-cpu-spikes.test.mjs`
- `npm run typecheck`, `npm run lint`, full Vitest and release preview.
- Collect an unchanged-workload post-deployment T58 before making any
  performance or CPU percentage claim.

## Language choice

No Rust/Go rewrite at this stage: metadata is an async provider/cache/SQL
pipeline, and history is mostly transactional I/O. Passing Aircraft through
an N-API/WASM boundary and maintaining a native binary does not remove these
round trips, and no CPU-only kernel has been proven to outweigh FFI cost.
Any future native port requires same-workload differential correctness plus
end-to-end wall time, CPU, RSS, GC and deployment benchmark gates.

## Safety

No schema changes, database writes beyond pre-existing cadence, feature flag
changes, production sampling, deployment, branch merge, or service restart.
