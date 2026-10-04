# ETA Public Rollout V1

ETA Public Rollout V1 převádí existující ETA readiness, graduation calibration a fail-closed effective policy do jednoho explicitního provozního rozhodovacího kontraktu.

## Stavy

- `SHADOW_COLLECTING` — ETA zůstává pouze v shadow režimu, protože readiness nebo calibration ještě nejsou způsobilé k ručnímu review.
- `READY_FOR_PUBLIC_CONFIG` — readiness je `PASS` a graduation calibration je připravená k ručnímu review, ale configured policy je stále `SHADOW`. Veřejně se ještě nic nezobrazuje.
- `PUBLIC_ACTIVE` — configured policy je explicitně `PUBLIC`, effective policy zůstává `PUBLIC` a readiness je stále `PASS`.
- `PUBLIC_FAIL_CLOSED` — configured policy požaduje `PUBLIC`, ale runtime readiness guard stáhl effective policy na `SHADOW` nebo readiness už není `PASS`.
- `DISABLED` — ETA capability je explicitně vypnutá.

## Bezpečnostní invariant

Rollout decision nikdy nemění konfiguraci a nikdy ETA automaticky nepovyšuje. `READY_FOR_PUBLIC_CONFIG` je pouze signál pro operátora. Veřejná ETA je nadále řízena existujícím dvouklíčovým kontraktem: configured ETA policy musí být `PUBLIC` a runtime readiness musí být `PASS`. Existující ETA advisory navíc vyžaduje čerstvou, neexpirovanou predikci s kalibrovanou uncertainty.

Pokud readiness po nastavení `PUBLIC` regreduje, effective policy zůstane fail-closed a rollout stav přejde na `PUBLIC_FAIL_CLOSED`. Nepřidává se žádná nová persistence, stream, prediction input ani databázový dotaz.

## Provozní postup

1. Ponechat ETA jako `SHADOW`, dokud se sbírá evidence.
2. Sledovat graduation calibration, dokud ETA nehlásí `READY` / `manualReviewEligible=true`.
3. Potvrdit rollout decision `READY_FOR_PUBLIC_CONFIG`.
4. Explicitně nastavit `AIRRADAR_PREDICTIVE_ETA_STATUS=PUBLIC` standardní cestou deployment konfigurace.
5. Po deploymentu vyžadovat stav `PUBLIC_ACTIVE`; runtime readiness guard dál automaticky zajišťuje fail-closed návrat.

Tento kontrakt je záměrně specifický pro ETA. Runway, runway-change a trajectory rollout mají stejný vzor převzít až ve chvíli, kdy budou připravené jejich vlastní produktové/advisory vrstvy a evidence.
