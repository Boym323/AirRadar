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
retenci 90 dní; živá aplikace cleanup nespouští. Nyní je dostupný
samostatný údržbový příkaz `npm run predictive:retention` (jen náhled),
resp. `npm run predictive:retention -- --apply` (omezené dávkové mazání).
Volitelný denní systemd timer se musí zvlášť nainstalovat a povolit; CI,
deploy ani startup jej automaticky nespustí. Před zapnutím ověřte zálohy a
retenční požadavky. Readiness je pouze evidence a graduation zůstává SHADOW.

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

Stejný admin report navíc obsahuje
`predictive-graduation-calibration-v1`. Calibration je pouze diagnostická:
převádí readiness na provozní fázi, přesné sample deficity, požadovanou
truth/instrumentaci a quality margin vůči aktivnímu thresholdu. Quality margin
je viditelný i před dosažením dostatečného objemu, ale při readiness WAIT je
výslovně pouze preview a není rozhodovacím FAIL gate.
`manualReviewEligible` vyžaduje kompletní bounded collection a readiness PASS
a nikdy samo nemění capability policy.

## Diagnostika ukládání podkladů V1

Autorizovaná zpráva o připravenosti nyní obsahuje diagnostiku
`predictive-capture-health-v1` určenou pouze ke čtení. Rozlišuje nedostupný
PostgreSQL zdroj, záměrně vypnutý sběr, neúplnou kolekci kvůli limitům,
chybějící platné časy uložení, absenci nových uložených vzorků za 24 hodin a
nově uložené vzorky. Uvádí počet záznamů s platným časem, čas posledního
uložení a počty za 24 hodin odděleně pro ETA, RUNWAY, RUNWAY_CHANGE a
TRAJECTORY. Hodnoty zobrazuje administrační stránka `/system`.

Přehled používá *stejný omezený a cachovaný 30denní dotaz* jako stávající
readiness report. Nepřidává databázové čtení ani zápisy, frontu, poller nebo
veřejné API. Aktuálnost se počítá z uloženého `createdAt`, nikoli z času
předpovídaného příletu či poslední pozice letadla. Neplatné, budoucí nebo
příliš staré časové značky jsou vyřazeny a neúplná kolekce se výslovně
označí. Historické záznamy jsou viditelné i při vypnutém aktuálním sběru.

Nedávno uložený vzorek **není** potvrzeným časem přistání, ověřenou
předpovědí, důkazem správného fungování sběru ani způsobilostí k uvolnění
do provozu. Stejně tak 24 hodin bez vzorků nemusí znamenat závadu, pokud
neproběhly žádné způsobilé lety. Diagnostika nemění `PASS / WAIT / FAIL`,
`manualReviewEligible`, režimy `PUBLIC` / `SHADOW` ani migrační a release
politiku. Produkční databázová migrace a povolení sběru zůstávají
samostatnými rozhodnutími správce.

## Vývoj přesnosti predikcí V1 (etapa A2)

Autorizovaná zpráva o připravenosti nově obsahuje
`predictive-accuracy-trends-v1`. Tato diagnostika pouze pro čtení srovnává
posledních sedm dní s předchozími sedmi dny, jako posuvná časová okna UTC
podle **času vytvoření predikce**. Zahrnuje pouze ETA a odhad konkrétního
směru přistávací dráhy. Změny drah a stav trajektorie mají vlastní nezávislé
vyhodnocování připravenosti.

Za každou kombinaci letu (lifecycle) a predikční schopnosti je do celého
14denního srovnání započítán **nejvýše jeden záznam**: nejstarší uložená
predikce, s deterministickým rozlišením shodných časových značek. Jedno
letadlo může přispět několika různými lety, ale opakované ukládání predikce
téhož letu jeho váhu nezvětší. Zda lze první predikci ověřit, určují stejné
mechanismy nezávislé skutečnosti a `scoreEta` / `scoreRunway` jako v
readiness. Chybějící či nepotvrzený výsledek je `unscorableFlights`, nikoliv
špatně předpovězené ETA nebo dráha. ETA uvádí průměrnou absolutní chybu,
medián a P90 za jednotlivé lety; u drah se vyhodnocuje správný konkrétní
směr. Změna znamená aktuální mínus předchozí období, v sekundách u ETA a
procentních bodech u dráhy. Záporná změna chyby ETA nebo kladná změna
přesnosti drah může být zlepšením, **nikoli** schválením predikcí.

Stavy srovnání jsou `SOURCE_UNAVAILABLE`, `COLLECTION_INCOMPLETE`,
`INSUFFICIENT_TRUTH` a `COMPARABLE`. Rozdíl se zveřejní pouze tehdy,
pokud obě období samostatně obsahují alespoň 20 ověřených letů, databáze
je dostupná a stávající omezený 30denní sběr je kompletní. Tento práh
je určen pouze pro popisné srovnání a nenahrazuje přísnější podmínky
pro veřejné predikce. Lety dosud bez potvrzeného přistání zůstávají
nehodnotitelné.

Výsledek se počítá z již načtené cachované 30denní kolekce administrace.
**Nevzniká** nový SQL dotaz, migrace, operace v příjmové smyčce, zápis,
veřejné API ani notifikace. Srovnání nemění kanonické 30denní důkazy,
`PASS / WAIT / FAIL`, `manualReviewEligible` ani pravidla
`SHADOW / PUBLIC`. Výsledek je pouze v chráněném `/system`.
Trend sám nedokazuje příčinu zlepšení modelu a nesmí vyvolat automatické
povýšení schopnosti do veřejného provozu.

## Přesnost podle horizontu a dokončení etapy (A3–A4)

Chráněná zpráva o připravenosti nyní zahrnuje diagnostiku
`predictive-horizon-quality-v1`, odvozenou od **nezávisle potvrzeného
skutečného času přistání**, nikoliv od odhadovaného ETA modelu.
Vyhodnotitelná pozorování ETA se rozdělují do vzájemně se nepřekrývajících
pásem skutečného zbývajícího času: 0–5, 5–15, 15–30, 30–60 a 60+ minut
(maximálně šest hodin, stejně jako stávající dohledávání nezávislé
skutečnosti). Za jeden let a časové pásmo se započítává jen **nejstarší**
predikce. Model proto nemůže měnit příslušnost do pásma vlastním chybným ETA.
U každého pásma se uvádí počet letů, průměrná absolutní chyba, medián,
P90 a znaménkové zkreslení (+ = predikce pozdě, − = predikce předčasně).

Pásmo má stav `MEASURED` pouze při kompletní omezené kolekci, dostupném
zdroji a alespoň deseti nezávisle ověřených letech. Jinak jsou metriky
kvality prázdné a stav označuje nedostupný zdroj, neúplná data nebo málo
potvrzených výsledků. Samostatný počet udává unikátní lety bez bezpečně
určitelného horizontu. Limit deseti letů je **popisný**, nikoliv podmínka
pro veřejné zpřístupnění nebo důkaz dostatečné kalibrace.

`predictive-evidence-plan-v1` převádí existující výsledky readiness,
graduation calibration a diagnostiky ukládání do doporučeného dalšího kroku
pro ETA / RUNWAY / RUNWAY_CHANGE / TRAJECTORY. Rozlišuje chybějící
PostgreSQL data, neúplné dotazy, konflikty identity, vypnutý nebo neaktivní
sběr, chybějící nezávislé výsledky, nedostatek vzorků a problémy kvality.
`MANUAL_REVIEW` pouze upozorňuje na možnost ruční odborné kontroly
podle stávajících pravidel. Diagnostika nikdy automaticky nemění runtime
policy ani neobchází bezpečné omezení `PUBLIC`.

Všechna měření A1–A4 používají existující omezené cachované dotazy a
admin-only `/api/admin/predictive/readiness`. Nepřidávají běh na pozadí,
operace v příjmové smyčce, tabulky, migrace, veřejná API ani databázové
zápisy. Regresní testy pokrývají hranice horizontů, deduplikaci letů,
nezávislou skutečnost, nedostatek vzorků a prioritu operátorských doporučení.
Produkční screenshotové fixture nyní obsahují úplnou strukturu
administrační zprávy a kontrolují vykreslení všech tří nových přehledů.

**Dokončení vývoje není schválení predikcí.** Implementaci etapy A lze
uzavřít po průchodu CI, prohlížečových bran a nasazení. Skutečné povýšení
modelu zůstává podmíněno dostatkem **reálných** nezávislých výsledků,
readiness PASS a samostatným schválením změny `PUBLIC` správcem.
Povolení prospektivního sběru a případná migrace produkční databáze musí
probíhat samostatnými schválenými kroky níže, nikoliv automaticky při
implementaci této diagnostiky.

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
