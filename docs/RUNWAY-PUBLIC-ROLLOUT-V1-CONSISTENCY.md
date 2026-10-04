# Runway Public Rollout V1 consistency

The state model deliberately uses both configured and effective mode. This prevents a stale configured PUBLIC intent from being mistaken for active public eligibility after runtime readiness has failed closed to SHADOW.
