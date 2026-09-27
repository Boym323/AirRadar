# Analytika pokrytí

## Pokrytí přijímače vůči síťové referenci

Stránka Receiver coverage (`/receiver/coverage`) a
`GET /api/receiver/coverage?period=live|today|7d|30d` používají aktivní
síťový snapshot jako srovnávací referenci. `AVAILABLE` je jedno způsobilé,
čerstvé síťové pozorování letadla s pozicí v nakonfigurovaném comparison
radiusu; `CAPTURED` je stejné normalizované ICAO s čerstvým lokálním
pozorováním ve stejném snapshotu. Poměr je `CAPTURED / AVAILABLE` a není to
účinnost antény, packet reception rate, message loss ani podíl unikátních letadel.

Sampling je omezený (10–30 sekund podle konfigurace) a běží nad sloučeným RAM
stavem, nikdy pro každý SBS řádek. Hodinové řádky obsahují pouze agregované
countery pro overall, 10stupňové azimutové, range, altitude a azimuth×range
buckety. Maximum je 302 řádků za hodinu, přibližně 7 248 řádků/den a 652 320
řádků za 90 dní, pokud je každý bucket obsazen. Provenience providera se
zachovává a mixed-provider období se hlásí. Výpadky sítě i lokálního přijímače
vzorky přeskočí místo vytváření nul nebo falešných missů.

AirRadar coverage intelligence je receiver-observed analytický pohled. Není to
dataset úřadu řízení letového provozu a netvrdí úplný provoz ani RF pokrytí
mimo to, co skutečně pozoroval lokální přijímač.

### Polární mapa pokrytí

Coverage stránka také vykresluje existující agregaci azimut×range jako SVG
polární mapu orientovanou na přijímač. Úhel je receiver bearing po směru
hodinových ručiček od severu (0° sever, 90° východ, 180° jih, 270° západ);
radius je vzdálenost od přijímače omezená nakonfigurovaným comparison radiusem.
Každá prstencová buňka zobrazuje network-reference capture ratio
`CAPTURED / AVAILABLE`. Prázdné buňky znamenají, že nebyla žádná způsobilá
pozorování; buňky pod sdíleným insufficient-data thresholdem jsou označeny
low-confidence a neprezentují se jako spolehlivý poměr. Capture ratio není
absolutní účinnost přijímače ani message reception rate. Pro přesné hodnoty a
accessibility zůstává tabulka.

## Datová cesta V1.4B

`GET /api/statistics/coverage-intelligence?range=7d|30d` je page-scoped čtení.
Nepřihlašuje se k `/api/stream`, nespouští poller, nevolá externího providera
ani nečte `FlightPosition`.

Odpověď kombinuje:

- `ReceiverDailyCoverage` pro 36 pevných 10stupňových azimutových bucketů;
- `ReceiverDailyCoverageAltitude` pro 36 azimutových bucketů × 4 altitude bands;
- `ReceiverDailyStats` pro peak concurrent aircraft, nejvzdálenější příjem,
  součty zpráv přijímače a rekordy nejrychlejšího letadla;
- aktuální in-process agregace přijímače, pokud obsahují živá data;
- omezené řádky `Flight.startTime` pro rozdělení provozu podle lokální hodiny; a
- jeden omezený ranking `Flight.maxAltitude` pro nejvyšší pozorovaný let.

Selhání PostgreSQL degraduje endpoint na unavailable odpověď a neovlivní živý radar.

## Spolehlivost pokrytí

Denní coverage ukládá jednu maximální vzdálenost přijímač–letadlo na
10stupňový azimutový bucket. V1.4B proto počítá robustní range statistiky přes
**denní maxima**, nikoli přes jednotlivé ADS-B vzorky pozic.

Pro každý sektor a vybrané 7denní nebo 30denní období endpoint vrací:

- počet a procento dnů s kladným denním maximem;
- medián denní maximální vzdálenosti;
- nearest-rank P95 a P99 denní maximální vzdálenosti; a
- absolutní maximální denní vzdálenost.

Sektor je označen `reliable` pouze tehdy, když má kladná pozorování alespoň
v polovině vybraných kalendářních dnů: 4 ze 7 nebo 15 z 30. Jde o evidence
threshold, nikoli výpočet uptime přijímače. Sparse sektory zůstávají viditelné,
ale nejsou způsobilé pro hlavní reliable-P95 range.

Aktuální lokální den smí nahradit persistované hodnoty pouze tehdy, když
in-process statistics singleton má skutečná pozorování. Nově vytvořená nebo
prázdná RAM agregace nikdy nesmí vymazat platnou persistovanou agregaci
aktuálního dne.

## Pokrytí podle výškových pásem

Advanced receiver sidecar zapisuje maximální vzdálenost pro každou ze 144
pevných buněk za lokální den: 36 azimutových sektorů × 4 výšková pásma.

Mapování pásem je záměrně stabilní:

- band 0: 0 <= altitude < 5 000 ft;
- band 1: 5 000 <= altitude < 15 000 ft;
- band 2: 15 000 <= altitude < 30 000 ft;
- band 3: altitude >= 30 000 ft.

Letadla bez konečné nezáporné výšky se nezařazují do altitude band. Veřejná
vizualizace používá nearest-rank P95 denní maximální vzdálenosti pro každou
band/sector buňku plus absolutní range maximum. Nikdy tento pohled neodvozuje
skenováním `FlightPosition`.

## Zprávy přijímače

Lokální readsb provider už dostává top-level kumulativní counter
`aircraft.json.messages`. Advanced sidecar konzumuje stejnou hodnotu; nedělá
další HTTP request.

Pro každý den persistuje:

- `receiverMessagesCount`: akumulované denní delty zpráv; a
- `receiverMessagesRawLast`: poslední kumulativní readsb hodnotu použitou jako
  restart-safe baseline.

Běžný nárůst přidá `current - previous`. Pokud kumulativní hodnota klesne,
AirRadar to považuje za reset readsb a přidá novou post-reset hodnotu.
Persistovaná raw baseline umožňuje restartu aplikace AirRadar pokračovat v
počtu stejného dne bez dvojího započítání celé životnosti procesu readsb.

Existující historické řádky zůstávají `NULL`. První den nasazení může být
částečný, protože AirRadar neumí rekonstruovat již uplynulou část dne bez
skenování jiného historického zdroje. Hranice lokální půlnoci je přesná na
běžnou snapshot cadence.

Pokud selže počáteční načtení agregace aktuálního dne, advanced statistics
tento snapshot přeskočí a načtení zopakují při některém dalším snapshotu.
Nepersistují nový částečný counter, dokud nebyla existující baseline aktuálního
dne úspěšně načtena, čímž se zabrání přepsání většího persistovaného počtu při
přechodném startup selhání databáze.

## Rekord nejrychlejšího letadla

Speed record je receiver-observed a pochází pouze z aktuálního lokálního
readsb snapshotu. Kandidát musí:

- mít platnou lokální pozici a vzdálenost/bearing od přijímače;
- být airborne; a
- mít konečnou ground speed od 30 do 800 kt včetně.

Horní limit brání tomu, aby se jedna malformed ADS-B hodnota stala trvalým
rekordem. Speed, ICAO, registration, callsign a timestamp se ukládají jako
jeden koherentní rekord. Neprovádí se žádný historický ground-speed scan ani
backfill.

## Persistence a izolace živé cesty

Advanced receiver agregace je malý sidecar napájený stejným normalizovaným
lokálním readsb snapshotem jako živý radar. Nemá **žádný timer ani poller**.
Databázová práce se frontuje asynchronně, takže
`LocalReadsbProvider.getSnapshot()` nečeká na PostgreSQL.

Zápisy se oportunisticky throttlují na existující 30sekundovou statistics
cadence. `provider.close()` čeká na frontu a požádá o finální flush. Altitude
řádky se zapisují pouze pro buňky, jejichž maximum vzrostlo. Maximální
in-memory altitude stav je 144 řádků pro jeden den.

Nové sloupce jsou nullable a nová altitude tabulka je aditivní. Existující
receiver-statistics zápisy tyto nové sloupce neaktualizují, takže obě
agregační větve nemohou vzájemně mazat své hodnoty.

## Provoz podle hodiny dne

Hour-of-day graf počítá persistované receiver-observed instance `Flight`
podle lokální hodiny `Flight.startTime` v `APP_TIMEZONE`. Query window je
omezené na vybrané lokální kalendářní období a čte nejvýše 20 001 timestampů.

Veřejný výsledek je považován za úplný pouze tehdy, pokud odpovídá nejvýše
20 000 řádků. Je-li přítomen sentinel řádek, hourly bins a ranking
nejvytíženější hodiny fail-close místo prezentování částečného datasetu jako
úplného.

Tato metrika počítá instance Flight, nikoli vzorky pozic, zprávy, oficiální
pohyby, departures ani arrivals.

## Rekordy

V1.4B zveřejňuje range-scoped rekordy přijímače bez scanů `FlightPosition`:

- peak simultaneous aircraft z `ReceiverDailyStats.maxConcurrentAircraft`;
- nejvzdálenější kompletní příjem z existujícího denního distance recordu;
- nejrychlejší realistické lokální letadlo z nové denní agregace; a
- nejvyšší pozorovaný Flight z `Flight.maxAltitude`.

## Migrace a rollback

Schválená změna schématu V1.4B je aditivní:

- nová tabulka `ReceiverDailyCoverageAltitude` s primary key
  `(date, azimuthBucket, altitudeBand)` a cascading foreign key na
  `ReceiverDailyStats(date)`;
- nullable message-counter pole v `ReceiverDailyStats`; a
- nullable pole nejrychlejšího letadla v `ReceiverDailyStats`.

Emitovaný kontrakt Prisma 8 také materializuje relation index pouze podle data
na `ReceiverDailyCoverageAltitude`. Vygenerovaná migrace tento index
zachovává, aby zůstala identická s emitovaným kontraktem, přestože `date` je
už vedoucím sloupcem composite primary key.

Neexistuje historický backfill. Všechny migrační operace jsou aditivní a nová
analytika začíná sbírat data až po spuštění nové verze aplikace.

Rollback aplikace nevyžaduje okamžitý rollback databáze. Starší build AirRadaru
ignoruje nové nullable sloupce a tabulku. Pokud bude někdy žádoucí cleanup
schématu, má být samostatnou pozdější migrací až po ověření stabilního rollbacku
aplikace.
