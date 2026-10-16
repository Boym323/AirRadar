# T58 follow-up: remove redundant source-affinity sweeps

## Baseline and scope

- Base: post-#942 `main`; no production service or database changes.
- T58 #38867894053: 61 samples, CPU P50/P95/max 20.704/50.946/62.3%
  of one core; cgroup throttle telemetry unavailable across all intervals.
- Prior network snapshot flow: `reconcileSourcePreferences` iterated ALL
  retained source preference entries twice per successful snapshot, around
  `pruneMissingAircraft`; local snapshots did the same.

## Optimization and equivalence

- Each local or network snapshot invokes at most one complete reconciliation
  before stale pruning. If the source membership is unchanged and no grace
  timer is pending, it does not invoke reconciliation at all. Newly observed
  ICAOs are detected as they are read; removed members are detected by
  comparing old/new membership cardinality. Failed source polls still use
  their existing unconditional reconciliation path. This preserves affinity,
  failover grace, source transition, fallback position and mass-drop behavior.
- When the prune removes an ICAO from its final retained map and the
  alternate is neither observed nor retained, inline cleanup deletes only
  its preference and missing-since entry. No unrelated identities are visited.
- On the normal *stable-membership* snapshot, both full O(N)
  reconciliation scans are skipped; one extra old-membership hash lookup
  is performed per unique incoming aircraft until a new member is found.
  On membership changes or pending grace timers, one scan replaces two.
  If K stale keys are pruned, cleanup costs O(K) independent membership checks.
  Expected performance benefit is workload-dependent; no aggregate speedup
  is claimed without a matched same-workload test.
- When incoming network observations already specify `origin`, reuse the
  object rather than allocating a complete spread copy before the existing
  plausibility filter. Missing origins still default to `adsblol`.
- History persistence dedup reuses already-normalized immutable aircraft
  objects; noncanonical ICAO hexes are still uppercased on a copy.
  The transaction count, Flight/FlightPosition schema, cadence, error
  isolation and retention policy do not change.

## Safety / tests

- Added tests checking exactly one affinity traversal per snapshot and
  removal of final stale identities, including local path.
- Existing tests cover failover grace, stale retention, mass-drop behavior,
  history duplicate normalization and DB transaction retries.
- Run complete Vitest, lint, typecheck, production build, CodeQL on exact SHA.
- Compare CPU/event-loop/RSS and network snapshot hot path at matched traffic.
- Explicitly no Rust/Go rewrite: these are state-management and database
  edges. Native FFI would duplicate shared state and introduce copying.
