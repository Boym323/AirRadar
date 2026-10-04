# Runway Public Rollout V1 review checklist

Manual review before a production PUBLIC configuration change should confirm:

1. Runway readiness is PASS on a complete bounded collection.
2. Graduation calibration reports `manualReviewEligible=true` and no blockers.
3. Configured Runway policy is still SHADOW before the operator action.
4. Existing Runway Advisory public guards remain unchanged.
5. Rollback to SHADOW is available as a configuration-only action.

This checklist is descriptive and does not authorize or perform the configuration change.
