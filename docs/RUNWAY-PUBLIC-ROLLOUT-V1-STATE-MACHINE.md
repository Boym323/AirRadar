# Runway Public Rollout V1 state machine

The state machine is intentionally small:

- configured DISABLED → `DISABLED`;
- configured PUBLIC + effective PUBLIC + PASS → `PUBLIC_ACTIVE`;
- configured PUBLIC otherwise → `PUBLIC_FAIL_CLOSED`;
- configured SHADOW + PASS + manual-review eligible → `READY_FOR_PUBLIC_CONFIG`;
- configured SHADOW otherwise → `SHADOW_COLLECTING`.

No transition mutates configuration.
