# Runway Public Rollout V1 operator notes

A `READY_FOR_PUBLIC_CONFIG` decision means only that the existing Runway readiness result is PASS and graduation calibration is eligible for manual review. It is not authorization to change production automatically.

Before an operator changes `AIRRADAR_PREDICTIVE_RUNWAY_STATUS` to `PUBLIC`, the readiness report and calibration evidence should be reviewed in the same deployment context. After a manual configuration change, the runtime graduation gate remains authoritative: any readiness regression downgrades effective Runway policy to SHADOW and the rollout decision becomes `PUBLIC_FAIL_CLOSED`.

Rollback is therefore configuration-only: return the configured Runway capability to SHADOW. No database migration, backfill, or prediction-state rewrite is required by this rollout layer.
