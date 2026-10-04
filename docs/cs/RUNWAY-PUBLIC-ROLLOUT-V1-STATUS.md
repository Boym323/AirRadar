# Význam stavů Runway Public Rollout V1

Rollout stav se odvozuje z existujících faktů o policy a readiness. Neukládá se.

- `READY_FOR_PUBLIC_CONFIG` znamená způsobilé k review, nikoli veřejné.
- `PUBLIC_ACTIVE` znamená, že veřejná způsobilost už je aktivní podle existujícího guardu.
- `PUBLIC_FAIL_CLOSED` znamená rozdíl mezi nakonfigurovaným záměrem a efektivní způsobilostí; veřejná serializace musí zůstat potlačená.

Rozlišení zviditelňuje provozní stav bez oslabení existující predictive safety boundary.
