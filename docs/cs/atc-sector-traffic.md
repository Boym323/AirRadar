# Kontext provozu ATC sektorů

AirRadar zobrazuje objemy sektorů publikované v českém eAIP společně s
pozorovaným ADS-B provozem z existující vzorkované historie `FlightPosition`.
Traffic level popisuje intenzitu uvnitř publikovaného objemu; není to provozní
ATC stav. AirRadar aktuálně nemá veřejný autoritativní zdroj real-time provozní
konfigurace sektorů Praha ACC.

Traffic API přijímá explicitní UTC hodnotu `at` pro požadavky Time Machine.
Bez ní se používá aktuální evaluation time. Snapshot se klasifikuje v jednom
databázovém okně a poté porovnává s existujícími geometriemi `AtcSector`,
včetně výškových limitů. Neznámá nebo neporovnatelná altitude zůstává
konzervativní díky existujícímu matcheru.

`GET /api/atc/sectors/traffic` vrací kontext všech podporovaných sektorů
Praha ACC. `GET /api/atc/sectors/:id/traffic` vrací jeden kontext.
`GET /api/atc/sectors/transitions?at=...&window=1m|5m|15m` počítá
deduplikované přechody letů. Unknown pozorování nejsou transitions. Krátký
boundary jitter se před počítáním slučuje, ale transitions jsou stále
observational inference ze vzorkované historie.

Map overlay poskytuje volitelný pohled `ATC Sector Traffic` nad sdíleným
sector source. Panel `ATC Vertical Traffic` aktuálně zveřejňuje ověřený stack
SOUTH (`LKAAS`, `LKAANSL`, `LKAATB`) v publikovaném vertikálním pořadí.
NORTH a WEST se záměrně nezobrazují, dokud nejsou jejich vztahy jednoznačné
napříč importovanými AIRAC daty. Panel Sector flows používá jeden transitions
request pro vybrané okno 1, 5 nebo 15 minut; položky představují pohyb mezi
publikovanými objemy, nikoli potvrzené ATC handoffy.

Aircraft quick detail znovu používá existující point/altitude sector match a
již načtený batch traffic context. Používá formulace „Published sector“ a
„Sector traffic“ a nedostupná data hlásí jako `—` místo tvrzení aktuálního
provozního assignmentu. Historické requesty používají stejný map-time timestamp
pro traffic, flows a aircraft context; live requesty obnovují traffic po
12 sekundách a flows po 15 sekundách.

Publikované frekvence zůstávají ve vlastnictví existujícího modelu
`AtcSector`. Pro současná context a transition API není nutná databázová
migrace; aktuální model stačí pro normalizovanou MHz reprezentaci. Channel
designatory a 8,33kHz carrier mapping se nemají odvozovat, dokud je eAIP import
formát explicitně nezveřejní.

Aircraft traffic uvnitř publikovaného sector volume se nesmí vykládat jako
důkaz, že je sektor právě provozován samostatně.

## UI historie provozu

Sekce `Traffic history` se lazy-loaduje z historického API a není pollována
se živou mapou. Rozsahy se centrálně mapují na buckety takto:
`1h` → `1m`, `6h` → `5m`, `24h` → `15m` a `7d` → `1h`.
Historie jednoho sektoru používá jeden sector request; comparison a SOUTH
history používají jeden batch request až pro tři sektory (`TB`, `SL` a `S`).

History window končí v efektivním Global Map Time. V režimu Time Machine se
použije okamžik `at`, nikoli skutečný aktuální čas. Chybějící hodnoty se
vykreslují jako mezery/„No data“; nepřevádějí se na nulu. Summary hodnoty
(peak, average, entries a exits) se berou z backend odpovědi. Grafy popisují
letadla pozorovaná uvnitř publikovaných SOUTH sector volumes a nereprezentují
provozní konfiguraci ATC sektorů. Výsledky závisí na ADS-B pokrytí AirRadaru a
zachovaných datech `FlightPosition`.

## Výkonnostní charakteristiky

`getSectorTrafficHistoryBatch()` provádí jeden read query proti
`public.FlightPosition` pro požadovaný polootevřený interval `[from, to)`.
Aktuální query predikáty jsou `recordedAt >= from` a `recordedAt < to` s
hard capem 200 000 řádků. Čte position fields potřebná aktuálním row modelem
(`flightId`, `recordedAt`, `lat`, `lon`, `altitude`, `groundSpeed`
a `verticalRate`); lightweight database collection boundary aktuálně
nevystavuje select projection.

Řádky se bucketují v paměti, poté každý požadovaný sektor aplikuje existující
point, validity-time a altitude-aware matcher `matchSector()`. Entries a
exits se odvozují z po sobě jdoucích vzorků každého letu uvnitř bucketu.
Dominantní application-side práce je tedy úměrná positions × requested sectors,
s další per-sector transition grouping a sorting. Nepoužívá se žádný spatial
database predicate.

Ověřené indexy `FlightPosition` jsou `@@index([recordedAt])` a
`@@index([flightId, recordedAt])`. Nebyl přidán žádný nový index ani migrace.
Timestamp index podporuje historický range predikát; composite index podporuje
per-flight transition ordering. Neexistují ověřené indexy latitude, longitude,
altitude ani kombinované spatial indexy.

Live-database benchmark a `EXPLAIN ANALYZE` se záměrně nespouštěly v
production-capable checkoutu, protože `DATABASE_URL` je nakonfigurováno a
pravidla repozitáře zakazují neomezenou nebo potenciálně load-producing
produkční diagnostiku bez izolované vývojové databáze. Proto zde nejsou
tvrzeny žádné runtime, row-count, memory, query-plan ani response-size hodnoty.
Reprezentativní benchmark musí před optimalizačním rozhodnutím proběhnout proti
samostatně připravenému development snapshotu.

Nebyla zavedena žádná cache ani preaggregation. Aktuálně není dostatek
izolovaných benchmark důkazů k tvrzení, že je preaggregation nutná nebo že by
cache přinesla významný benefit.

## Historické zpracování a benchmarkování

### Správnost streamingu

Streaming history evaluator je pokryt test-only database adaptérem. Suite
ověřuje nezávislost na chunk boundaries, pořadí shodných timestampů,
transition continuity, vertical classification a úplná coverage metadata.
Produkční chunky zůstávají polootevřené (`[start, end)`) a produkční limity
se nemění.

### Syntetický benchmark

`JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-atc-history-synthetic.ts`
generuje deterministické omezené in-memory pozice a hlásí processing time,
positions/second, heap a RSS. Volitelné číselné argumenty vybírají velikosti,
například `... 100000 500000`. Jde o development-only read-free nástroj.
Synthetic benchmark nezahrnuje PostgreSQL fetch, Prisma overhead ani
network/API serializaci. Nesmí se používat jako tvrzení o produkční response time.

Dokončený lokální běh pokryl 100 000, 500 000 a 1 000 000 syntetických pozic.
Neběžel žádný PostgreSQL ani Prisma I/O. Databázový benchmark byl přeskočen:
nakonfigurované `DATABASE_URL` míří na sdílenou AirRadar databázi a nebyla
dostupná samostatně připravená jednoznačně neprodukční databáze ani vývojový
workflow pro bezpečné ověření.

Streaming cesta drží pouze aktuální DB chunk, bucket accumulators,
per-snapshot aircraft sety a per-flight/per-sector continuity state. Raw
position rows se nepřidávají do request-wide kolekce. Zamýšlený memory model je
tedy `O(chunk + accumulators + per-flight state)`.

Historické zpracování používá sekvenční polootevřené časové chunky s
`limit + 1` sentinelem na chunk. Dense chunky se rekurzivně dělí až na
minimum 1 sekundy; stále příliš hustý minimální chunk explicitně selže s
`ATC_HISTORY_CHUNK_TOO_DENSE`. Guard požadavku s 5 000 000 pozicemi selže s
`ATC_HISTORY_PROCESSING_LIMIT`. Odpověď zveřejňuje `coverage.complete`,
`coverage.truncated`, `coverage.positionsProcessed`, `chunksProcessed` a
`adaptiveSplits`. Chunk boundaries používají `recordedAt >= start` a
`recordedAt < end`, takže boundary rows se neztratí ani neduplikují. Cursor
pagination se záměrně nepoužívá.

Agregace nyní zpracovává každý chunk okamžitě. Drží pouze bucket accumulators,
per-snapshot `Set<flightId>` hodnoty a předchozí sector state potřebný pro
detekci entry/exit; raw `FlightPosition` řádky se po každém chunku uvolní.
DB chunky jsou sekvenční a boundaries analytických bucketů nezávisí na DB
chunk boundaries.

Development-only benchmark helper je `scripts/benchmark-atc-history.ts`.
Spouštějte jej pouze s explicitně ověřeným neprodukčním `DATABASE_URL` a
`ATC_BENCHMARK_NON_PRODUCTION=true` pomocí
`JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-atc-history.ts`. Je read-only,
není součástí build/test/deploy a hlásí actual rows, completeness, timing,
response size a RSS measurements. V tomto production-capable checkoutu nebyl
spuštěn žádný benchmark.
