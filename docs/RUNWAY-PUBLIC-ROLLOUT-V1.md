# Runway Public Rollout V1

Runway Public Rollout V1 is a pure operator decision layer between Predictive Graduation Calibration V1 and the existing Runway Advisory V1 public guard.

It does not mutate capability policy, recompute predictions, persist data, add a stream, or expose a prediction by itself.

## States

- `SHADOW_COLLECTING` — Runway remains shadow-only because readiness/calibration is not yet eligible for manual public review.
- `READY_FOR_PUBLIC_CONFIG` — readiness is PASS and calibration is manually reviewable, but configured policy remains SHADOW. An explicit configuration change is still required.
- `PUBLIC_ACTIVE` — configured policy is PUBLIC, effective policy is PUBLIC, and Runway readiness remains PASS.
- `PUBLIC_FAIL_CLOSED` — PUBLIC is configured but the runtime readiness guard has downgraded the effective policy, or another inconsistency prevents active public exposure.
- `DISABLED` — capability is explicitly disabled.

## Safety invariants

`READY_FOR_PUBLIC_CONFIG` is advisory only. The rollout layer never changes `AIRRADAR_PREDICTIVE_RUNWAY_STATUS` and never auto-promotes a capability.

Public Runway exposure remains controlled by the existing two-key contract: configured PUBLIC plus runtime readiness PASS. A readiness regression therefore returns effective policy to SHADOW and the rollout state becomes `PUBLIC_FAIL_CLOSED`.

The decision consumes the same configured/effective policy, readiness result, and graduation calibration already used by the predictive stack. No second threshold model is introduced.
