# T58 follow-up: database await phase attribution and allocation microbenchmark

## Production context and measurement boundaries
- Before #942/#944: T58 1.0.472 (d06b3ea1), aircraft P50 60, CPU P50/P95/max 20.704/50.946/62.3%, GC share 1.852%, event-loop rolling P99 P95 114.295 ms.
- After #942/#944: T58 1.0.474 (29bed75c), aircraft P50 79, CPU P50/P95/max 32.341/60.121/74.59%, GC share 2.138%, event-loop rolling P99 P95 81.265 ms.
- Workload is NOT matched; no causal end-to-end CPU reduction inferred. Cgroup throttling counters were missing in both measurements.
- The `history.persist` and `network.metadata` runtime counters measure inclusive wall/process-overlap, **not** exclusive CPU, SQL executor work or allocation attribution.

## Changes
- Add opt-in, allowlisted, identity-free per-statement await wall-time measurements for history Aircraft, Flight and FlightPosition lookup/write categories. Enable only via `HISTORY_STATEMENT_PHASE_PROFILE_ENABLED=true`; report through existing history status as `statementProfile`. Off by default, no per-row storage, SQL parameters or identities.
- Measure operation completion even if it throws, preserving retries and per-aircraft transaction failure isolation. Await wall-time can contain connection/ORM work and must not be represented as actual database executor time or process CPU.
- Reuse the original already-hydrated immutable Aircraft payload when nothing needs filling from the current state. Preserve old field and enrichment precedence, including callsign route isolation. The original data is never mutated.
- Avoid a redundant full ICAO-array copy before track-fusion shadow evaluation; iterates the existing Set instead.
- Add a differential parity + CPU/allocation synthetic benchmark, run in PR CI, plus deterministic regression tests.

## Post-deploy verification
1. Pin exact deployed commit and version from `/api/health` / T58.
2. With temporary opt-in phase diagnostic, inspect `statementProfile.phases` for awaited time and failures; do not enable by default or store raw SQL.
3. Run two or more matched time windows; compare per-aircraft CPU, throughput, RSS, GC, event loop P95/P99 and history transaction counts; include cgroup telemetry coverage.
4. No change to schema, SQL semantics, transactions, WAL, retention, polling or external providers. No native rewrite without controlled cross-language benchmark.
