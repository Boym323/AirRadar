# Stavový automat Runway Public Rollout V1

Stavový automat je záměrně malý:

- configured DISABLED → `DISABLED`;
- configured PUBLIC + effective PUBLIC + PASS → `PUBLIC_ACTIVE`;
- configured PUBLIC jinak → `PUBLIC_FAIL_CLOSED`;
- configured SHADOW + PASS + manual-review eligible → `READY_FOR_PUBLIC_CONFIG`;
- configured SHADOW jinak → `SHADOW_COLLECTING`.

Žádný přechod nemění konfiguraci.
