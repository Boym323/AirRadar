# Operational Digital Twin V1

Operational Digital Twin V1 je omezená prospektivní situační vrstva AirRadar.
Spojuje existující živý provoz a publikovaný kontext do jednoho 30minutového
výhledu konkrétního letadla. Nepřidává nový zdroj provozu a nejde o ATC
clearance, certifikovanou FMS trajektorii, separační nástroj ani bezpečnostní
hodnocení.

## Produktový kontrakt

Veřejný endpoint:

`GET /api/aircraft/:hex/situation`

Vrací:

- aktuální pozorovanou identitu letadla a čas observation;
- 30minutový 4D corridor vzorkovaný po dvou minutách;
- route-aware odhad průletu waypointů, pokud je dostupná použitelná geometrie
  Route Intelligence V2;
- budoucí změny publikovaného ATC prostoru;
- časově platné průniky s plánem AUP/UUP;
- časově platné a výškově kompatibilní průniky se SIGMET;
- readiness-gated PUBLIC ETA, runway a trajectory advisories;
- jednu seřazenou situační timeline s provenance a confidence;
- explicitní omezení modelu.

Detail letadla načítá endpoint pouze on-demand. V1 nepřidává další SSE spojení
ani periodický browser polling loop.

## Corridor

Corridor začíná na aktuální živé pozici. Pokud Route Intelligence poskytuje
použitelnou geometrii a letadlo není `OFF_ROUTE`, horizontální projekce
pokračuje po zbývající publikované/interpretované trase. Jinak bezpečně přejde
na kinematickou projekci podle aktuálního tracku a groundspeed.

Omezení projekce:

- horizont 30 minut;
- vzorkování pro timeline/intersection každé 2 minuty;
- pozemní cíle a cíle pod 30 kt se neprojektují;
- vertical rate se extrapoluje nejvýše 10 minut a poté se výška drží; výška je
  omezena na 0–60 000 ft;
- horizontální nejistota roste s časem a je větší u kinematického nebo
  částečného route modelu.

Corridor je situační odhad. Nemodeluje budoucí ATC vectors, speed/level
clearances, nepublikované zatáčky ani detailní výkonnost letadla.

## Situační události

V1 může vytvořit:

- `WAYPOINT`
- `ATC_SECTOR_ENTRY`
- `PLANNED_AIRSPACE`
- `SIGMET_INTERSECTION`
- `ARRIVAL_ETA`
- `RUNWAY_EXPECTATION`
- `TRAJECTORY_STATE`

Všechny budoucí události jsou omezené na 30minutový horizont.

### Provenance

- `OBSERVED` — přímé aktuální pozorování;
- `PUBLISHED` — publikovaná statická route/reference evidence;
- `PLANNED` — pouze plánovaná alokace AUP/UUP;
- `PREDICTED` — budoucí projekce AirRadar nebo readiness-gated veřejná
  predikce;
- `INFERRED` — odvozený kontext, který není sám publikovanou událostí.

AUP/UUP se nikdy nepřejmenovává na potvrzenou real-time aktivaci. Endpoint
záměrně nenačítá delayed historical actual activation data.

## Weather Corridor Intelligence V1

Stejný response obsahuje blok `weatherCorridor`, který aplikuje počasí na
budoucí 4D corridor místo pouze na aktuální pozici letadla.

V1 používá:

- jeden omezený PIREP/AIREP dotaz do 300 NM a šesti hodin;
- stejné severity mapování turbulence/námrazy jako Weather Fusion V1;
- horizontální vzdálenost reportu od budoucího corridor bodu a rozdíl
  projektované výšky;
- časovou, horizontální a vertikální kompatibilitu SIGMET;
- ICON-EU jen pro unikátní tlakové hladiny, které 30minutová projekce potřebuje.

PIREP/AIREP se nikdy automaticky nepřiřazuje sledovanému letadlu. Report je
pouze evidence počasí poblíž projektované budoucí trasy. SIGMET vstup/výstup
je sampled odhad s dvouminutovým rozlišením, nikoli přesný crossing time.

ICON-EU se nevydává za hazard prediction. Weather Corridor ukazuje bounded
vzorky větru podél corridoru a trend podélné složky. Chybějící provider
snižuje stav na PARTIAL/INSUFFICIENT; nikdy nevytváří implicitní „clear“.

## Datové a runtime hranice

Server čte už běžící RAM stav letadla. Neprovádí:

- dotaz na `FlightPosition` ani scan historických letů;
- spuštění nebo změnu readsb/ADS-B polling loopu;
- placený on-demand FlightAware enrichment;
- DB tabulku nebo zápis stavu Digital Twin;
- zpřístupnění predictive admin/SHADOW preview.

ATC/ATS používá existující dataset loader. Procedures se čtou z validovaného
lokálního generated datasetu. AUP/UUP používá nový plan-only cache accessor, aby
se kvůli jednomu letadlu nenačítala delayed historical activation data. SIGMET
používá existující bounded Aviation Weather provider/cache. Weather Corridor
navíc používá existující PIREP cache a sdílený ICON-EU wind snapshot; nevytváří
dotaz pro každý corridor bod. Predikční vstupy
procházejí stejným readiness enforcementem a PUBLIC advisory buildery jako
ostatní veřejné prediction surfaces.

Výpadky providerů jsou fail-soft. Chybějící ATC, AUP/UUP, SIGMET nebo PUBLIC
prediction evidence odstraní jen danou třídu událostí; při použitelném live
stavu může dál fungovat kinematický corridor.

## Další fáze

V1 vytváří doménový základ, ale ještě nepersistuje ani nekalibruje outcome
corridoru.

Přirozené pokračování:

1. outcome truth pro sector/waypoint/weather crossing timing nad rámec corridor-position V1;
2. route-aware propagace času se započtením větru;
3. průniky s Navigation Integrity regions;
4. regionální multi-aircraft situation graph a operational alerts.


## Track Fusion graduation input

Operational Digital Twin může volitelně používat Track Fusion state, ale
integrace je fail-closed a defaultně vypnutá.

`AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED=true` začne být účinné až tehdy,
když process-local Track Fusion readiness vrací `PASS` a konkrétní letadlo má
GOOD observed fused position. Dead-reckoned position je z prvního rollout
vyloučená. Estimated numerická pole se rovněž vrací na canonical live hodnotu.

Situation response označuje vstup pomocí
`aircraft.stateSource = CANONICAL | TRACK_FUSION` a vrací aktuální Track
Fusion readiness. Pokud per-aircraft fusion gate není splněn, endpoint zůstává
local-canonical a tiše se nerozšíří na network-only canonical letadlo.

## Map Corridor Visualization V2

Živý radar nyní vykresluje už načtený situation response vybraného letadla jako
samostatnou MapLibre projekci. V2 nepřidává další situation request, browser
timer, EventSource, serverovou routu, persistence path ani nový predikční pass.

Mapová vizualizace obsahuje:

- projektovaný 30minutový corridor;
- geodetický uncertainty envelope z hodnoty `uncertaintyNm` každého
  trajectory bodu;
- plnou čáru pro route-aware corridor a přerušovanou pro kinematický fallback;
- interpolované markery +5/+10/+15/+20/+30 minut;
- existující Digital Twin situační události v projektovaných souřadnicích;
- Weather Corridor markery turbulence, námrazy a SIGMET entry/exit;
- klikací popup s časovým offsetem, typem evidence, confidence/provenance a
  zdrojem.

Projekce je viditelná pouze pro aktuálně vybrané a viditelné letadlo a pouze
pokud je dostupný jeho existující `/api/aircraft/:hex/situation` response.
Zrušení nebo změna výběru vyčistí GeoJSON source. Source a layers se registrují
na MapLibre `style.load`, stejně jako ostatní radarové overlaye.

Uncertainty polygon je pouze vizualizace nejistoty modelu, nikoli chráněný
prostor, containment, separace ani bezpečnostní hranice. Weather markery
zůstávají evidencí Weather Corridor Intelligence a nejsou pokynem k vyhýbání.

## Outcome Validation V1

Operational Digital Twin má nově omezenou prospektivní kalibrační větev pro
stejný corridor, který už vrací situation surface vybraného letadla. Capture je
request-driven: po úspěšném existujícím výpočtu
`/api/aircraft/:hex/situation` se uloží projektovaná poloha, výška a
uncertainty pro +5, +15 a +30 minut.

Aircraft state service později pending sample vyhodnotí výhradně proti budoucí
LOCAL receiver observation, která už je v RAM. Použije nejbližší lokální
trail/current observation v toleranci ±20 sekund a nikdy ji nenahrazuje NETWORK,
merged-canonical, databázovou ani historickou truth.

Report obsahuje:

- průměrnou horizontální poziční chybu v NM;
- průměrnou deklarovanou uncertainty v NM;
- poměr position error / uncertainty;
- podíl truth observation uvnitř deklarovaného uncertainty envelope;
- průměrnou absolutní chybu výšky, pokud mají obě strany výšku;
- slice pro 5/15/30 minut;
- route-aware versus kinematic slice;
- canonical-input versus Track-Fusion-input slice;
- podíl expirované truth;
- kalibrační stav PASS / WAIT / FAIL.

Evidence je pouze process-local, v RAM, maximálně 24 hodin v pětiminutových
aggregate bucketech. Restart procesu evidence záměrně resetuje. Capture se pro
jedno letadlo deduplikuje po dobu 55 sekund a pending truth má pevný kapacitní
limit.

První threshold set vyžaduje nejméně dvě hodiny process-local evidence, 90
dokončených sample celkem a 20 pro každý horizont, než může stav opustit WAIT.
Po naplnění evidence PASS vyžaduje nejméně 60 % observation uvnitř uncertainty
envelope, průměrnou chybu nejvýše rovnou průměrné deklarované uncertainty a
nejvýše 35 % expirované truth. Jde o kalibrační gate, nikoli bezpečnostní nebo
certifikační tvrzení.

Chráněný report je dostupný na:

`GET /api/admin/operational-twin/outcome`

Stejný omezený report zobrazuje autentizovaným adminům také stránka System.

## Wind-adjusted Timing Shadow V1

Canonical corridor zůstává beze změny. Teprve po vytvoření existujících
ICON-EU along-track wind sample z Weather Corridoru samostatný shadow model
odvodí omezený still-air-speed proxy z observed groundspeed a aktuální
podélné složky větru a přepočítá čas dosažení stejných vzdáleností corridoru.

Shadow reportuje timing delta pro +5/+15/+30 minut a pro waypointy. Pokud
chybí aktuální vítr, dostatek unikátních wind sample nebo použitelný observed
groundspeed, model fail-closed vrátí INSUFFICIENT. Stará weather data mohou
vytvořit výsledek, ale výslovně se označí STALE.

Model nemění geometrii corridoru, canonical event times, PUBLIC ETA, radarovou
pozici, historii ani outcome truth. Jeho účelem je vytvořit nezávislého timing
kandidáta, kterého pozdější Event Outcome Validation porovná s canonical
baseline před případnou graduation.

## Event Outcome Validation V2

Digital Twin nově validuje predikované budoucí události odděleně od V1
kalibrace samotné polohy corridoru. V2 je request-driven a zachytává pouze
události, které už vytvořil existující situation výpočet.

Scoreable event classes:

- `WAYPOINT` — truth je budoucí LOCAL receiver poloha do 3 NM od
  publikovaného/interpretovaného waypointu;
- `ATC_SECTOR_ENTRY` — truth je budoucí LOCAL receiver observation uvnitř
  přesné publikované geometrie sektoru a kompatibilního vertikálního kontextu,
  který zachytil situation request;
- `SIGMET_INTERSECTION` — truth je budoucí LOCAL receiver observation uvnitř
  zachycené SIGMET geometrie, její validity a vertikálních limitů;
- `ARRIVAL_ETA` — truth je nezávislý Flight Intelligence `LANDING` event,
  s kontrolou destination, pokud obě strany znají letiště;
- `RUNWAY_EXPECTATION` — truth vyžaduje nezávislou provider-reported arrival
  runway z terminal evidence landing eventu. Inferred runway geometrie se jako
  náhrada nepoužije.

Každá predikce se vyhodnocuje v omezeném časovém okně podle typu události.
Úspěšná truth měří signed i absolute timing error. Mismatch runway/destination
a kontinuálně sledované spatial/arrival predikce, které v povoleném okně
nenastanou, jsou false positive. Chybějící receiver kontinuita nebo chybějící
provider runway truth zůstává zvlášť jako `expiredNoTruth` /
`unscoreableTruth` a nikdy se nepřeklopí na false positive.

Report obsahuje overall, per-event-type a lead-time slice
(`0_5`, `5_15`, `15_30` minut), precision predikcí, průměrnou chybu
časování, podíl událostí do dvou/pěti minut a dostupnost truth. Evidence je
omezena na 24 process-local hodin v pětiminutových bucketech a pending
predikce mají pevný kapacitní limit.

V2 záměrně **neuvádí recall**. Validator začíná zachycenými predikcemi, takže
nemůže tvrdit, že každá skutečně nastalá událost měla odpovídající predikci.
Pro validní missed-event/recall metriku by byla potřeba pozdější truth-first
větev.

PASS/WAIT/FAIL je fail-closed. První threshold verze vyžaduje nejméně dvě
hodiny evidence, 60 scoreable sample, 30 observed timing sample a alespoň dva
typy událostí s 10 scoreable sample. Po naplnění evidence PASS vyžaduje
precision >=70 %, mean absolute timing error <=240 sekund a missing truth <=40 %.

Chráněný report:

`GET /api/admin/operational-twin/event-outcome`

Validator nepřidává persistence, čtení FlightPosition/history, upstream request,
timer, EventSource, druhý Digital Twin výpočet ani změnu canonical corridoru.

## Navigation Integrity Corridor V1

Digital Twin nově porovnává svůj existující vzorkovaný 30minutový corridor s už vypočtenými aktivními regionálními anomáliemi Navigation Integrity. Průnik vznikne pouze při současné shodě grid cell i altitude bandu. Výsledek zachovává severity, confidence, počet dotčených letadel, LOCAL/NETWORK evidence, baseline maturity a audit categories. Nula průniků neznamená all-clear a funkce nikdy netvrdí GNSS jamming, spoofing ani poruchu navigace konkrétního letadla. Nevzniká nový HTTP request, timer, detector pass, DB přístup ani persistence.

## Wind Timing Graduation V1

Event Outcome Validation V2 nyní obsahuje párovou graduation větev pro waypoint
timing existujícího Wind-adjusted Timing Shadow V1. Stejný zachycený waypoint
ukládá canonical čas i wind-adjusted shadow čas. Když budoucí LOCAL waypoint
truth observation event vyhodnotí, AirRadar porovná oba časy proti přesně téže
truth observation.

Do graduation evidence se přijímá pouze wind shadow se stavem `AVAILABLE`.
`STALE` ani `INSUFFICIENT` timing se nezapočítává. Porovnání je pouze pro
waypointy, protože Wind-adjusted Timing Shadow V1 v této fázi přepočítává
časování waypoint/checkpoint vzdáleností nad nezměněnou geometrií corridoru a
samostatně nepřepočítává sector, SIGMET, runway ani arrival eventy.

Report obsahuje:

- paired waypoint samples;
- unpaired outcomes a truth coverage;
- canonical a shadow mean absolute timing error;
- absolutní a relativní zlepšení MAE;
- shadow wins, canonical wins a ties;
- shadow win rate;
- průměrnou absolutní wind timing korekci;
- počet meaningful adjustment sample;
- graduation stav PASS / WAIT / FAIL.

První threshold set vyžaduje nejméně dvě hodiny process-local evidence, 30
paired waypoint sample, 20 paired sample s alespoň 30sekundovou timing korekcí
a 60% truth coverage. Po naplnění evidence:

- PASS vyžaduje nejméně 5% relativní zlepšení MAE a shadow win rate alespoň 55%;
- FAIL znamená materiální regresi alespoň 5% MAE nebo shadow win rate 45% a méně;
- mezilehlý výsledek zůstává WAIT jako neprůkazný.

PASS **neprovádí automatickou promotion**. Report explicitně vrací
`autoPromotion=false`, `manualPromotionEligible=true` pouze při PASS a ve
všech stavech `canonicalTimingRemainsActive=true`. Canonical corridor/event
timing tedy tato fáze nemění.

Párové porovnání je součástí existujícího chráněného Event Outcome reportu a
zobrazuje se také na autentizované stránce System. Nepřidává timer, polling,
DB persistence, čtení FlightPosition, druhý truth observer ani druhý Digital
Twin výpočet.

## Regional Situation Graph V1

Regionální situační graf je první omezená víceletadlová vrstva Digital Twinu.
`GET /api/operations/situation` čte jediný existující LOCAL snapshot z
`AircraftStateService` a odvozuje nejvýše 80 čerstvých letících cílů a 160
kontextových vazeb. Nevytváří další poller, timer, databázové čtení/zápis,
požadavek na provider ani druhou autoritu živého stavu.

Vazby představují pouze provozní kontext. V1 může spojit letadla se stejnou
rozpoznanou destinací a letadla, jejichž jednoduché kinematické projekce za
5/15/30 minut vstupují do stejného širokého kontextového prostoru. Projekce
používá aktuální track/groundspeed a omezené pokračování pozorované vertikální
rychlosti. Nepracuje s ATC povolením, neodvozuje záměr a nemodeluje minima
rozstupu.

Graf vždy nese omezení `NOT_SEPARATION_PRODUCT` a
`NO_ATC_CLEARANCE_INFERENCE`. Vazba `ELEVATED` pouze znamená těsnější
kontextové prahy; nejde o collision/conflict, TCAS, STCA ani bezpečnostní
výstrahu. Navazující attention vrstva může tyto vazby pouze sumarizovat bez
změny této hranice.

## Operational Attention V1

Operational Attention V1 je deterministická sumarizace nad Regional Situation
Graph V1. Vrací ji stejný požadavek `GET /api/operations/situation` v poli
`attention`; nepřidává druhý live snapshot, poller, perzistenci ani dotaz na
provider.

Omezený seznam zatím zvýrazňuje dva vysvětlitelné vzory: zvýšenou vazbu
projektované společné přítomnosti, která už existuje v regionálním grafu, a
cluster alespoň tří živých letadel se stejnou rozpoznanou destinací. Položky
jsou seřazené a omezené na 12. `WATCH` a `ATTENTION` jsou pouze produktové
priority.

Každá odpověď zachovává `OPERATIONAL_CONTEXT_ONLY`,
`NOT_COLLISION_WARNING` a `NOT_SEPARATION_PRODUCT`. Funkce nepočítá ztrátu
rozstupu, pravděpodobnost srážky, logiku TCAS/STCA ani nevydává navigační nebo
ATC pokyny.

## Truth-first Event Validation V1

Event Outcome V2 začíná predikcí, a proto nemůže korektně měřit recall.
Truth-first V1 přidává opačné účetnictví pro nezávislou terminální pravdu:
každý Flight Intelligence `LANDING` s rozpoznanou destinací je skutečná
událost `ARRIVAL_ETA`; pokud landing obsahuje také nezávisle providerem
reportovanou příletovou dráhu, vzniká i pravda `RUNWAY_EXPECTATION`. Validator
pak ověří, zda během předchozího omezeného 35minutového okna už existovala
sémanticky odpovídající predikce Digital Twinu.

Existující chráněný event-outcome report nyní obsahuje `truthFirst`: počet
skutečných událostí, předem predikovaných a zmeškaných událostí, recall a chybu
časování. Evidence je process-local, omezená na 24 hodin a deduplikovaná podle
landing lifecycle key. První quality gate zůstává WAIT do dvou hodin evidence
a 20 scoreable truth událostí; potom je recall pod 70 % FAIL.

V1 záměrně vrací `WAYPOINT_SECTOR_WEATHER_RECALL_UNAVAILABLE`. Pro tyto třídy
zatím neexistuje nezávislý truth universe, takže predikce nejsou zneužity jako
falešná pravda. Report sám nemění žádnou veřejnou prediction policy.

## Wind Timing Promotion V1

Wind Timing Promotion V1 přidává explicitní ruční přechod, který graduation
gate záměrně neprováděl automaticky. Výchozí hodnota zůstává
`AIRRADAR_DIGITAL_TWIN_WIND_TIMING_POLICY=CANONICAL`. Operátor může nastavit
`WIND_GRADUATED`, ale politika se projeví pouze tehdy, když je Wind Timing
Graduation v `PASS`, ruční promotion je povolená a aktuální wind shadow je
`AVAILABLE`.

Nahrazují se pouze prezentační časy Digital Twin událostí `WAYPOINT`
graduovanými wind-adjusted časy. Geometrie koridoru, PUBLIC ETA, runway
advisories, živý stav a historie zůstávají beze změny. Pokud readiness klesne
na WAIT/FAIL, wind evidence není dostupná nebo aktuální waypointy nelze
spárovat, efektivní politika se okamžitě fail-closed vrátí na `CANONICAL`.

Kalibrace zůstává canonical i při aktivní promotion: Outcome/Event Outcome
validátory zachytí původní canonical situaci dříve, než se ve vracené odpovědi
aplikuje wind timing. Odpověď obsahuje `windTimingPromotion` s nastavenou a
efektivní politikou, graduation rozhodnutím, počtem upravených waypointů a
důvodem fail-closed návratu.

## Calibration Persistence V1

Calibration Persistence V1 zachovává dokončenou kalibrační evidenci Digital
Twinu přes běžné restarty procesu, aniž by ukládala predikce nebo truth data
jednotlivých letadel. PostgreSQL ukládá anonymní pětiminutové agregační buckety
pro corridor-outcome a event-outcome lane, klíčované pouze lane, verzí
validátoru a začátkem bucketu.

Persistovaný payload obsahuje jen čítače a numerické součty potřebné k obnově
stávajících 24hodinových kalibračních oken. Záměrně neobsahuje ICAO, callsign,
registraci, souřadnice, raw truth body, pending predikce ani jednotlivé
deskriptory událostí. Řádky se načtou před prvním live refreshem, zapisují se
s omezeným zpožděním a po 26 hodinách se odstraňují.

Persistence je fail-soft. Pokud PostgreSQL není dostupný nebo hydration odmítne
poškozený či starý bucket, Digital Twin pokračuje s novou process-local
evidencí. Promotion/readiness prahy se nemění; persistence pouze zachovává
evidenci a nezmírňuje graduation gate.

## Regional Operations Center V1

Regional Operations Center V1 zobrazuje existující omezený Regional Situation
Graph a souhrn Operational Attention přímo v živém Operations Center na radaru.
Prohlížeč volá `/api/operations/situation` každých 30 sekund pouze při
otevřeném panelu; server dál čte jediný existující LOCAL snapshot
`AircraftStateService` a nespouští další receiver poller, provider loop ani
novou persistence cestu.

Povrch prioritizuje destination clustery a zvýšenou projektovanou blízkost,
ukazuje dotčená letadla a každé z nich propojuje na stávající focus query
radaru. Záměrně používá kontextové označení `SLEDOVAT` / `POZORNOST`.
Nejde o collision warning ani separation produkt. Snapshot starší než omezené
freshness okno se označí jako zastaralý a výpadek endpointu je fail-soft vůči
zbytku Operations Center.

## Regional Operations Center V1.1

Regional Operations Center V1.1 zachovává existující omezený požadavek regionální situace a přidává uživatelský filtr projekčního horizontu 5/15/30 minut, lokalizovaný detail evidence a graduation stav odvozený z existujícího Regional Attention Graduation reportu. Veřejný situation endpoint zpřístupňuje jen kompaktní readiness projekci; nemění kalibrační policy ani veřejnou semantiku WATCH/ATTENTION.

Mapové zvýraznění je fail-closed. Dvojici co-presence lze zvýraznit pouze tehdy, když Regional Attention Graduation vrací `PASS` a `manualPromotionEligible=true`. Overlay spojuje aktuální LOCAL radarové polohy dvojice pouze jako provozní orientaci; nekreslí chráněný prostor, predikovanou dráhu srážky, hranici ztráty rozstupu, TCAS/STCA alert ani ATC pokyn. Zavření Operations Center nebo ztráta graduation/aktuální polohy overlay vyčistí.

V1.1 nepřidává provider loop, receiver poller, databázovou cestu ani druhou autoritu živého stavu. Destination clustery zůstávají mimo graduation a mapové zvýraznění neodemknou.

## Truth-first Validation V2

Truth-first Validation V2 rozšiřuje měření recall mimo terminální outcome.
Zachovává nezávislou landing/runway truth a přidává tři zdroje později
pozorované truth:

- `WAYPOINT`: pozorovaný přechod Route Intelligence z jednoho next pointu na
  následující,
- `ATC_SECTOR_ENTRY`: debounced událost Flight Intelligence
  `AIRSPACE_ENTRY`,
- `SIGMET_INTERSECTION`: pozdější skutečná poloha letadla vstoupí do platné
  geometrie a vertikálního rozsahu SIGMETu.

Observation krok probíhá před zachycením budoucích událostí aktuálního
požadavku, takže nově vytvořená predikce nemůže sama splnit truth stejného
okamžiku. Párování používá letadlo + typ události + sémantickou identitu a je
omezené na předchozích 35 minut. Waypoint a SIGMET truth jsou request-driven,
protože znovu používají existující kontext Digital Twin požadavku a nepřidávají
žádný poller ani provider loop. Report zůstává process-local a před odchodem ze
stavu `WAIT` vyžaduje dostatek truth událostí i nejméně dvě zastoupené domény.

## Regional Attention Outcome Validation V1

Regional Attention Outcome Validation V1 prospektivně ověřuje položky
`REGIONAL_COPRESENCE` proti pozdějšímu kanonickému LOCAL stavu dvojice
letadel. Capture je request-driven z existující odpovědi
`/api/operations/situation` a nepřidává receiver poller, provider loop ani
veřejný alert.

Skórovat lze pouze skutečně budoucí co-presence položky s alespoň minutovým
lead time. Outcome lane sleduje, zda obě letadla následně vstoupí do stejného
zvýšeného regionálního kontextu (do 10 NM a 4 000 ft), precision,
missing-truth rate, timing MAE, pozorovanou horizontální/vertikální vzdálenost
a řezy 5/15/30 minut. Truth vyžaduje čerstvou LOCAL polohu a použitelnou výšku
obou letadel.

`DESTINATION_CLUSTER` zůstává ve V1 výslovně bez skóre, protože společný
vyřešený cíl sám o sobě není nezávislý budoucí outcome. Okamžitá co-presence s
lead time pod jednu minutu se také vede odděleně, aby nenafukovala prospektivní
kalibraci.

Dokončená kalibrace se ukládá pouze jako anonymní pětiminutové agregáty do
existující tabulky `OperationalTwinCalibrationBucket` pod lane
`REGIONAL_ATTENTION_OUTCOME`. Neuchovává se identita letadla, dvojice,
poloha ani raw pending predikce. Výsledek readiness je pouze `WAIT/PASS/FAIL`
a nemění chování WATCH/ATTENTION.

## Digital Twin Calibration Center V1

Admin stránka `/admin/operational-twin/calibration` sjednocuje existující
kalibrační/readiness lane do jednoho read-only provozního přehledu. Používá
jediný admin-only no-store endpoint
`/api/admin/operational-twin/calibration` a nevytváří druhý kalibrační engine
ani background poller.

Center zobrazuje kvalitu corridor outcome, event outcome precision/timing,
Truth-first V2 recall, důkazy wind timing graduation, kvalitu Regional
Attention outcome a stav restart-stable calibration persistence. U Regional
Attention ukazuje také řezy 5/15/30 minut a výslovně hlásí neskórované
destination clustery.

Stránka je pouze diagnostická. Nemůže měnit graduation policy, veřejnou
prediction policy, semantiku WATCH/ATTENTION, thresholdy ani uložená kalibrační
data.

## Regional Attention Graduation V1

Regional Attention Graduation V1 převádí restart-stable outcome důkazy pro
`REGIONAL_COPRESENCE` na formální readiness report. Gate vyžaduje čtyřhodinové
pozorovací okno, alespoň 80 skórovatelných vzorků, pokrytí všech horizontů
5/15/30 minut, nejméně 70% LOCAL truth coverage, alespoň 75% precision a timing
MAE nejvýše 240 sekund.

Nedostatek důkazů vrací `WAIT`. Kompletní důkazy, které nesplní kvalitativní
thresholdy, vracejí `FAIL`; pouze kompletní data nad všemi thresholdy vrátí
`PASS`. PASS nastaví `manualPromotionEligible=true`, ale V1 má
`autoPromotion=false` a nemění veřejnou semantiku WATCH/ATTENTION.

Scope zůstává pouze regionálním provozním kontextem.
`DESTINATION_CLUSTER`, collision-warning semantika ani separation-product
semantika nejsou pro graduation způsobilé.

## Aircraft Operational Focus V1

Digital Twin vybraného letadla nově obsahuje aditivní souhrn
`operationalFocus`. Jde o deterministické prioritizování evidence, kterou už
vypočítal stejný požadavek `GET /api/aircraft/:hex/situation`; nevzniká nový
dotaz na provider, browser polling, čtení/zápis do databáze, scan historie ani
druhý prediction pass.

V1 může zvýraznit čtyři omezené třídy kontextu:

- počasí s vysokou závažností v corridoru a použitelnou confidence jako
  `ATTENTION`;
- průnik s regionální Navigation Integrity oblastí se stavem DEGRADED/SEVERE a
  použitelnou confidence jako `ATTENTION`, zatímco REDUCED nebo
  low-confidence evidence zůstává `WATCH`;
- průnik s AUP/UUP `PLANNED_AIRSPACE` pouze jako `WATCH`;
- nenormální readiness-gated PUBLIC `TRAJECTORY_STATE` pouze jako `WATCH`.

Běžné waypointy, vstupy do sektorů, ETA a runway události zůstávají v existující
timeline a do Operational Focus se nepovyšují. Vynechává se také opuštění
SIGMETu a weather evidence s nízkou závažností. Položky se řadí podle produktové
priority, potom podle předstihu a confidence a jejich počet je omezen na osm.

`NORMAL` znamená pouze to, že z aktuálně dostupné omezené evidence nevznikla
žádná focus položka. Není to all-clear. AUP/UUP zůstává plánovanou alokací, ne
potvrzenou aktivací, Navigation Integrity zůstává regionální heuristikou s
neznámou příčinou a trajectory state zůstává prediktivním kontextem. Odpověď
proto explicitně nese omezení `OPERATIONAL_CONTEXT_ONLY`,
`NOT_SAFETY_ALERT`, `NO_ATC_CLEARANCE_INFERENCE`,
`SOURCE_SEMANTICS_PRESERVED` a `NO_ALL_CLEAR_INFERENCE`.

Detail letadla tento souhrn zobrazuje před jednotlivými timeline počasí, Navigation Integrity a dalších událostí. UI zachovává backendový level i význam zdrojů, ukazuje omezené počty ATTENTION/WATCH a opakuje omezení no-all-clear / no-safety-alert místo toho, aby si vytvářelo silnější stav pouze na úrovni prezentace.

Každá zobrazená focus položka odkazuje zpět na živý radar s identitou letadla a ID focus položky. Radar znovu používá už načtenou odpověď Operational Digital Twin, zvýrazní pouze projektovaný úsek corridoru do daného offsetu, označí pozici zdrojové evidence, pokud je dostupná, a kameru vycentruje jen jednou. Chybějící nebo zastaralé focus ID fail-closed nevytvoří syntetický mapový cíl ani další provider/API polling cestu.

Živý radar navíc zobrazuje kompaktní callout pro právě aktivní focus položku. Opakuje serverem dodanou úroveň, typ evidence, předstih, confidence a zdroj a umožňuje fokus zrušit při zachování vybraného letadla. Callout vzniká pouze z už načtené situation odpovědi a nepřidává další request, timer, persistence cestu ani silnější bezpečnostní význam.

Drawer vybraného letadla na radaru nyní zobrazuje stejný souhrn Operational Focus nahoře v záložce Situace. Znovu používá už načtenou situation odpověď vybraného letadla, ukazuje omezený level/počty a maximálně čtyři položky s nejvyšší prioritou a umožní kteroukoliv z nich zvýraznit v existující mapové projekci. Před vykreslením drawer ověřuje shodu ICAO se současným letadlem, takže zastaralá data jiného letadla fail-closed nezobrazí. Nevzniká druhý Digital Twin request ani další polling loop.

Interakce Operational Focus je nyní mezi živou mapou a drawerem obousměrná. Kliknutí na aktivní úsek focus corridoru nebo cílový marker znovu otevře záložku Situace pro stejné canonical aircraft/focus URL, i když uživatel po výběru ručně přepnul jinou záložku. Kompaktní drawer vždy zahrne aktivní focus položku mezi své čtyři zobrazené řádky a v případě potřeby jí nahradí čtvrtou prioritní položku. Jde pouze o UI interakci využívající existující GeoJSON properties a už načtenou situation odpověď vybraného letadla.

Drawer navíc nabízí omezenou navigaci předchozí/další přes serverem seřazené WATCH/ATTENTION focus položky. Navigace se na koncích nezacykluje; pokud zatím není žádný fokus aktivní, tlačítko Další vybere první položku. Každý krok znovu používá existující `onFocus(itemId)` URL/map interakci, takže mapa přejde na odpovídající focus segment bez dalšího situation requestu, provider callu nebo lokálního přepočítávání priority.
