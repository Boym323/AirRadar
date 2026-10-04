# Runway Public Rollout V1

Runway Public Rollout V1 je čistá provozní rozhodovací vrstva mezi Predictive Graduation Calibration V1 a existujícím veřejným guardem Runway Advisory V1.

Sama nemění capability policy, nepřepočítává predikce, nic neukládá, nepřidává stream ani sama nezveřejňuje predikci.

## Stavy

- `SHADOW_COLLECTING` — Runway zůstává pouze v shadow režimu, protože readiness/calibration zatím není způsobilá pro ruční public review.
- `READY_FOR_PUBLIC_CONFIG` — readiness je PASS a calibration umožňuje ruční review, ale nakonfigurovaná policy zůstává SHADOW. Stále je nutná explicitní změna konfigurace.
- `PUBLIC_ACTIVE` — policy je explicitně PUBLIC, efektivní policy je PUBLIC a Runway readiness zůstává PASS.
- `PUBLIC_FAIL_CLOSED` — PUBLIC je nakonfigurováno, ale runtime readiness guard stáhl efektivní policy zpět, nebo jiná nekonzistence brání veřejnému vystavení.
- `DISABLED` — capability je explicitně vypnutá.

## Bezpečnostní invarianty

`READY_FOR_PUBLIC_CONFIG` je pouze doporučení pro operátora. Rollout vrstva nikdy nemění `AIRRADAR_PREDICTIVE_RUNWAY_STATUS` a capability automaticky nepovyšuje.

Veřejný Runway advisory nadále používá existující dvouklíčový kontrakt: explicitní PUBLIC konfigurace plus runtime readiness PASS. Při regresi readiness se efektivní policy vrátí do SHADOW a rollout stav přejde na `PUBLIC_FAIL_CLOSED`.

Rozhodnutí používá stejnou nakonfigurovanou/efektivní policy, readiness výsledek a graduation calibration jako zbytek predictive stacku. Nevzniká druhý model thresholdů.
