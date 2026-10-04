# Runway Public Rollout V1 design

The Runway rollout decision intentionally mirrors ETA Public Rollout V1 rather than introducing a generic multi-capability mutation framework. Keeping each V1 capability explicit makes readiness evidence, operator intent, and fail-closed behavior auditable while the predictive capabilities still have different truth and quality semantics.

A shared abstraction can be considered later only if it preserves those capability-specific boundaries without enabling automatic promotion.
