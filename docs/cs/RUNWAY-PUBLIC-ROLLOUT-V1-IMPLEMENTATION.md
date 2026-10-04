# Implementace Runway Public Rollout V1

Vstupním bodem implementace je `lib/predictive-intelligence/runway-rollout.ts`.

Rollout kontrakt používá pouze nakonfigurovaný a efektivní režim Runway, existující výsledek Runway readiness a existující graduation-calibration výsledek. Neobsahuje databázový přístup, změnu environment konfigurace, síťový požadavek, stream ani vedlejší efekt veřejné serializace.

`READY_FOR_PUBLIC_CONFIG` je pouze doporučení pro operátora: po review lze Runway explicitně přepnout na `PUBLIC`, AirRadar tuto změnu sám neprovádí. `PUBLIC_ACTIVE` vyžaduje configured `PUBLIC`, effective `PUBLIC` a readiness `PASS`.

Pokud je Runway nastavená na `PUBLIC` a readiness později zregresuje, existující effective-policy guard stáhne veřejné vystavení do `SHADOW` a rollout rozhodnutí vrátí `PUBLIC_FAIL_CLOSED`. Existující Runway Advisory zůstává místem, které vynucuje zveřejnění pouze čerstvé predikce.
