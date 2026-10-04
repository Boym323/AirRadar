# Runway Public Rollout V1 readiness semantics

The rollout layer consumes the existing Runway readiness decision as-is. It does not turn WAIT into PASS, does not turn calibration headroom into readiness, and does not weaken integrity or collection blockers. Only an existing PASS plus `manualReviewEligible=true` can produce `READY_FOR_PUBLIC_CONFIG` while configured SHADOW.
