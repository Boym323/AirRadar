# ETA Public Rollout V1 implementation

Implementation entry point: `lib/predictive-intelligence/eta-rollout.ts`.

The model consumes only configured/effective ETA mode, the existing ETA readiness result and the existing ETA graduation calibration result. It has no database, environment mutation, stream or public serialization side effect.

The existing public ETA advisory remains the enforcement point for fresh public presentation. This rollout model exists to make the operator transition and fail-closed fallback explicit and testable before any production configuration is changed.
