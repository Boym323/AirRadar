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
používá existující bounded Aviation Weather provider/cache. Predikční vstupy
procházejí stejným readiness enforcementem a PUBLIC advisory buildery jako
ostatní veřejné prediction surfaces.

Výpadky providerů jsou fail-soft. Chybějící ATC, AUP/UUP, SIGMET nebo PUBLIC
prediction evidence odstraní jen danou třídu událostí; při použitelném live
stavu může dál fungovat kinematický corridor.

## Další fáze

V1 vytváří doménový základ, ale ještě nepersistuje ani nekalibruje outcome
corridoru.

Přirozené pokračování:

1. vykreslení uncertainty corridoru a intersection markerů na mapě;
2. outcome truth pro přesnost sector/waypoint/weather crossing času;
3. route-aware propagace času se započtením větru;
4. průniky s Navigation Integrity regions;
5. regionální multi-aircraft situation graph a operational alerts.
