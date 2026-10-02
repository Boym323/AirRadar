# AirRadar Predictive Intelligence V1 — Validation

## Current decision

`ETA SHADOW`, `RUNWAY SHADOW`, `RUNWAY_CHANGE SHADOW`, `TRAJECTORY SHADOW`.

No capability is public because the required real historical holdout and production shadow evidence is absent. This is a quality-preserving decision, not a model-quality claim.

## Validation status

The calibration/holdout contract is implemented and focused tests pass. This
run remains `PARTIAL` because no read-only source database or frozen corpus is
available in the checkout; absence of data is not treated as zero.

## Required evidence still open

1. Representative completed-flight corpus, including difficult and unknown cases.
2. Data-quality report and deterministic calibration/holdout split.
3. ETA baseline, checkpoints, error/bias/coverage metrics, and outlier review.
4. Observed landing-runway truth, runway baseline, checkpoint accuracy, and stability/hysteresis analysis.
5. Runway-change false-change analysis.
6. Historical trajectory negative/positive validation and false-positive review.
7. Time Machine/API/browser gates over historical fixtures.

No ground truth was manufactured from `Flight.endTime` or the predictor itself.
All capability gates remain `SHADOW`.
