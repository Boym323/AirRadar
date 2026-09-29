# AirRadar — Aircraft Weather Batch Insert V1 Design

Status: design only. No production code, schema, migration, or runtime behavior was changed.

## Result

**WEATHER BATCH INSERT DESIGN PASS**

Decision: **IMPLEMENT WEATHER BATCH WITH BOUNDED FALLBACK V1** after the implementation-phase natural-batch measurement and real-PostgreSQL gate below.

This is a transport optimization after `decideWeatherPersistence()`. It does not change acceptance, QC, sampling, thresholds, dedup-key construction, retention, queries, or schema.

## Current path and evidence

`AircraftStateService.persistHistory()` sends one natural snapshot batch to the fire-and-forget weather lane. `weatherWriteTail` serializes that lane. `persistWeatherBatch()` currently creates/QCs/selects each observation and then performs one `AircraftWeatherObservation.create()` per selected row. `rememberMemoryRow()` and `markPersisted()` happen only after the write succeeds or an exact unique conflict is confirmed.

Measured production evidence supplied with this request:

- 30.00575 minutes
- 283.91 PostgreSQL transactions/minute
- 98.30% attributed, 1.70% unexplained
- 0 deadlocks, 0 lock waits, no connection pressure
- `weather.observation.create`: 35.49 successful writes/minute, 203.6 ms average, 1,316 ms maximum

The existing repository attribution is process-local and counts weather create calls, but does not retain the parent snapshot size. Therefore p50/p95/max selected rows per invocation cannot be recovered from the existing artifacts. Implementation must add bounded per-invocation batch diagnostics before choosing whether to lower the cap.

## Database contract

`prisma/contract.prisma` defines `AircraftWeatherObservation` with these durable fields:

`dedupKey`, `aircraftHex`, `flightId`, `callsign`, `observedAt`, `receivedAt`, `lat`, `lon`, `altitudeFt`, `altitudeType`, `windDirectionDeg`, `windSpeedKt`, `staticAirTempC`, `totalAirTempC`, `staticPressureHpa`, `humidityPct`, `turbulenceLevel`, `source`, `provider`, `quality`, `weatherSourceQuality`, `bdsConfidence`, `provenanceJson`, plus database-generated `id` and `createdAt`.

The schema declares `dedupKey String @unique`. It has ordinary query indexes on `observedAt`, `(aircraftHex, observedAt)`, `(lat, lon, observedAt)`, and `(altitudeFt, observedAt)`. No migration is required.

The repository does not contain the live PostgreSQL constraint/index name. The implementation gate must query `pg_constraint`/`pg_index` and record the exact name and columns. The expected contract is one non-null unique constraint on `dedupKey`; a real-PG test must fail closed if that is not true. `dedupKey` is non-null, so SQL NULL uniqueness semantics do not weaken the contract.

## ORM capability audit

Pinned stack: `@prisma/orm-postgres 8.0.0-rc.9`, `prisma 8.0.0-rc.13`.

Verified repository API:

```ts
database.execute(
  database.sql.public.aircraftMetadataCache
    .insert(rows)
    .build(),
)
```

The same SQL builder can target `AircraftWeatherObservation`, accepts an array of row objects, and supports `.returning(...)`. `database.execute()` is the smallest autocommit boundary; an explicit transaction is unnecessary for one atomic PostgreSQL statement. Existing catalog imports prove the multi-row builder and `transaction.execute()` APIs in this pinned stack.

Important limitation: the verified insert builder has `.returning(...)` but no `.onConflict(...)`. ORM `upsert({ conflictOn, ... })` is available for single-row writes, not as a multi-row insert conflict clause. No raw-SQL API was found in the current application contract that can safely provide an exact `ON CONFLICT (dedupKey) DO NOTHING` target. V1 must not invent one.

## Recommended flow

### Stage A — selection

Keep the existing per-aircraft loop unchanged through observation creation, QC, `decideWeatherPersistence()`, reason selection, and dedup-key generation. Stage `{ observation, reason }` objects. Do not mutate `lastPersisted`, memory rows, or persistence counters during selection.

The current caller supplies a snapshot array derived from an aircraft map; a snapshot cannot contain two entries for one ICAO. Add an invariant test that rejects duplicate `aircraftHex` values before selection. If a future caller can violate this, group/process that aircraft sequentially and never make its second decision against an uncommitted staged row.

### Stage B — persistence

Partition staged rows in original order into a hard cap of **16**. Use one centralized `weatherObservationToInsertRow()` mapper. It must preserve the current field mapping and use `Temporal.Instant.fromEpochMilliseconds()` for both `observedAt` and `receivedAt`.

For an all-new batch, call the SQL builder multi-row insert as one autocommit statement. On success, rows are known durable; then, in original order, call `rememberMemoryRow()` and `markPersisted()` once per row.

The cap is deliberately 16 rather than 32/64: it bounds malformed-row blast radius, outage fallback work, parameter count, provenance payload, and shutdown deadline pressure while still reducing round trips materially. The implementation may lower it after measuring that natural batches are predominantly smaller; it must not raise it without a new benchmark and failure review.

## Conflict and failure semantics

Because V1 cannot attach an exact `ON CONFLICT` clause, a batch containing an existing dedup key fails atomically with PostgreSQL `23505`; no rows from that statement are committed. The fallback then reuses the current single-row writer, in original order, so each row independently gets:

- success → memory row + `markPersisted()`;
- exact `dedupKey` conflict → exact-dedup counters + `markPersisted()`;
- any other failure → failure counter only; `lastPersisted` remains unchanged.

Constraint classification must verify SQLSTATE `23505` and the exact live constraint/index identity from the integration test. Do not use message substring `unique` as the sole classifier. The weather table has no other declared unique field, but the exact constraint check is still required to prevent unrelated violations being silently treated as duplicates.

For a non-duplicate batch failure, classify infrastructure errors (connection refused, timeout, cancellation, server unavailable, serialization/network failure) before fallback. On infrastructure failure, do not issue N timeouts: record one batch failure, leave all rows uncommitted, and let the next natural invocation retry. Add a process-local circuit breaker: after two consecutive infrastructure batch failures, suppress batch and single-row attempts for 30 seconds; reset on a successful DB operation. The breaker is only a write guard and does not affect live radar/SSE/history.

For a classified row/data error, retry at most **8 rows** individually (the first eight staged rows) using the current writer. Unretried rows remain uncommitted and are eligible on the next persistence opportunity. This preserves successful-row isolation without turning one bad batch into an unbounded write storm. Unknown errors use the conservative infrastructure path and do not fan out.

For an exact duplicate batch failure, use the same maximum-eight single-row fallback cap. This retains exact duplicate accounting without making a duplicate-heavy outage or replay amplify writes. A future raw SQL implementation with verified exact `ON CONFLICT (dedupKey) DO NOTHING RETURNING dedupKey` may replace this fallback, but that is explicitly out of V1’s currently verified ORM surface.

`weatherWriteTail` remains unchanged. There are no concurrent weather writers and no artificial accumulation timer.

## Ordering and accumulator semantics

Selection order remains the caller’s snapshot order. A successful batch commits atomically, then commits in-memory state in that same order. Across different aircraft, insertion order is not query order: weather queries explicitly order by `observedAt desc`, with no dependency on insert order. Dedup keys are independent across aircraft.

Across observations of one aircraft, current caller invariants allow at most one observation per invocation; the serialized write tail preserves cross-invocation ordering. If that invariant changes, per-aircraft selection must remain sequential.

`lastPersisted` changes only after a successful row insert or confirmed exact duplicate. `rememberMemoryRow()` has the same condition. Batch failure changes neither. Reason counters increment only from `markPersisted()`, exactly once per durable/duplicate row. `weatherPersistenceFailures` increments once per failed single-row attempt or once for a batch that is not retried; it must not count both a batch failure and its successful fallback rows. `lastPersistedAt` advances only for rows passed to `markPersisted()`.

## Shutdown

Include shutdown batching through the same primitive, with the existing 1.5-second deadline and 500-entry maximum. It is safe because the primitive has identical state semantics and a hard cap; if the deadline or circuit breaker prevents a write, leave the row pending. Do not weaken graceful shutdown by adding a separate queue or waiting window.

## Payload and latency model

There are 23 application-supplied columns per row. At 16 rows this is roughly 368 bind values before null/default effects; at 32 and 64 it is roughly 736 and 1,472. Even with a 1–5 KiB `provenanceJson` per row, 16 rows is approximately 16–80 KiB of JSON payload. These are comfortably below PostgreSQL’s parameter limit; the cap is driven by failure isolation and latency, not parameter exhaustion.

Ideal upper-bound model using 35.49 rows/minute (actual natural batches will be worse if mostly single-row):

| cap | candidate statements/min | saved/min | reduction | rows/statement |
|---:|---:|---:|---:|---:|
| 8 | 4.44 | 31.05 | 87.5% | 8 |
| 16 | 2.22 | 33.27 | 93.75% | 16 |
| 32 | 1.11 | 34.38 | 96.875% | 32 |
| 64 | 0.56 | 34.93 | 98.4375% | 64 |

The selected cap-16 target is therefore at most 2.22 statements/minute and 33.27 round trips/minute saved; measured production values must use observed batch sizes, not this ideal bound. Current writer occupancy is about `35.49 × 203.6 ms = 7.23 s/min`. If a cap-16 implementation averages 1.25×, 1.5×, or 2× single-row latency per batch, modeled occupied time is approximately 0.90, 1.08, or 1.45 s/min respectively, a theoretical 80–88% reduction. This is a planning model, not a promise.

## Diagnostics

Add one low-cardinality lane, `weather.observation.batch-insert`, with operation `INSERT`, and retain `weather.observation.fallback-create` for individual fallback writes. Batch diagnostics should expose attempts, successes, failures, candidate rows, inserted/durable rows, deduplicated rows, fallback rows, fallback failures, max batch size, total rows, and duration. Do not double-count a failed batch as persisted rows.

Record natural invocation count, selected rows/call, empty calls, p50/p95/max, single-row and multi-row percentages, plus cap-hit count. This is the missing measurement needed to validate the cap.

## Test and rollout plan

Unit tests must cover empty/single/multi batches, cap partitioning, row mapping, Temporal values, duplicate-aircraft rejection, all persistence reasons, mixed success/fallback, memory rows, `lastPersisted`, counters, ordering, shutdown deadline, circuit breaker, and each error class.

Require a real PostgreSQL integration test for multi-row insert, dedup conflict, partial duplicate batch, unrelated constraint failure, returned row shape if `.returning()` is used, exact constraint identity, and `Temporal.Instant` compatibility. Use the actual generated contract; fake adapters are insufficient.

Benchmark 1, 4, 8, 16, 32, and 64 rows for duration, rows/sec, transactions, round trips, payload size, duplicate behavior, and outage/fallback behavior. Roll out behind a runtime kill switch, canary one process/receiver first, and compare weather rows/min, freshness, batch/fallback rates, PostgreSQL commits/min, CPU/RSS, and METAR/TAF/SIGMET plus history/radar/SSE gates.

PASS requires semantic parity, no missing-weather or freshness regression, no persistence-failure regression, near-zero fallback in healthy operation, material transaction/round-trip reduction, and no live/history/SSE regression. Roll back immediately for missing observations, unexpected dedup/fallback storms, DB error growth, stale weather, or any radar/history/SSE impact.

## Schema

Migration required: **NO**.

## Decision

**IMPLEMENT WEATHER BATCH WITH BOUNDED FALLBACK V1**

AIRRADAR WEATHER BATCH INSERT DESIGN PASS
