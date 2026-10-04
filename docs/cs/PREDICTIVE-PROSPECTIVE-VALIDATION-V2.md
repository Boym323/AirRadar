# Prospektivní validace predikcí V2

[English version](../PREDICTIVE-PROSPECTIVE-VALIDATION-V2.md)

Jde o interní shadow-only měřicí linku. Prediction je neměnná hodnota
prediktivního enginu v okamžiku `predictedAt`. Ground Truth se později
nezávisle klasifikuje z uložených observačních dat a terminálního evidence
frameworku. Validation tyto dvě datové sady porovnává. Graduation je oddělené
budoucí rozhodnutí a tato linka jej nikdy neprovádí.

## Capture

`PredictiveObservation` je append-only a používá klíč
`lifecycleKey + capability + sampling bucket + model version`. Zachycuje stav
letadla, predikční hodnotu, důkazy a verze dostupné v okamžiku vzniku. Pozdější
Ground Truth se do řádku nedopisuje.

Capture je ve výchozím stavu vypnutý a zapíná se pouze proměnnou
`AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true`. Writer je asynchronní
a bounded; chyba persistence ani plná fronta nesmí zastavit receiver, aircraft
state, SSE ani Flight Intelligence.

Záznam obsahuje capability, ICAO, lifecycle identity, callsign, cíl, čas
predikce, horizon bucket, fázi letu, souřadnice, výšku, rychlost, vertical rate,
track, predikční hodnotu, confidence, auditní evidence, verzi modelu, release a
režim graduation. Prediction se zachytává prospektivně před událostí; budoucí
údaje se zpětně nepřidávají a predikce se z budoucích dat nerekonstruuje.

## Účetnictví a atribuce prospective writeru

Diagnostika používá přesnou sémantiku: `captured` počítá každou observation
nabídnutou writeru; `invalid` je odmítnutí před enqueue; `dedupePending` je
kolize klíče ve frontě/in-flight; `dedupeDatabase` je duplicita primárního klíče
v databázi; `enqueued` je přijetí do bounded fronty;
`persistenceAttempted` počítá skutečná volání `create()`;
`rowsCommittedByWriter` počítá úspěšné callbacky `create()`;
`persistenceFailures`, `integrityRejects` a `dropped` jsou terminální výsledky.
Queue depth a počet pending klíčů jsou okamžité hodnoty, high-water mark je
procesní hodnota dané session. Po úplném drainu musí být oba reconciliation
balance nulové.

Každý writer má session ID, čas startu procesu, PID, začátek počítadla a
omezené first/last commit timestampy včetně počtu committed řádků a batchů.
Produkční prospective lane má jediný writer (`ProspectiveValidationWriter`);
validační skript je read-only. `PredictiveObservation.createdAt` je existující
čas persistence pro přesnou atribuci canary intervalu. Canary musí porovnat
PID/session před a po intervalu; při změně procesu/session je runtime-vs-DB
účetnictví `NON_COMPARABLE_PROCESS_RESTART`.

Invalid diagnostika je bounded a obsahuje agregovaný i per-capability histogram
důvodů. Povinná non-null pole se validují před enqueue včetně null/undefined,
prázdných řetězců a neplatných čísel/časů. Histogramy neuchovávají payloady.

## Scoring

Ground Truth nikdy nedostává ETA, runway, confidence ani predictive evidence.
Pouze `CONFIRMED` je scoreable; `AMBIGUOUS` a `UNKNOWN` jsou `UNSCORABLE`, ne
chyba algoritmu. ETA i runway reporty zachovávají horizon/confidence členění,
coverage a oddělené exact-end/physical-runway metriky.

ETA používá znaménkovou chybu `predictedLandingAt - actualLandingAt`, absolutní
chybu, MAE, medián, P75, P90, P95, bias a podíl předčasných/pozdních predikcí.
Runway odděluje přesný konec od fyzické runway a zachovává UNKNOWN v coverage
metrikách. Confidence HIGH, MEDIUM, LOW a UNKNOWN se agregují odděleně bez
změny thresholdů nebo graduation policy.

Trajectory prospektivně ukládá explicitní `trajectoryState` do omezeného
`evidenceJson` pouze při změně stavu nebo confidence. Runtime readiness tak
umí odlišit instrumentované trajectory observations od starších metadata-only
řádků a samostatně počítat kandidáty `POSSIBLE_DEVIATION` a `DEVIATING`.
Runway-change a trajectory outcome scoring nyní používají oddělený kontrakt
`predictive-outcome-truth-v1`. Runway change vyžaduje nezávislou APPROACH
runway před predikcí a pozdější provider-reported LANDING runway. Trajectory
positive truth vyžaduje následný confident DIVERSION, GO_AROUND, HOLDING, ORBIT
nebo UNUSUAL_TURN; negative truth vyžaduje ground-confirmed landing na stejném
prospective cíli. Chybějící evidence zůstává UNSCORABLE.

## Reports and retention

`npm run predictive:validate:prospective` zapisuje reprodukovatelný JSON a
Markdown do `artifacts/predictive-validation-prospective-v2.*`. Raw data mají
navrženou retenci 90 dní; automatický cleanup ani produkční DB změna nejsou
součástí implementace. Readiness je pouze evidence a graduation zůstává
SHADOW.

Report je reprodukovatelný z uložených observations a nezávislé historie. Při
nedostatku dat vrací `INSUFFICIENT_DATA`, nikoliv zavádějící nulovou chybu nebo
100% přesnost. Persistence failures, dropped samples, queue depth a high-water
mark se uvádějí zvlášť, aby ztráta coverage nebyla vydávána za kvalitu modelu.

DEV migrace `20261003T0515_predictive_prospective_observations_v1` je
forward-only a vytváří pouze novou tabulku `predictiveObservation`. Primární
klíč je deterministický observation key pro deduplikaci retry/restart scénářů.
Indexy capability, destination, flight, lifecycle a samostatný `predictedAt`
odpovídají reportovacím a retention-cutoff dotazům. Očekávaný prostor indexů je
malý proti JSON evidence payloadu; každý řádek přidává jeden table write a šest
index entries, tedy přibližně 7 zápisů tabulky/indexů na observation před vlivem
stránek PostgreSQL. Vytvoření nové tabulky a běžných indexů krátce vyžaduje
`ACCESS EXCLUSIVE` lock; protože tabulka je nová a prázdná, neprobíhá rewrite
velké existující tabulky ani backfill. Migraci lze aplikovat online vůči live
radaru, ale před canary patří do běžného DEV maintenance okna. Produkce se v
této fázi nemění.

## Runtime graduation readiness

Aplikace má navíc samostatný admin-only runtime readiness gate. Nenahrazuje
offline validační report výše. Runtime collector čte omezené 30denní okno `PredictiveObservation`,
persistované LANDING terminal evidence a vybrané persistované Flight
Intelligence outcome eventy; nikdy nečte `FlightPosition`. Outcome sémantika
má samostatnou verzi `predictive-outcome-truth-v1`, zatímco thresholdy
zůstávají `predictive-readiness-v1`. Každý outcome type má samostatný limit
2 500 řádků a dosažení kteréhokoli limitu označí collection jako incomplete.
Každá capability dostane `PASS`, `WAIT` nebo `FAIL`.

Chybějící nezávislý ground truth, chybějící instrumentation nebo dosažení
bounded limitu znamená `WAIT`. Konflikt lifecycle identity nebo dostatečně
podložené nesplnění quality thresholdu znamená `FAIL`. Capability nastavená
na `PUBLIC` se veřejně serializuje pouze při aktuálním `PASS`; jinak je
efektivní policy stažena zpět do `SHADOW`. Gate je fail-closed a nikdy
capability automaticky nepovyšuje.

## Rollout

1. Stage 0: obnovit `airradar_dev` z read-only PROD snapshotu, aplikovat
   `20261003T0515_predictive_prospective_observations_v1`, ověřit
   `current_database() = airradar_dev` a spustit DB integrační kontroly se
   switchem OFF. Migrace je nejprve DEV; v PROD zůstává pending až do
   samostatně schváleného produkčního Stage 0.
2. Stage 1: po PASS DEV migrace, DB integrace a runtime safety checks zapnout
   capture pro DEV canary a kontrolovat frontu, chyby a růst databáze.
3. Stage 2: 24h health kontrola a audit izolace lifecycle.
4. Stage 3: první sedmidenní evidence report.
5. Stage 4: třicetidenní kalibrace a audit readiness.

DEV canary používá
`AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true`. Po canary vraťte
hodnotu na `false`, pokud není záměrně ponecháno DEV capture. Při `false` jsou
prospective persistence writes vypnuté, prediktivní engine zůstává v režimu
`SHADOW` a veřejný SSE snapshot se nemění. Aplikace schématu sama neznamená
graduation ani veřejné vystavení feature. Žádná stage nenasazuje, nerestartuje
produkci, během implementace do ní nezapisuje ani nemění graduation policy.
Syntetické observation rows a validační reporty v tomto workflow patří pouze do
DEV/test databází.
