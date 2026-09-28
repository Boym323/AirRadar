# Pozorování počasí z letadel V1

## Aircraft Weather UI V1

Radar nyní obsahuje lazy-load panel **Aircraft Weather** ve skupině Weather.
Používá nakonfigurovanou polohu receiveru a nabízí okna 15/30/60 minut,
poloměry 40/80/120/200 km, filtr výšky, profily SAT a větru, live seznam,
společný detail pozorování a reprezentativní mapovou vrstvu latest-per-aircraft.
Na desktopu se panel chová jako mapový overlay, na mobilu jako bottom sheet.
API, profil ani MapLibre source se neinicializují, dokud uživatel panel neotevře.

Profil vykresluje pouze skutečné API bins. `sampleCount` se v UI nazývá
**observations**, nikoli raw measurements; současně se zobrazuje `aircraftCount`.
SAT je hlavní environmentální teplota, TAT je pouze v detailu. Static pressure
není označován jako QNH. Provenance má uživatelské popisky pro readsb a BDS 4,4.
Směr větru je meteorologický směr odkud vítr vane; šipka proudění je otočena
o 180° a konvence je uvedena přímo v panelu.

### Observed vs ICON-EU

Porovnání zůstává korektně unavailable: současná ICON-EU integrace poskytuje
tlakové hladiny a valid times modelu, ale neumí ověřené spárování stejného času,
prostoru a výšky aircraft observation s modelem. UI proto nepoužívá zakázanou
aproximaci surface/flight-level ani libovolně nejbližší hladiny.

AirRadar ukládá řídký, kvalitativně kontrolovaný proud počasí pozorovaného
letadly. Jde o datový produkt AirRadaru, nikoli o oficiální AMDAR feed ani o
tvrzení, že AirRadar oficiální AMDAR data přijímá nebo provozuje.

## Zdroje a provenience

## Integrace V1.1

Poslední přijaté pozorování počasí z letadla je sekundární obohacení v záložce
Situace v draweru letadla na radaru. Načítá se lazy pomocí bounded dotazu
aircraftHex=<hex>&limit=1, při změně vybraného letadla lze požadavek zrušit a
primární detail na něj nečeká. Zobrazují se pouze skutečně vrácená pole.
Pozorovaný vítr je výslovně oddělený od modelového větru ICON-EU; v1.1 je
neporovnáváme.

System status zobrazuje traffic-dependent souhrn Aircraft Weather. NO DATA
znamená, že momentálně nejsou dostupná přijatá pozorování, a nesnižuje stav
AirRadaru. Chyby persistence znamenají DEGRADED. Souhrn obsahuje pouze bounded
runtime čítače, nikoli raw rámce nebo payloady.

npm run audit:aircraft-weather zapisuje
artifacts/aircraft-weather-quality.json. Audit čte nejvýše 20 000 přijatých
uložených řádků z posledních sedmi dnů a uvádí pokrytí zdrojů/letadel,
dostupnost polí, výškové a kvalitativní rozložení, časová okna, BDS čítače a
pravděpodobné mezery. Jde o omezený vzorek, nikoli odhad globální dostupnosti.

Live Radar a Time Machine používají stejný tmavý vektorový podklad OpenFreeMap
a odstín AirRadar. Overlaye Time Machine se inicializují na style.load, takže
historická letadla, stopa, METAR, vítr, radar a AUP/UUP nezávisí na dokončení
vzdálených dlaždic podkladu. Historické přehrávání Aircraft Weather zůstává
mimo rozsah; budoucí vrstva může využít stejnou hranici pro inicializaci
kontextových vrstev bez vazby na live panel.

Každé meteorologické pole má vlastní provenienci. `BDS_4_4` znamená pole
dekódované z jednoznačné pasivní inference Comm-B BDS 4,4 s platným FOM/zdrojem.
Hodnoty z `aircraft.json` zůstávají `READSB_JSON`; nepřejmenovávají se na BDS
4,4. Provenience pozice a výšky zůstává nezávislá.

Statická teplota vzduchu BDS 4,4 je vystavena jako `staticAirTemperatureC` a
průměrný statický tlak jako `staticPressureHpa`. Statický tlak se nikdy
neprezentuje jako QNH. `totalAirTemperatureC` se uchovává odděleně a není
výchozí teplotou profilu. Směr větru je meteorologický směr **od** pravého
severu ve stupních.

Dekodér zachovává FOM/zdroj (`INVALID`, `INS`, `GNSS`, `DME/DME` nebo
`VOR/DME`), nulovatelnost stavových bitů, kategoriální turbulenci (0 žádná,
1 slabá, 2 mírná, 3 silná) a vlhkost v procentech. BDS 4,5 je mimo rozsah V1.

## Příjem, QC a persistence

Pozorování vyžaduje čerstvou pozici, výšku a alespoň jedno meteorologické pole.
Centrální limit párování je 10 sekund a čerstvost jednotlivého pole 20 sekund.
Rozsahové kontroly jsou záměrně široké; odmítají se časové skoky teploty a
nepravděpodobné změny větru. Kvalita je `HIGH`, `GOOD`, `LOW` nebo `REJECTED`;
odmítnuté řádky nejsou běžná weather data.

Weather pipeline používá před PostgreSQL bounded in-memory coalescer pro každé
letadlo. `READSB_JSON` používá 60sekundový bucket, přechody altitude binů po
1 000 ft, významné změny počasí a heartbeat po 120 sekundách; uložený řádek
zůstává skutečným reprezentativním pozorováním, nikoli syntetickým průměrem.
`BDS_4_4` má záměrně méně agresivní politiku: zachovávají se unikátní platné
rámy a potlačují se jen téměř identické opakované rámy v krátkém okně.
Unikátní klíč letadlo/čas/zdroj zůstává druhou DB ochrannou vrstvou.

Accumulator drží pouze poslední pozorování a poslední potvrzený uložený souhrn.
Po 10 minutách neaktivity se záznam odstraní a mapa je omezena na 10 000 letadel.
Normální shutdown provede bounded best-effort flush čekajících reprezentantů;
SIGKILL, OOM nebo pád hostitele mohou záměrně ztratit aktuální coalescing okno.
Úklid počasí probíhá periodicky nad celou tabulkou v retention lane (aktuálně
`HISTORY_RETENTION_DAYS=30`), nikoli při každém pozorování.

## Profily a API

`GET /api/weather/aircraft/observations` podporuje filtry času, radiusu, výšky,
zdroje, limitu a offsetu. `GET /api/weather/aircraft/profile` vrací výškové
biny (výchozí 2 000 ft) s počty vzorků/letadel, čerstvostí, dostupností polí a
heuristickou confidence.

Profily nejprve spočítají medián pro každé letadlo a potom agregují přes letadla,
takže jedno letadlo nemůže ovládnout bin. Teplota používá medián. Vítr se
průměruje jako vektor a převádí zpět na meteorologický směr „od“; 350° a 10°
se proto zprůměrují poblíž 0°, nikoli 180°.

Admin-only endpoint `/api/admin/weather/diagnostics` zveřejňuje bounded countery
pro kandidáty, přijaté/nejednoznačné/odmítnuté BDS 4,4 rámce, zdroje, důvody
persistence, coalescing/exact dedup, počet a evikce accumulatorů, QC, dostupnost
polí, chyby zápisu a poslední důvody anomálií. Nevede se neomezené logování raw
rámců.

## Produkční baseline dostupnosti

První produkční okno po release 28. 9. 2026 ukázalo jako jediný uložený zdroj
`READSB_JSON`: v PostgreSQL bylo v 08:00 UTC 2 749 řádků ze 134 letadel, vítr
byl ve 2 606 řádcích a statická/celková teplota ve 2 740 řádcích. Statický tlak,
vlhkost a turbulence v tomto okně přítomné nebyly. Nebylo přijato ani uloženo
žádné pozorování `BDS_4_4`. Živý dekodér viděl 7 kandidátů BDS 4,4, 1
nejednoznačný Comm-B rámec a 2 860 odmítnutých rámců. Jde o pozorování provozu
přijímače, nikoli o záruku dostupnosti; zdroj zůstává explicitně označený a
může se měnit podle skladby letadel a podmínek příjmu.

## Omezení

Pasivní příjem Comm-B s jistotou neurčuje registr. Weather pipeline preferuje
false negatives před false-positive počasím a zahazuje nejednoznačné inference
BDS. Pokrytí závisí na přijímači a letadlech; profil není gridová analýza ani
modelová předpověď. Porovnání s ICON-EU může později použít společná pole
šířky, délky, výšky, času, větru a teploty, ale automatická analýza biasu modelu
není součástí V1.
