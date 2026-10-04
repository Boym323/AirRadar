# Feature note — ETA Public Rollout V1

This additive contract sits between Predictive Graduation Calibration V1 and the existing ETA Advisory V1 public serializer. It provides an explicit operator-facing rollout state without changing the public serializer or configured policy.

The implementation is intentionally pure and side-effect free. `READY_FOR_PUBLIC_CONFIG` means that an operator may review and explicitly opt ETA into `PUBLIC`; it does not mean that AirRadar performs that change. If configured `PUBLIC` later loses readiness `PASS`, the existing effective-policy guard downgrades ETA to `SHADOW` and the rollout contract reports `PUBLIC_FAIL_CLOSED`.
