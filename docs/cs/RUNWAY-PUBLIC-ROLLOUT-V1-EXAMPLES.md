# Příklady Runway Public Rollout V1

- SHADOW + PASS + review eligible → `READY_FOR_PUBLIC_CONFIG`; stále není veřejné.
- PUBLIC + PASS + effective PUBLIC → `PUBLIC_ACTIVE`.
- PUBLIC + WAIT + effective SHADOW → `PUBLIC_FAIL_CLOSED` s readiness blockery.
- DISABLED → `DISABLED` bez ohledu na jinak dobrou evidenci.
