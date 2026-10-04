# Lifecycle Runway Public Rollout V1

Typický lifecycle:

`SHADOW_COLLECTING` → `READY_FOR_PUBLIC_CONFIG` → ruční review/změna konfigurace → `PUBLIC_ACTIVE`.

Pokud při nakonfigurovaném PUBLIC readiness regreduje, efektivní gate vytvoří `PUBLIC_FAIL_CLOSED`. Operátor pak může vrátit configured SHADOW a stav se podle aktuální readiness vrátí do collection/review semantiky.
