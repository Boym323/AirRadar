# AirRadar Route Cache V5 – hledání příčin latence

## Rozsah a bezpečnost

V5.1/V5.2 přidávají pouze **pasivní telemetrii s omezenou velikostí v paměti procesu** a
**ručně spouštěnou read-only SQL diagnostiku**. Nemění se timeout 750 ms,
obnova circuit breakeru, strategie cache, konfigurace produkce, data, schéma
ani migrace. V této etapě na produkční databázi nespouštějte
`EXPLAIN ANALYZE`, syntetické route lookupy ani zátěžové testy.

## Co skutečně měří aplikace

Autorizovaný endpoint `/api/system/status` obsahuje
`routeEnrichment.phases` a `routeEnrichment.sql`.

- `phases.dbCallSettlement`: **celková doba** do dokončení původního DB Promise,
  včetně úspěšných i neúspěšných volání a operací dokončených až po timeoutu
  volajícího. Zahrnuje čekání na spojení, síť a DB; nejde o samotný SQL čas.
  Mohou sem spadat i údržbové dotazy COUNT/prune.
- V5.6 rozlišuje stejné celkové DB volání podle druhu na
  `phases.dbReadSettlement`, `phases.dbWriteSettlement` a
  `phases.dbMaintenanceSettlement` (včetně chyb). Lze tak odlišit čtení,
  zápisy a pomocné COUNT/prune dotazy; souhrnná `dbCallSettlement` zůstává.
  Metriky jsou omezené na proces a neměří čistý SQL čas ani čekání na pool.
- Agregát údržby je navíc rozdělen na `phases.dbMaintenanceCount` a
  `phases.dbMaintenancePrune`. Zachovávají stejný rozsah včetně čekání na
  dokončení a pouze rozlišují volitelný COUNT platných položek od mazání
  prošlých položek; četnost ani chování operací se nemění.
- `phases.dbLateSettlement`: doba **nad rámec** 750ms limitu volajícího
  u DB operací dokončených po timeoutu. Timeout volajícího SQL neruší.
- `phases.callerTimeoutOvershoot`: zpoždění callbacku časovače oproti
  plánovanému limitu 750 ms. Kladná hodnota ukazuje na zpoždění plánování,
  nikoliv automaticky na konkrétní příčinu v CPU nebo PostgreSQL.
- `sql.eventLoopAtTimeout`: omezené vzorky využití Node.js event loop
  během čekání na každý timeoutovaný DB požadavek; jednotkou jsou **procenta**,
  nikoliv milisekundy. Jde o celý proces, ne o exkluzivní CPU daného dotazu.
- `sql.connectionFailures` počítá jen synchronní chyby při vytváření DB klienta;
  asynchronní chyby ovladače, poolu nebo sítě mohou spadat pod `queryFailures`.
  Nulový čítač connectionFailures **nevylučuje** problém poolu ani sítě.
- `sql.timing.serverSideSql` a `sql.timing.connectionAcquisition` zůstávají
  `NOT MEASURED`, dokud nebude k dispozici nezávislé ověřené měření.
- Všechna rozdělení vycházejí nejvýše z 1 024 **posledních vzorků v procesu**,
  nikoliv z percentilů celé doby soak testu. Při restartu se čítače resetují.
  Vždy rozlišujte segmenty PID/commit a složení provozu.

Stávající endpoint `/api/system/runtime-performance` obsahuje zpoždění event
loop a časování výkonnostních hot-paths. U překrývajících se asynchronních
úseků je `cpuMs` označeno `inclusive-process-overlap`: nejde o exkluzivní
CPU čas a součet vnořených úseků by byl chybný.

## Potvrzená oprava konfliktu ve V5.8

Produkční měření ukázalo dokončení údržby a zpoždění timeoutu v okamžiku,
kdy bylo využití celého event loopu 100 %. Samo o sobě nedokazuje, že COUNT
nebo prune byly synchronním blokátorem. Potvrdilo však chybu v plánování cache:
údržba při spuštění ověřila, že popředí je nečinné, ale další čtení mohla
začít ještě během aktivního COUNT/prune. Volitelná údržba tak mohla soupeřit
o zdroje s popředím Route Cache.

Oprava V5.8 přidává procesní bariéru údržby. COUNT/prune zachovávají stejnou
četnost i fail-soft chování, ale během aktivní údržby se popřední čtení a zápisy
obejdou; údržba se zároveň nespustí, pokud už běží popřední operace. Živá cesta
zůstává beze změny a nemění se timeout, velikost poolu ani limity souběhu Route
Cache. Regresní test ověřuje, že čekající údržbový dotaz nemůže běžet současně
s novým popředním čtením.

## Read-only diagnostika PostgreSQL pro správce

Na důvěryhodném hostu s existujícím **minimálně oprávněným read-only**
DB připojením (nikdy nezveřejňujte DATABASE_URL nebo hesla v logu):

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/route-cache-v5-readonly.sql > route-cache-v5-db-report.txt
```

Skript získá seskupené stavy čekání z `pg_stat_activity`, souhrnné
databázové statistiky, aktivitu/velikost tabulky cache, metadata indexů
a plán dotazu přes `EXPLAIN` **bez** `ANALYZE`. Dotaz na cache se neprovede;
skript neprovádí DDL ani migrace.

Poznámky:

- `pg_stat_activity` je okamžitý snímek. Pro rozlišení přechodného a trvalého
  čekání lze získat několik snímků při přirozené zátěži. Nesbírejte text
  `query`, adresy klientů, PID ani parametry.
- `pg_stat_database` a statistiky tabulek mohou pokrývat mnohem delší dobu.
  Porovnávejte rozdíly čítačů a sledujte `stats_reset`. Nejde o metriky
  izolované pouze na Route Cache.
- `blk_read_time`/`blk_write_time` vyžadují databázové `track_io_timing`;
  nula nemusí znamenat nulové I/O.
- Existence indexu a odhad plánu sama o sobě nedokazuje skutečnou latenci.
  Neoznačujte celkový DB-call čas za čas běhu SQL bez dalšího důkazu.

## Vyhodnocení soak testu

1. Ověřte produkční commit, PID a verzi. Rozdělte případné restartové segmenty.
2. Korelujte minutová okna event-loop p99 a CPU se **stejnými časovými okny**
   timeoutů a dokončování DB operací. Nesrovnávejte pouze kumulativní hodnoty.
3. Velké `callerTimeoutOvershoot` společně s vysokým využitím event loop
   znamená důvod zkoumat plánování JS a synchronní hot-paths.
   Malé zpoždění časovače, ale dlouhé dokončení SQL operace směřuje
   diagnostiku na pool, síť a DB.
4. Zkontrolujte stávající atribuci transakcí a autocommit DB operací
   pro identifikaci konkurenční zátěže.
5. Při podezření na čekání v databázi bezpečně nasbírejte snímky
   `pg_stat_activity`. Cílenou optimalizaci a kratší 1–2h měření
   navrhujte až podle konkrétních důkazů.

V5 musí projít Vitest, TypeScript, lintem a produkčními/release kontrolami.
Diagnostiku nenasazujte ani neslučujte pouze kvůli samotnému sběru důkazů.
