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

1. outcome truth pro přesnost sector/waypoint/weather crossing času;
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
