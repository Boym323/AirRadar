# Runway Public Rollout V1 dependencies

The decision layer depends only on existing predictive contracts:

- `PredictiveCapabilityStatus`,
- Runway `PredictiveReadinessCapabilityResult`,
- Runway `PredictiveGraduationCapabilityCalibration`,
- the existing graduation-enforced effective policy.

It intentionally has no dependency on Prisma, HTTP, timers, browser state, or prediction persistence.
