# Runway Public Rollout V1 freshness boundary

Rollout state has no prediction freshness window. The existing Runway Advisory 45-second freshness guard remains responsible for suppressing stale concrete predictions even when rollout state would otherwise be `PUBLIC_ACTIVE`.
