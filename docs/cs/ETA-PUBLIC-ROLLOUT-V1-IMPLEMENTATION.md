# Implementace ETA Public Rollout V1

Vstupním bodem implementace je `lib/predictive-intelligence/eta-rollout.ts`.

Model používá pouze nakonfigurovaný a efektivní režim ETA, existující výsledek ETA readiness a existující výsledek ETA graduation calibration. Neobsahuje databázový přístup, změnu environment konfigurace, stream ani vedlejší efekt veřejné serializace.

Existující veřejný ETA advisory zůstává místem, které vynucuje bezpečné zveřejnění pouze čerstvé predikce. Rollout model pouze explicitně a testovatelně popisuje provozní přechod a fail-closed návrat před jakoukoli změnou produkční konfigurace.
