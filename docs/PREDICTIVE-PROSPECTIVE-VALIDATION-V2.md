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

1. Stage 0: migrate/verify in development with the switch off.
2. Stage 1: enable capture for a canary and check queue, failures and growth.
3. Stage 2: observe 24 hours and audit lifecycle isolation.
4. Stage 3: produce the first seven-day evidence report.
5. Stage 4: review 30-day calibration and readiness evidence.

No stage deploys, restarts production, writes production data during
implementation, or changes graduation policy.
