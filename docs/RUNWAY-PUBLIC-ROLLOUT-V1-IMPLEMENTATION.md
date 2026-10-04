# Runway Public Rollout V1 implementation

The implementation entry point is `lib/predictive-intelligence/runway-rollout.ts`.

The model consumes only configured/effective Runway policy, the existing Runway readiness result, and the existing Runway graduation calibration result. It has no database access, environment mutation, stream, or public-serialization side effect.

The existing Runway advisory remains responsible for suppressing stale, unavailable, unknown-confidence, or non-PUBLIC predictions. The rollout model only makes the operator transition and fail-closed fallback explicit and testable before any production configuration change.
