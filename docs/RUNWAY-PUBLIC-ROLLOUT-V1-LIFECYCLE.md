# Runway Public Rollout V1 lifecycle

Typical lifecycle:

`SHADOW_COLLECTING` → `READY_FOR_PUBLIC_CONFIG` → manual config review/change → `PUBLIC_ACTIVE`.

If readiness regresses while configured PUBLIC, the effective gate produces `PUBLIC_FAIL_CLOSED`. An operator may then restore configured SHADOW, after which the state returns to collection/review semantics based on current readiness.
