# Predictive Public Rollout Completion V1

Predictive Public Rollout Completion V1 sjednocuje pro všechny čtyři predikční
capability explicitní a fail-closed přechod ze sběru shadow evidence do
veřejného zobrazení.

Capability jsou:

- `ETA`
- `RUNWAY`
- `RUNWAY_CHANGE`
- `TRAJECTORY`

## Sdílený rozhodovací model

Sdílený engine je v
`lib/predictive-intelligence/public-rollout.ts`. Capability-specific wrappery
zachovávají stabilní verzované kontrakty:

- `eta-public-rollout-v1`
- `runway-public-rollout-v1`
- `runway-change-public-rollout-v1`
- `trajectory-public-rollout-v1`

Každá capability skončí právě v jednom rollout stavu:

- `SHADOW_COLLECTING`
- `READY_FOR_PUBLIC_CONFIG`
- `PUBLIC_ACTIVE`
- `PUBLIC_FAIL_CLOSED`
- `DISABLED`

Readiness `PASS` nikdy automaticky nemění konfiguraci. Capability v režimu
`SHADOW` přejde do `READY_FOR_PUBLIC_CONFIG` pouze tehdy, když má readiness
`PASS` a graduation calibration ji označí jako způsobilou k ručnímu review.
Operátor musí následně explicitně nastavit `PUBLIC`.

Capability nakonfigurovaná jako `PUBLIC` je `PUBLIC_ACTIVE` jen po dobu, kdy
její efektivní policy zůstává `PUBLIC` a readiness zůstává `PASS`. Pokud
readiness klesne na `WAIT` nebo `FAIL`, existující effective-policy guard
stáhne expozici do `SHADOW` a rollout stav bude `PUBLIC_FAIL_CLOSED`.

## Hranice

Rollout engine je čistá rozhodovací vrstva. Neprovádí:

- změny environment konfigurace,
- zápisy do PostgreSQL,
- otevírání streamů,
- síťové požadavky,
- automatické zapnutí capability.

Veřejné advisory buildery zůstávají enforcement bodem pro čerstvou
per-aircraft serializaci. Rollout decision je stav pro operátora, nikoli druhá
cesta veřejné expozice.

## Administrace

Admin-only predictive readiness report nyní obsahuje `rollout` rozhodnutí pro
každou capability. Predictive panel na `/system` zobrazuje verzi, rollout
stav, informaci o aktivní veřejné expozici, požadavek na explicitní změnu
konfigurace a omezené reason codes blockerů.

Informace zůstávají za stávající admin session kontrolou na
`GET /api/admin/predictive/readiness`.
