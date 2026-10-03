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
