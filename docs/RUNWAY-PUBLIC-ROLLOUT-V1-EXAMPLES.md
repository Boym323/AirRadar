# Runway Public Rollout V1 examples

- SHADOW + PASS + review eligible → `READY_FOR_PUBLIC_CONFIG`; still not public.
- PUBLIC + PASS + effective PUBLIC → `PUBLIC_ACTIVE`.
- PUBLIC + WAIT + effective SHADOW → `PUBLIC_FAIL_CLOSED` with readiness blockers.
- DISABLED → `DISABLED` regardless of otherwise good evidence.
