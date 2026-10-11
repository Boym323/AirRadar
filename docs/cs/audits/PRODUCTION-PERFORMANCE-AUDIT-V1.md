# AirRadar – produkční výkonový audit V1

Auditní větev: `perf/production-performance-audit-v1`  
Výchozí commit: `37103895124a93a92f1fad262acff7093a2b70d2` (`origin/main`)
Produkční verze: v1.0.430 / `9f968359`
Čas pozorování: 11. 10. 2026 20:08 CEST (18:08 UTC)
Databáze: PostgreSQL 17.10, databáze `airradar`, kontrola pouze pro čtení

Tento report uvádí pouze naměřené důkazy. Nedostupné metriky zůstávají
označené jako `NOT MEASURED`; hodnota z jiného okna nebo procesu se nepoužívá
jako srovnání před/po.

## Hlavní výsledek

Byla provedena jedna bezpečná optimalizace: výběr kandidátů pro retention již
netřídí expirované řádky `FlightPosition` podle `id`. Řazení nebylo součástí
kontraktu retention a PostgreSQL kvůli němu prováděl paralelní index scan
následovaný `Gather Merge`, než vrátil omezenou dávku.

Produkční důkazy neodůvodňují globální změnu PostgreSQL, REINDEX, VACUUM FULL,
restart ani zvýšení route-cache timeoutu. Nejsilnější naměřený databázový
hotspot byla údržba retention. Route-cache latence a chyby jsou skutečné,
ale důkazy současně ukazují samostatný problém HTTP/circuit-breakeru externího
routeset provideru a aplikační bounded concurrency/backoff; tyto problémy
nelze připsat pouze PostgreSQL.

## Srovnatelný runtime baseline

Existující uložené minutové probe byly seskupeny podle času záznamu. Proces byl
v aktuálním pozorování spuštěn se stejným obsluhovaným commitem; 24hodinové
okno obsahuje i starší životní cykly procesu, a proto nejde o soak jednoho
procesu.

| Okno | Počet probe | DB P50 | DB P95 | DB P99 | DB max | RSS max | Heap max | Chyby/timeouty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Poslední hodina | 60 | 70 ms | 305 ms | 2 099 ms | 2 099 ms | 1,79 GB | 1,52 GB | DB probe chyby: 0; počet SQL timeoutů: NOT MEASURED ve veřejné probe |
| Posledních 6 hodin | 356 | 53 ms | 333 ms | 1 582 ms | 4 757 ms | 1,96 GB | 1,63 GB | DB probe chyby: 0; počet SQL timeoutů: NOT MEASURED ve veřejné probe |
| Posledních 24 hodin | 1 440 | 16 ms | 321 ms | 1 075 ms | 7 539 ms | 2,04 GB | 1,69 GB | DB probe chyby: 0; počet SQL timeoutů: NOT MEASURED ve veřejné probe |

Aktuální identita procesu byla v1.0.430 / `9f968359`, spuštěná 11. 10. 2026
v 19:36:36 CEST, s přibližně 32 minutami provozu na konci vzorku. Poslední
hodina a posledních 6 hodin obsahují tento i předchozí proces; identita je
v diagnostickém endpointu, ale není součástí každého uloženého minutového vzorku.

### Runtime atribuce

- Aktuální interval CPU: přibližně 80 % jednoho vCPU.
- Aktuální event-loop lag: P50 20 ms, P95 43 ms, P99 1 580 ms.
- Aktuální RSS: přibližně 1,18 GB; použitý heap přibližně 0,80 GB.
- GC countery jsou lokální pro proces; aktuální proces uváděl 7 401 GC událostí
  a 22,2 s kumulované pauzy. Distribuce pauz vhodná pro kauzální srovnání je
  `NOT MEASURED`.
- Aktivní SSE klienti na hranici vzorku: 0. Nestabilita SSE je proto z tohoto
  vzorku `NOT MEASURED`, nikoliv vyvrácená za 24 hodin.
- Samostatné čekání na DB connection, aplikační frontu, lock, síť a externí
  API není veřejnou runtime probe plně atribuovatelné: `NOT MEASURED`, pokud
  není níže uvedeno jinak.

## Důkazy route cache

Process-local route telemetry pokrývala předchozí rolling okno 24 hodin. Přesné
percentilové rozdělení route-cache je uchovávané pouze jako omezený recent
vzorek a nebylo dostupné přes veřejný endpoint; route P50/P95/P99 pro přesná
okna 1h/6h/24h jsou proto `NOT MEASURED`. Hodinové countery jsou použitelné
pro objem a oddělení příčin:

| Okno | RAM hit | DB hit | DB miss | DB chyby | DB bypass | DB zápisy | SQL vzorky | Průměr úspěšného SQL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Poslední hodina (hodinové buckety; ne přesné okno) | 1 004 | 0 | 43 | 111 | 398 | 20 | 183 | 1 143 ms |
| Posledních 6 hodin (hodinové buckety) | 6 375 | 6 | 184 | 556 | 2 493 | 129 | 917 | 994 ms |
| Posledních 24 hodin | 43 985 | 178 | 1 698 | 1 518 | 7 610 | 840 | 3 522 | 473 ms |

Dřívější autentizovaný diagnostický snapshot během stejného procesu uváděl
route-cache SQL P50/P95/P99/max 1 501/3 006/9 221/9 221 ms, 49 PostgreSQL
timeoutů, 59 bypassů concurrency a 143 bypassů backoff. Routeset provider byl
v aktivním blokovaném cooldownu a v tomto snapshotu neměl žádné požadavky.
Přesné autentizované okno není uloženo jako úplná časová řada, proto jde o
důkaz pozorovaného stavu, nikoliv 24hodinový percentile.

Výklad:

- Route cache je většinou obsloužena z RAM; nízký DB hit-rate spolu s miss,
  chybami a bypassy není důkazem chybějícího indexu.
- Route SQL používá primární index `cacheKey`. Read-only `EXPLAIN` ukázal index
  scan s limitem na jeden řádek.
- HTTP/circuit-breaker stav externího routesetu je samostatná doména selhání.
  Není důkazem, že HTTP 403 způsobil PostgreSQL.
- Existující implementace drží SQL timeout započítaný, dokud neskončí skutečný
  promise; regresní test tohoto invariantního chování prošel.

## PostgreSQL kontrola pouze pro čtení

Naměřeno v nakonfigurované databázi `airradar`:

- PostgreSQL 17.10; `pg_stat_statements` je dostupný.
- `max_connections=100`, `shared_buffers=128 MiB`, `work_mem=4 MiB`,
  `track_io_timing=on`, `track_wal_io_timing=off`.
- V okamžiku kontroly bylo vidět 13 databázových backendů. Přesná velikost
  ORM poolu a čekání ve frontě jsou `NOT MEASURED`.
- V `pg_stat_activity` nebyly v okamžiku vzorku vidět lock waity ani deadlocky.
  To nevylučuje krátké nebo přerušované čekání.
- `flightPosition` měl přibližně 5,02M živých řádků, 24,8k mrtvých řádků a
  přibližně 1,4 GiB včetně indexů. Asi 5 124 řádků bylo starších než 30denní
  retention cutoff.
- `navigationIntegrityObservation` měl přibližně 2,97 GiB a
  `aircraftWeatherObservation` přibližně 1,43 GiB. Samotná velikost není
  důkazem regresního hotspotu.
- Kumulativní `xact_rollback` se nepoužívá jako chybovost aplikace; counter
  není ohraničen časovým oknem a neurčuje selhávající operaci.

Nejvýznamnější relevantní položka `pg_stat_statements` byla retention query:

```text
SELECT id FROM "flightPosition"
WHERE "recordedAt" < $1
ORDER BY id ASC LIMIT $2
calls: 3, total: 12 119 ms, mean: 4 039,79 ms, rows: 24 825
```

Její plán používal `recordedAt` index a následně paralelní scan a `Gather
Merge`, aby splnil nepotřebné `ORDER BY id`. Po změně je plán omezený
`Index Scan` přes `flightPosition_recordedAt_idx_fd5b4732` bez sortu. Žádná
produkční SQL mutace nebyla spuštěna.

## ATC dataset cache

Aktuální zdroj zachovává požadované TTL 5 minut, process-local cache,
single-flight načítání, bounded dataset, defensive cloning, invalidaci při
importu a atomický version row. Hit-rate, čas parsování geometrie a RAM řada
za 1h/6h/24h nebyly z veřejného snapshotu dostupné a jsou `NOT MEASURED`.
Version row má lookup přes primary key a v `pg_stat_user_indexes` byl pozorován
95krát. Změna snižující čerstvost dat nebyla provedena.

## Nálezy a změny

| ID | Závažnost | Nález / prokázaná příčina | Změna | Očekávaný přínos | Riziko / ověření |
| --- | --- | --- | --- | --- | --- |
| P-01 | Vysoká | Retention candidate query třídila expirované řádky podle `id`, což vytvořilo `Gather Merge`; 3 volání spotřebovala 12,1 s. | Odstranění řazení bez smluvního významu, bounded výběr a mazání podle ID zůstávají. | Existující `recordedAt` index může skončit po limitu dávky; méně CPU, sort práce a tail latence. | Nízké; pořadí retention není pozorovatelné. Cílený test a post-release `pg_stat_statements`/DB porovnání. |
| P-02 | Vysoká | Pozorována route SQL P99/timeouty; přesné rozdělení DB execution, connection wait a aplikační fronty není úplné. | Bez spekulativního route refactoru; zůstává diagnostika a skutečný in-flight slot. | Prevence nebezpečné změny při zachování měření. | Střední provozní riziko zůstává; potřebné autentizované 1h/6h/24h distribuce. |
| P-03 | Vysoká | Runtime CPU/event-loop a paměť jsou na 1 vCPU/2 GiB zvýšené. | Bez plošného runtime refactoru bez matching atribuce. | Prevence nesouvisející regrese. | Vyžaduje řízený soak s identitou procesu, GC a event-loop důkazy. |
| P-04 | Střední | Routeset provider byl blokován externími HTTP chybami. | Žádná PostgreSQL změna kvůli externímu provideru. | Zabrání smíchání provider problému s DB latencí. | Přístupová politika provideru zůstává externí závislostí. |

## Provedené ověření

- `npm run test:targeted -- tests/history-retention-v2.test.ts tests/route-cache-inflight-timeout.test.ts` — PASS, 2 soubory / 4 testy.
- Read-only PostgreSQL identity, nastavení, activity, statistiky databáze/tabulek/indexů,
  `pg_stat_statements`, `pg_stat_io` a `EXPLAIN` — PASS.
- `git diff --check` — PASS.
- TypeScript — PASS; ESLint — PASS se 14 existujícími warningy; full Vitest —
  PASS (2 770 passed, 11 skipped); Prisma DB verify — PASS; Prisma RC mapping
  preflight — PASS s úmyslně neověřenou kompatibilitou bez katalogu; feature
  registry check — PASS; production core gates — PASS.
- CodeQL a plný PR/browser release workflow běží v GitHub CI; živý produkční
  build ani release nebyl spuštěn.

## Produkční validační plán

Po explicitním schválení a běžném release porovnat stejný obsluhovaný commit a
procesní okna 1h, 6h a 24h:

1. DB minute probes: počet vzorků, P50/P95/P99/max, neúspěšné probe a uptime.
2. Autentizovaná route-cache diagnostika: přesné SQL percentily, timeouty,
   query-error, connection-error, concurrency-bypass a backoff-bypass.
3. Delta `pg_stat_statements` pro retention, route cache, history writes a ATC
   version lookup; uvést `stats_reset` a identitu databáze.
4. Runtime RSS/heap/GC/event-loop a SSE počty klientů, odmítnutí a coalescing.
5. Potvrdit, že live radar a PP Studio zůstávají bez negativního dopadu.

Tento report netvrdí žádný 24hodinový výsledek po změně. Issue #822 má zůstat
otevřené, dokud post-release srovnání neprokáže dlouhodobé zlepšení.
