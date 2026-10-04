# Runway Public Rollout V1 fail-closed behavior

When configured mode is PUBLIC but effective mode is not PUBLIC or readiness is not PASS, V1 reports `PUBLIC_FAIL_CLOSED`. It never reports public active from configured intent alone.

This mirrors the runtime graduation enforcement and gives operators an explicit status for a readiness regression without creating a bypass around that enforcement.
