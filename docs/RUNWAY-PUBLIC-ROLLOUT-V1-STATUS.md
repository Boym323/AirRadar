# Runway Public Rollout V1 status semantics

The rollout state is derived from existing policy and readiness facts. It is not persisted.

- `READY_FOR_PUBLIC_CONFIG` means reviewable, not public.
- `PUBLIC_ACTIVE` means public eligibility is already active under the existing guard.
- `PUBLIC_FAIL_CLOSED` means configured intent and effective eligibility differ; public serialization must remain suppressed.

The distinction is intended to make operator status explicit without weakening the existing predictive safety boundary.
