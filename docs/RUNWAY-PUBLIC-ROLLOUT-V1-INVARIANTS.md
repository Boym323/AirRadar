# Runway Public Rollout V1 invariants

1. `PUBLIC_ACTIVE` requires configured PUBLIC, effective PUBLIC, and readiness PASS.
2. SHADOW plus PASS/calibration eligibility yields only `READY_FOR_PUBLIC_CONFIG`.
3. Configured PUBLIC without active effective PUBLIC yields `PUBLIC_FAIL_CLOSED`.
4. DISABLED never requests a configuration change.
5. The rollout decision is derived and non-persistent.
6. Runway Change remains independent.
