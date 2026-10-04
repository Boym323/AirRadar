# Runway Public Rollout V1 API contract

`buildRunwayPublicRolloutDecision()` accepts configured mode, effective mode, Runway readiness, and Runway graduation calibration. It returns a versioned derived decision containing state, readiness, manual-review eligibility, public-active flag, explicit-config-change requirement, and blockers.

The function is not an HTTP API and is not exposed directly to public clients in V1.
