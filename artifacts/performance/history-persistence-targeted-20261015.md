# History persistence hot-path review — 2026-10-15

## Evidence and boundary

- Clean, stable T58 before unified ATC/Twin/SSE #895 and network trails #899:
  [one-hour GitHub record](https://github.com/Boym323/AirRadar/actions/runs/38730677694),
  61/61 samples at `08b009f7 / 1.0.457`.
- `history.persist` 69,764.181 attributed CPU ms / 954 calls with 324.967 ms
  async wait reported in the sampled overlapping hot-path profiler. Maximum
  completed-window history scope reached 3,531.612 ms. CPU accounting is
  approximate; neither PostgreSQL execution nor connection wait can be deduced
  from it.
- Historic sampled position writes are **one per eligible aircraft inside
  individually atomic transactions**; this PR does not change cadence,
  transaction boundaries, limits, current/first-flight alerts, row contents,
  retention policy, or persistence retry behavior.
- The existing process-local `HistoryPersistenceCanary` tracks statements per
  transaction and duration. This is an observational gate, not proof of
  database round-trips eliminated in production.

## Implemented work

1. `AircraftStateService.persistHistoryCore`: one pass over the snapshot
   builds the active-ICAO list, observes the flight-position shadow for all
   valid positions, and selects due aircraft. Only the due candidates receive
   `historyAircraftForSnapshot` metadata/enrichment merging. Prior code
   merged and allocated an enriched `Aircraft` for all positions, then
   filtered samples that were not due.
2. `recordAircraftSnapshot`: fetch the open Flight **first**. When present
   it is already positive proof of a durable Flight; skip the old separate
   `Flight.where({aircraftId}).limit(1).all()` existence query when the
   process-local flight-presence cache was cold or evicted. When no active
   Flight exists, retain the existence query and first-ever flight
   distinction. Successful/failed transactions still individually control
   state advance and retry.
3. A regression test models an uncached existing durable flight and asserts
   the extra prior-flight existence query is never called, while position
   persistence and flight update still occur. Existing cross-snapshot tests
   cover due cadence, late snapshots, failed write retry, and callsign-bound
   enrichment.

## Deliberately not changed

- The per-aircraft transaction design: batching would risk partial failure
  semantics and requires a separate shadow/replay benchmark and database
  integration validation, especially with concurrent aircraft and first-flight
  alert behavior.
- PostgreSQL query/index/connection settings: no up-to-date `pg_stat_statements`
  attribution proves a database-side bottleneck.
- Retention, readsb polling cadence, background write queue, T58/T59
  production flags, or the active Navigation Integrity PR #902.
- No rewrite into Rust/Go: persistence latency is predominantly an async
  transactional boundary; language migration is not a validated speedup.

## Validation to execute before merge

- Full Vitest, typecheck, ESLint, production build, release/browser gates,
  radar performance regression, GitHub CodeQL **including the CodeQL
  Security check**, and review paired runtime observations after release.
- Production success requires measuring `history.persist` CPU/call,
  statements/transaction, SQL P95/P99, history failures and throughput under
  matching aircraft/flight activity. Longest event-loop stalls and RSS growth
  require separate attributable forensics; **this PR does not claim to cure
  those symptoms**.
