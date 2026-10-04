# Runway Public Rollout V1 implementation

Implementation entry point: `lib/predictive-intelligence/runway-rollout.ts`.

The rollout contract consumes only configured/effective Runway mode, the existing Runway readiness result, and the existing graduation-calibration result. It has no database access, environment mutation, network call, stream, or public-serialization side effect.

`READY_FOR_PUBLIC_CONFIG` is advisory only: an operator may review and explicitly change Runway to `PUBLIC`, but AirRadar does not make that change automatically. `PUBLIC_ACTIVE` requires configured `PUBLIC`, effective `PUBLIC`, and readiness `PASS`.

If Runway is configured `PUBLIC` and readiness regresses, the existing effective-policy guard downgrades exposure to `SHADOW` and the rollout decision reports `PUBLIC_FAIL_CLOSED`. The existing Runway Advisory remains the enforcement point for fresh public presentation.
