# Predictive Prospective Validation V2

[Česká verze](cs/PREDICTIVE-PROSPECTIVE-VALIDATION-V2.md)

This is an internal, shadow-only measurement lane. A Prediction is the
immutable value produced by the predictive engine at `predictedAt`. Ground
Truth is independently classified later from persisted observation data and
the terminal evidence framework. Validation compares the two sets. Graduation
is a separate human/configuration decision and is never performed by this
lane.

## Capture

`PredictiveObservation` is append-only and keyed by
`lifecycleKey + capability + sampling bucket + model version`. It stores the
aircraft state, destination, prediction values, evidence, model/software
versions and graduation mode that existed at capture time. It does not store
mutable later Ground Truth fields.

Capture is disabled unless
`AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true`. When enabled, the
bounded asynchronous writer samples ETA by horizon bucket and runway on the
first meaningful value, meaningful confidence/runway changes, and final
on-ground observation. Queue overflow is counted and never blocks the live
receiver, aircraft state, SSE, or Flight Intelligence paths.

The Flight Intelligence detector supplies the lifecycle identity. ICAO alone
is not used as a flight identity. The deterministic observation key and the
database primary key make retries and service restarts idempotent.

## Prospective accounting and attribution

Writer diagnostics use explicit meanings: `captured` counts every observation
offered to the writer; `invalid` is rejected before enqueue; `dedupePending`
is an in-flight key collision; `dedupeDatabase` is a database primary-key
duplicate; `enqueued` is accepted into the bounded queue;
`persistenceAttempted` counts actual `create()` calls;
`rowsCommittedByWriter` counts successful `create()` callbacks;
`persistenceFailures`, `integrityRejects`, and `dropped` are terminal outcomes.
Queue depth and pending-key count are current values, while the high-water mark
is lifetime process-local for that writer session. After a drain, both exposed
reconciliation balances must be zero.

Each writer has a session id, process start time, PID, counter start time, and
bounded first/last commit timestamps plus committed row/batch counts. The
runtime prospective lane has one production writer (`ProspectiveValidationWriter`);
the validation script is read-only. `PredictiveObservation.createdAt` is the
persistence timestamp available for exact canary-interval attribution. A
canary must compare PID/session before and after the interval; any process or
session change makes runtime-vs-database accounting
`NON_COMPARABLE_PROCESS_RESTART`.

Invalid diagnostics are bounded and include aggregate and per-capability reason
histograms. Required non-null fields are validated before enqueue, including
null/undefined/empty-string and invalid numeric/timestamp cases. No payloads
are retained in these histograms.

## Scoring

Ground Truth never receives ETA, runway, confidence, or predictive evidence.
Only `CONFIRMED` truth is scoreable. `AMBIGUOUS` and `UNKNOWN` are reported as
`UNSCORABLE`, never as algorithm failures. ETA reports signed error as
`predictedLandingAt - actualLandingAt`, absolute error, MAE, median, P75/P90/P95,
bias, early/late split, horizon buckets, confidence calibration and coverage.
Runway reports exact-end and physical-runway accuracy separately, including
unknown-prediction rate and coverage. Runway-change and trajectory remain
shadow metadata/counters.

## Reports and retention

`npm run predictive:validate:prospective` writes reproducible JSON and
Markdown reports to `artifacts/predictive-validation-prospective-v2.*`.
Raw observations have a 90-day retention policy; aggregate reports are kept
longer. Cleanup is not run automatically by the application and no production
database cleanup is part of this implementation.

The DEV migration `20261003T0515_predictive_prospective_observations_v1` is
forward-only and creates only the new `predictiveObservation` table. The
primary key is the deterministic observation key used for retry/restart
deduplication. The capability, destination, flight, lifecycle, and standalone
`predictedAt` indexes match report and retention-cutoff access patterns. The
expected index footprint is small relative to the JSON evidence payload; each
captured row adds one table write plus six index entries, so write amplification
is approximately 7 index/table writes per observation before PostgreSQL page
effects. Table creation and ordinary index creation take an `ACCESS EXCLUSIVE`
table lock briefly; because the table is new and empty, there is no existing
large-table rewrite or data backfill. The migration is online with respect to
the live radar, but should be applied during a normal DEV maintenance window
before enabling the canary. Production application is intentionally deferred.

Readiness is evidence only: the default sample gates are 100 scoreable ETA
flights plus 30 relevant observations, and 100 confirmed runway arrivals.
Quality thresholds are advisory and no capability leaves `SHADOW`.

## Rollout

1. Stage 0: refresh `airradar_dev` from a read-only PROD snapshot, apply
   `20261003T0515_predictive_prospective_observations_v1`, verify
   `current_database() = airradar_dev`, and run DB integration checks with the
   switch off. The migration is DEV-first; it remains pending in PROD until a
   separately approved Stage 0 production rollout.
2. Stage 1: after DEV migration, DB integration, and runtime safety checks pass,
   enable capture for a DEV canary and check queue, failures and growth.
3. Stage 2: observe 24 hours and audit lifecycle isolation.
4. Stage 3: produce the first seven-day evidence report.
5. Stage 4: review 30-day calibration and readiness evidence.

The DEV canary uses
`AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true`. Return it to
`false` after the canary unless DEV capture is intentionally retained. With
the switch `false`, prospective persistence writes are disabled, the predictive
engine remains in `SHADOW`, and the public SSE snapshot is unchanged. Applying
the schema does not automatically graduate the feature or expose it publicly.
No stage deploys, restarts production, writes production data during
implementation, or changes graduation policy. Synthetic observation rows and
validation reports belong only to DEV/test databases during this workflow.
