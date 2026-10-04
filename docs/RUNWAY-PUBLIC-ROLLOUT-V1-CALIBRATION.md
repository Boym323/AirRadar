# Runway Public Rollout V1 calibration semantics

Graduation calibration is consumed only for `manualReviewEligible` and blocker context. The rollout layer does not recalculate sample deficits, exact-end accuracy, coverage, stale rate, or threshold margins. That keeps one authoritative readiness/calibration implementation.
