
[1m[33mDebian LXC Container[m
[33m OS: [1;92mDebian GNU/Linux - Version: 13[m
[33m Hostname: [1;92mlo-dev-airradar[m
[33m IP Address: [1;92m192.168.1.142[m

# AirRadar — komplexní výkonový audit a řízený program optimalizací

**Projekt:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar)  
**Datum zadání:** 17. října 2026 (Europe/Prague)  
**Oblasti:** CPU, Node.js event loop, RAM/V8/GC, diskové a souborové I/O, PostgreSQL/Prisma, síťový ingest, SSE.  
**Režim:** samostatná analýza a vývoj v izolovaném pracovním prostředí; **produkce je primárně read-only**.  
**Výsledek:** důkazy + reprodukovatelné benchmarky + malé kontrolovatelné PR; **bez automatického merge či deploymentu**.

> **DŮLEŽITÉ PRO AGENTA SPUŠTĚNÉHO NA PRODUKČNÍM SERVERU:** Toto zadání **není povolením upravovat běžící produkční checkout, služby, konfiguraci, data ani schéma DB**. Produkční repozitář (např. `/var/www/airradar`) ber pouze jako zdroj pro inspekci. Kód měň a testuj pouze v odděleném DEV checkoutu/worktree **mimo produkční adresáře**, a to jen pokud jsou skutečně dostupné odpovídající oprávnění a kapacita. Pokud izolované prostředí není, proveď podrobnou read-only analýzu a připrav implementační plán/patch mimo produkční strom. CI a těžké benchmarky upřednostni v GitHub Actions; nikdy je nespouštěj bez rozmyslu na hostiteli se živými službami.

---

## 1. Cíl a definice úspěchu

Najít a bezpečně odstranit **prokazatelnou zbytečnou práci** v AirRadaru, nikoli jen obecně „zrychlit aplikaci“. Nezměnit letecká data, časovou následnost, preferenci zdrojů, životní cyklus letů, historii, retenční pravidla, správnost výpočtů ani soukromí provozních dat.

Optimalizace musí být **měřitelná** a prokazatelná proti stejné zátěži. V každém návrhu uveď:

1. Konkrétní soubor, funkci, aktuální algoritmus a jeho složitost / provozní náklady.
2. Co je **přímo prokázané z kódu**, co vyplývá z **historických dat**, a co je **hypotéza**.
3. Stejný baseline a candidate workload, přesnou verzi Node.js/Rust, commit SHA, konfiguraci a počet letadel/klientů.
4. P50/P95/P99/max relevantních dob, procesní CPU, `heapUsed`, RSS, GC, event-loop a I/O/DB čítače, pokud jsou k dispozici.
5. Výsledek funkčních a regresních testů, včetně bezpečnostních podmínek.
6. Dopad na spolehlivost, paměť, konzistenci, možnost rollbacku a případné kompromisy.
7. Jasné rozhodnutí **KEEP / REWORK / REVERT / BLOCKED**.

Neuváděj procenta zlepšení, pokud nebyla skutečně změřena na porovnatelném workloadu. **Časy async funkcí nejsou exkluzivní CPU; součet vnořených měření není součtem CPU.**

## 2. Bezpečnostní hranice (nepřekročitelné bez nového výslovného souhlasu)

### Na produkci POVOLENO pouze čtení

- Prohlédnout `git status`, `git log`, `git rev-parse`, soubory, dokumentaci, artefakty, zdrojové kódy a existující read-only diagnostiku.
- Přečíst dostupné agregované, autorizované `/api/health`, `/api/version` a diagnostické endpointy za dodržení limitů a práv.
- Porovnat již existující GitHub Actions / T58 výsledky a historické artefakty.
- Provést šetrné **read-only** dotazy do PostgreSQL jen pokud jsou povoleny a nehrozí významná zátěž. Preferovat již existující agregované metriky.

### Na produkci ZAKÁZÁNO

- Měnit soubory v živém checkoutu, jeho `node_modules`, artefakty, `.env*` nebo systémové jednotky.
- Restartovat/reloadovat služby, měnit environment, feature flags, rate limits, firewall, cron, diskové mounty, OS/cgroup konfiguraci či aktivovat opt-in diagnostiku.
- Spouštět `npm ci`, `npm install`, `npm run build`, native kompilaci, CPU benchmarky, heap snapshoty či zátěžové testy v živém checkoutu.
- Měnit schéma PostgreSQL, migrace, indexy, PostgreSQL nastavení, spouštět `VACUUM FULL`, mazat či opravovat produkční řádky nebo archivační soubory.
- Bez souhlasu mazat či přesouvat archivy, včetně historických PNG.
- Slévat PR do `main`, pushovat přímo do `main`, restartovat či nasazovat produkci.
- Nahrávat do GitHub artefaktů raw ADS-B/MLAT/ACARS obsah, souřadnice letadel, ICAO identity, SQL parametry, tokeny, IP adresy, `.env`, cookies, stacky obsahující citlivé údaje nebo produkční dumpy.

**Při konfliktu instrukcí má přednost zachování běžící produkce, integrita historie a databáze.** Nepředstírej dokončení nedostupného měření. Nejsou-li nástroje/opravení dostupná, práci korektně označ jako `BLOCKED` a pokračuj zbývajícími bezpečnými kroky.

## 3. Výchozí kontext (historie; před použitím znovu ověř!)

Dle inspekce GitHub `main` dne 17. 10. 2026:

- Výchozí commit pro předchozí audit: **`7f5ac3c1b06e98a6d00eb9709fb0082c8f36f9ab`** (metadata-only PR #981). **Na začátku práce ověř aktuální SHA** — změny se mohou mezitím posunout.
- Již začleněné PR: [#977](https://github.com/Boym323/AirRadar/pull/977) (BEAST fallback parser buffer), [#979](https://github.com/Boym323/AirRadar/pull/979) (omezení alokací při aircraft map merge), [#980](https://github.com/Boym323/AirRadar/pull/980) (diagnostické měření lokálního/síťového ingestu a síťových callbacků).
- Rust BEAST parser + CRC24 byly dříve aktivovány na produkci; ověř aktuální runtime a nepřepisuj již akcelerovanou cestu naslepo.
- PR #980 je **diagnostika, ne oprava** vícesekundových stallů. Jeho metriky zahrnují `snapshot.local.ingest`, `snapshot.network.ingest`, `ingest.local-beast`, `ingest.network-beast`, `ingest.network-mlat`.
- Produkční audit citovaný v #980: `v1.0.491 / 5fac8481`, event-loop max **4 112,515 ms**, rolling p99 **45,515 ms**, route-cache DB **0 timeoutů / 0 query failures**. Žádná příčina 4 s stallů není prokázána.
- Starší 60min T58 zaznamenal maximum event-loop delay kolem 4,94 s; diagnostika GC / inclusive paths tuto špičku jednoznačně nevysvětlila.
- Historický T55: RSS P50 **1 502,648 MiB**, P95 **1 600,031 MiB**, max **1 635,137 MiB**; heapUsed max cca **1 290 MiB**; počet network trail pointů vzrostl 2 890 → 59 330. **Není to důkaz memory leaku** ani aktuální baseline.
- Dřívější I/O audit: větrný a METAR JSON archiv dohromady cca **92,73 % logických zápisů Node procesu**. Pozdější coalescing přinesl referenční snížení fyzických zápisů **38,607 → 2,371 MB/min**. Nevyvozuj z těchto dvou rozdílných oken další aktuální úspory.
- DB baseline z **30. 9. 2026**: `FlightPosition` ~204 INSERT/min, `Flight` ~205 UPDATE/min, weather ~106 INSERT/min, navigation integrity ~121 INSERT/min, receiver coverage ~108 UPDATE/min; WAL ~4,13 MB/min. Audit tehdy **neidentifikoval jasný plošný P1 SQL bottleneck**.
- Weather Batch Insert V1 byl vypnut: navzdory **−67,4 % SQL statementů** zvýšil writer occupancy. **Nezapínej ho automaticky.**
- FlightPosition sampling default **20 s**, retention běžně 30 dnů; lokální server trail max **600**, network trail default **120**. Nic z toho neměň bez parity / produktového souhlasu.

Reference:

- [T55 runtime](https://github.com/Boym323/AirRadar/blob/main/artifacts/performance/t55/T55-PRODUCTION-RUNTIME-RESULTS.md)
- [T58 stalls](https://github.com/Boym323/AirRadar/blob/main/docs/performance/t58-long-stall-evidence.md)
- [I/O program](https://github.com/Boym323/AirRadar/blob/main/artifacts/io-optimization-program-v1.md)
- [DB baseline](https://github.com/Boym323/AirRadar/blob/main/artifacts/post-archive-db-baseline-v2.md)
- [Weather batch A/B](https://github.com/Boym323/AirRadar/blob/main/artifacts/weather-batch-insert-v1-production.md)
- [T58 phase profiling](https://github.com/Boym323/AirRadar/blob/main/artifacts/performance/t58-history-network-phase-profile-20261016.md)

## 4. Fáze 0 — aktuální inventura a ochrana proti duplicitám

Před změnou jediného řádku:

1. Zjisti aktuální `main` SHA, produkční `/api/version` / `/api/health` a zda produkce odpovídá aktuálnímu `main`. Pokud není dostupné, uveď to.
2. Projdi `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/performance/*`, runtime invariants, příslušné testy, CI workflow a release-scope pravidla.
3. Zjisti stav všech relevantních otevřených/merged PR a Issues, hlavně #977/#979/#980 a následných optimalizací; zamez duplicitám.
4. U každé hot path určete, zda už má fix, cache, limiter, backpressure, single-flight nebo instrumentaci.
5. Zaznamenej nešifrované **identifikátory verzí, nikoli přístupové údaje**, a relevantní omezení hostitele; žádné syrové provozní datasety nepřenášej.
6. Pokud je pracovní checkout živý, **nevytvářej v něm branch ani worktree**, neinstaluj dependencies a nic nepřepisuj. Dev checkout použij pouze skutečně oddělený.
7. Připrav krátkou mapu výpočetních a I/O cest: `readsb/BEAST`, `ADSBHub`, `ADSB.lol`, `MLAT` → normalizace → `AircraftState` → provenance/trails/twin/NI → veřejný snapshot/SSE → historie, weather, route cache a archivy.

**Výstup:** `00-baseline-and-inventory.md` se SHA, konfigurací diagnostiky, tabulkou známých optimalizací, backlogem a limity důkazů.

## 5. Balíček A — disk, archiv PNG a retenční správnost (P0/P1)

### A1. Oprava nedostatečného mazání starých radarových snímků — P0

**Cíl:** `lib/server/map-context.ts`, `WeatherRadarArchiveService.listFrames()`, `cleanup()`.

**Prokázané z kódu při auditu 17. 10. 2026:** `listFrames()` vrací jen snímky novější než `Date.now() - getMapContextMaxAgeMs()`, ale `cleanup()` na nich zkouší mazat snímky starší než stejný cutoff. Staré soubory se do jeho vstupu nedostanou. Součet kapacity rovněž ignoruje soubory mimo dostupné retenční okno.

**Požadované řešení:**

- Oddělit `listAllArchivedFrames()` / surový filesystem inventory od **public time-range** výběru snímků.
- Retenci a diskový limit vyhodnocovat nad **všemi relevantními a validními uloženými PNG**; veřejné API nadále filtruje dle dostupné historie.
- Mazat v bezpečném, předvídatelném pořadí (nejstarší nejprve), s omezením počtu souborů / maximálního času na průchod a řízeným pokračováním.
- Nikdy nemazat soubory neodpovídající přesnému schématu cesty/jména; bezpečně ošetřit `ENOENT`, souběžné dokončení zápisu a symlinky; zabránit přechodu mimo archivní root.
- Respektovat limity retention age i archive max bytes; u diskBytes jasně uvést, zda diagnostika obsahuje i expirované soubory.
- Retence **nesmí smazat** čerstvě stahovaný `.tmp` soubor, nedokončený záznam nebo soubor mimo archiv.
- Produkční staré soubory **nemaž v této práci**, dokud není schválen separátní plán rollout/backup/dry-run inventáře.

**Testy:** `stale > retention`, `mixed fresh/stale`, `disk quota exceeded`, `prázdný strom`, `neplatná jména`, `symlink`, `ENOENT/race`, `úspěšné stažení během cleanup`, konzistence veřejného `listFrames()`.

### A2. Opakované `readdir/stat` v archivu — P1

Cíl: `listFrames()`, `archiveCatalog()`, `resolve()`, `diagnostics()`, `cleanup()`.

- Spočítej počet readdir/stat a CPU/wall time na 100/1 000/10 000 souborech (jen syntetický izolovaný strom).
- Zvaž inkrementální souborový katalog a krátkodobé cache, invalidované po úspěšném zápisu/mazání; s periodickým read-only reconcile, abys nezaváděl stale katalog.
- Nevyužívej jedinou neomezenou globální mapu; uveď její RAM strop a efektivní životnost.
- Celkové čtení adresářů nesmí blokovat event loop (async readdir) ani vytvořit tisíce současných `stat` operací.
- Zachovej časovou správnost `resolveNearestBefore` a chování po restartu / když někdo ručně změní files na disku.

### A3. Zbytečná kopie PNG při čtení — P1/quick win

Cíl: `getFrame()`:

```ts
const bytes = new Uint8Array(await readFile(radarPath(id)));
```

`readFile` vrací Node Buffer, který je již `Uint8Array`. Prověř přímé použití bufferu bez redundantního kopírování, zachovej PNG signature validation a přesný HTTP obsah. Přidej regresní testy a benchmark na různě velkých snímcích (CPU, peak heap/RSS, allocations).

### A4. Starší JSON archivy a runtime telemetry — kontrolní audit

Znovu ověř `JsonArchive.flush`, METAR/wind coalescing, `runtime-telemetry.ts`, atomic rename, flush interval, `dirty` retry a shutdown. **Neopakuj hotové optimalizace**, pokud nová měření neukážou regresi. Omezuj write amplification bez ztráty požadovaných dat.

**Výstup A:** oddělené malé PR nebo jeden úzce vymezený diskový PR; diagnostika dry-run, testy, benchmark souborových syscallů/bytes a plán bezpečného produkčního rollout.

## 6. Balíček B — CPU a RAM v síťovém ingestu (P1)

### B1. ADSBHub SBS merge / ingest

Cíl: `lib/server/adsbhub-provider.ts`, zvl. `handleData()`, `merge()`, `publish()`.

Aktuální `merge()` zpracovává každou přijatou SBS zprávu a podle okolností vytváří kopie Aircraft, provenance a další dočasné struktury. Profiluj alokace na zprávu a CPU při 1k/5k/10k zprávách/s i s realistickým podílem zpráv bez pozice.

- Zvaž oddělení **interního mutable track** od **immutable published snapshot** s verzováním/dirty flagy.
- Nesmí se změnit časová precedence jednotlivých polí, distance/bearing, stale eviction, chyba malformed/invalid ICAO, source provenance, MLAT ani vlastní trail.
- Žádné nebezpečné sdílení mutable `Aircraft` mezi read-only konzumenty / historickými snapshoty.
- Testuj 1B chunking, fragmentované SBS řádky, rychlé aktualizace, out-of-order zprávy, překryv síťových zdrojů a stav po reconnectu.
- `maxTracks` default 20 000: dnešní oldest-eviction průchod přes celou mapu je O(N) při zaplnění. Nejprve zjisti, zda se limit v reálných datech vůbec blíží; při relevantní zátěži zvaž O(1)/O(log N) bounded eviction s parity.

### B2. Síťový snapshot merge

Cíl: `lib/server/network-failover-provider.ts`, `getSnapshot()`, `mergeNetworkObservations()`.

`getSnapshot()` sestavuje nové Map/Array z aktivních lane a slučuje identity. Upevni profil pro aktivní kombinace ADSBHub, ADSB.lol raw, HTTP fallback i vypnuté lane.

- Prověř dirty-generation nebo inkrementální merge, **jen pokud** skutečně snižuje práci oproti kompletnímu průchodu.
- Zachovej sémantiku preferred source, freshness, local/network provenance, overlap, stale/fallback a datum poslední validní pozice.
- Žádné opakování již merged #979 (odstranění union Set v `mergeAircraftMaps`) či #923.
- Změř CPU/update a alokace při 1k/5k/10k identit, 0/10/50% overlap, scénáře outages a reconnect.

### B3. State snapshot a SSE serialization

Cíl: `lib/server/aircraft-state.ts` `buildSnapshotCore`, `lib/server/public-serialization.ts`, `lib/server/sse-wire.ts`, `app/api/stream/route.ts`.

- Prověř náklady `.sort()` podle vzdálenosti, `.map()` plných objektů, kopií trailu a opakované konverze public Aircraft.
- Prokaž, které operace jsou nutné při každé nové generaci a které lze bezpečně memoizovat podle identity/verze.
- **Zachovej stávající** snapshot cache, WeakMap public cache, sdílené delta/fingerprint cache, LRU zakódovaných SSE rámců a `desiredSize` backpressure/coalescing. Nedělej druhou duplicitní cache.
- Benchmark: local/extended, v1/v2, 0/1/5/20 SSE klientů, 100/1 000/5 000 letadel, 2 % a 15 % změněných letadel.
- Důkaz parity: stejné pořadí, stejné změněné/odstraněné ICAO, stejná sekvence a žádný stale delta po backpressure.

### B4. Node event-loop >4 s — nejprve příčina, potom fix

- Analyzuj existující `snapshot.local.ingest`, `snapshot.network.ingest`, `ingest.*`, `snapshot.operationalTwin`, `snapshot.trackFusion` a relevantní T58 okna.
- Koreluj skutečnou max event-loop delay s procesním CPU, event-loop utilization, GC a cgroup throttling, pokud je k dispozici. Při N/A nezaměňuj N/A za nulu.
- Metriky async `history.persist`, `network.metadata`, route resolution **nejsou** měřítkem exkluzivního CPU; nevydávej je za root cause.
- Pokud žádná změřená synchronní cesta nevysvětlí spike, verdikt **ROOT CAUSE NOT PROVEN** a navrhni bezpečný odděleně schvalovaný profiling hostitele. Neaktivuj `AIRRADAR_STALL_EVIDENCE_ENABLED` na produkci bez souhlasu.
- Nepřepisuj jádro do Rustu pouze kvůli neidentifikovanému event-loop stallu.

**Výstup B:** měřením podložené malé PR; benchmark CPU/heap/allocations/GC; parity pro všechny zdroje; bez regresí p95/p99 event-loop a SSE freshness.

## 7. Balíček C — RAM a retence v Node.js (P1/P2)

- Změř zvlášť `heapUsed`, `heapTotal`, post-major-GC used, V8 old space, `external`, `arrayBuffers`, RSS, GC pause a počet živých objektů podle typu (jen v povolené izolované diagnostice).
- Vyhodnoť růst map `localAircraft`, `networkAircraft`, `sourcePreferences`, pending enrichment, Track Fusion/Operational Twin, `lastHistorySample`, Network Trails a SSE cache.
- Respektuj limity trailů: server local **600** bodů a network default **120** bodů + age. `appendBoundedNetworkTrailPoint()` už má WeakSet chronological fast path a zero-allocation návrat při nezměněném stavu — neopakovat.
- Otestuj 1/4/24h synthetic/controlled soak s odpovídající zátěží, odděluj warmup od steady-state a kontroluj retenční stropy.
- Neoznačuj růst RSS samotný jako leak. Heap snapshots/debug inspectory lze pouze v izolovaném DEV nebo po odděleném souhlasu s produkční diagnostikou.
- Pro každou změnu uveď, zda šetří **retained heap**, krátkodobé **allocation churn**, `external` buffery, nebo pouze **serialized payload**.

**Výstup C:** tabulka hlavních retainers podle skutečných důkazů, repro pro případný leak a případně cílený PR s paritou.

## 8. Balíček D — PostgreSQL, Prisma, WAL, transakce (P1/P2)

### D1. History Aircraft / Flight / FlightPosition — profil a redukce round-tripů

Cíl: `lib/server/history.ts`, `recordAircraftSnapshot()`.

- Aktuálně se kandidáti zapisují s limitovanou konkurencí 8; u každého letadla vlastní transakce, v ní lookup Aircraft, aktivního Flight, podmíněný Aircraft UPDATE, standardní Flight UPDATE a FlightPosition INSERT, případně anomaly.
- Nejdříve využij existující opt-in `HISTORY_STATEMENT_PHASE_PROFILE_ENABLED`, **na produkci ho bez souhlasu nezapínej**; lze zkoumat již uložené údaje nebo lokální synthetic profiler.
- Změř čas `aircraft.lookup`, `aircraft.write`, `flight.lookup`, `flight.write`, `position.lookup`, `position.write`, čekání na pool, transaction duration, rollbacky a lock wait.
- Zachovej 20s sampling, first-durable-flight alert, continuity, callsign split, impossible-position suppression, altitude provenance, retry po unique violation a transakční hranici atomických operací.
- Teprve potom zvaž odstranění prokazatelně redundantních SQL dotazů nebo bezpečné dávkování. **Neoptimalizuj Flight UPDATE bez měření**, protože `lastSeenAt` je skutečná událost.
- Když chybí PG server-side timings/`pg_stat_statements`, přiznej chybějící důkaz místo tvrzení o pomalém SQL executor.

### D2. ReceiverCoverageHourly — řádkové SELECT/UPDATE uvnitř transakce

Cíl: `lib/server/receiver-coverage-analytics.ts` `flush()`.

- Prohledej sekvenční lookup/update/create a přepočet providers stringu.
- Na **izolované** testovací DB vyzkoušej parametrizovaný bounded `INSERT ... ON CONFLICT DO UPDATE` s atomickým sčítáním counterů, nebo nejprve dávkový SELECT s lokální aktualizací.
- Zachovej cache commit-after-success, idempotentní retry, ochranu proti dvojímu započtení, časové buckety, `referenceProviders`, rollback a reset/restart.
- Benchmark 10/100/1 000 hodinových bucketů: SQL calls, transakční duration, WAL bytes, HOT %, CPU a DB client wait.

### D3. Navigation Integrity — upsert jednotlivých pozorování

Cíl: `lib/server/navigation-integrity.ts` `persistNavigationIntegrityObservation`, `queueObservation`, `evaluate()`.

- Aktuální bounded pending Map má max 2 048 a drainer pracuje po 64. Posuď reálnou efektivitu single-row `upsert` versus malý bounded batch s konfliktní sémantikou a žádnou změnou identity v2.
- Změř frontu, time-to-durable, odmítnuté záznamy, deduplikaci, počet upsert/update konfliktů, I/O a SQL wait.
- Dávka **nesmí** způsobit ztrátu jedné položky při parciálním selhání, starvation anomálií ani nesprávné count metriky.
- Zvaž incrementální udržování baseline/evaluation pouze po potvrzení profilu; zachovej výsledek detektoru a deterministické pořadí.

### D4. PostgreSQL Route Cache

Cíl: `lib/server/route-postgres-cache.ts`.

- `TIMEOUT_MS=750`, `MAX_ACTIVE=4`, `MAX_ACTIVE_WRITES=2`, circuit breaker a backoff. Timeout Promise.race **neruší SQL**; aktivní operace je už korektně držena až do settlement. Nenahrazuj tento invariant.
- Odděl `callerTimeout`, `lateSettlement`, pool acquisition, skutečný SQL čas (pokud existuje server-side evidence) a maintenance.
- `refreshCount()` má COUNT živých záznamů max 1×/15 min, `prune()` 500 expirovaných ID — prověř indexy/EXPLAIN read-only na testovací DB, nepřidávej je automaticky.
- Neinterpretuj bypass jako query failure; nezvyšuj pool limit či timeout pouze pro kosmeticky nižší chybovost.
- Zachovej API / fallback tras i při úplném výpadku PostgreSQL.

### D5. Retence, indexy, tabulky a WAL

- Mapuj velikosti tabulek a indexů, kumulativní dead tuples, autovacuum, relace `FlightPosition`, `NavigationIntegrityObservation`, weather cache a RXW route history.
- Rozliš partitioning/retention **jako budoucí návrh**, ne provedenou migraci. Partitioning pouze s měřením dopadu na historie, FOREIGN KEYS, query plans a rollback.
- `pg_stat_statements` pouze pokud **už** existuje; nepovoluj extension ani server restart.
- Query plan `EXPLAIN` pouze read-only v DEV; na produkci nespouštěj `ANALYZE` pro složité dotazy bez souhlasu.

**Výstup D:** evidenční tabulka SQL operací a WAL před/po, případné malé PR až po silných důkazech; žádná přímá produkční migrace.

## 9. Rust / C++ / Go — rozhodnutí podle profilu

- Rust už používá BEAST parser/CRC24. Další přepis schválit **jen** pro jasně CPU-bound, samostatný kernel s nízkou cenou FFI/copy.
- Pro porovnání vytvořit identické testovací datasety, parity, opakovatelné wall+CPU+RSS+GC benchmarky a rollback.
- Netvoř nativní addon pro ORM, SQL čekání, běžné mapování Aircraft objektů nebo síťové Promise bez důkazu celkového přínosu.
- Jakákoli změna native packaging musí projít platformními CI a release gates. Nepřekompilovávat Rust addon na produkčním hostiteli v živém checkoutu.

## 10. Měřicí matice

| Profil | Workload | Co zaznamenat |
|---|---|---|
| ADSBHub ingest | 1k/5k/10k SBS zpráv/s; partial/invalid/no-position | CPU/msg, allocations/msg, heap peak, data parity |
| Network merge | 1k/5k/10k identit; 0/10/50 % overlap | P50/P95/P99/max, CPU, bytes allocated |
| Snapshot/SSE | 100/1k/5k aircraft × 0/1/5/20 klientů × V1/V2 | CPU, payload bytes, heap/GC, změnová parita, backpressure |
| Disk archive | 100/1k/10k PNG; 0/10/50 % stale | `readdir/stat`, read/write/unlink count, wall, diskBytes, retention correctness |
| History DB | 10/100/1k vybraných aircraft, realistické states | SQL calls, tx time, pool wait, WAL, semantics |
| Coverage/NI DB | dávky 10/100/1k, konfliktní záznamy | statements, tx latency, retries, parity, WAL |
| Soak | 10/30/60 min podle schválení | CPU P50/P95, RSS/old-space, GC, event-loop P95/P99/max, data freshness, DB/errors |

- Syntetické testy prováděj **mimo produkci**.
- Srovnávej stejný host/runner, Node verzi, backend `rust/ts`, stejná vstupní data, warmup, opakování min. 5, přesný SHA kandidáta.
- U produkce ponech oddělené read-only monitorování běžící zátěže; produkční data nemusí být párovatelná. Nestav na nich nepodložené tvrzení o urychlení.
- Pokud nejsou cgroup/GC/DB metriky dostupné, uveď `N/A` + důvod.

## 11. Testy a quality gates

Použij existující příkazy podle aktuálního `package.json` a CI definic — **nejprve ověř jejich skutečnou dostupnost**. Relevantní příklady z repozitáře:

```bash
npm run typecheck
npm run lint
npx vitest run
npm run features:check
npm run build
npm run test:production
node --test tests/t58-cpu-spikes.test.mjs
```

**Pozor:** Tyto příkazy spouštěj pouze v izolovaném vývojovém/CI prostředí, **nikdy** jako součást read-only produkčního auditu.

Požadované kontrolní okruhy:

- Regresní / differential parity: aircraft data, source provenance, timestamps, flight history, altitude anomaly, network failover, ATC/Twin/Track Fusion.
- Stream protocol parity: SSE v1/v2, sequence, coalescing, backpressure, stale updates.
- Memory bounds, leak/retention, max queue/cache, concurrency/reconnect.
- Database: idempotency, rollback/retry, pooled failures, hard timeouts, uniqueness races, retention semantics.
- Filesystem: valid filenames, symlink/traversal, atomic replacements, concurrent cleanup, write race, zero accidental deletion.
- TypeScript, ESLint, Vitest, build/production gates, CodeQL a všechny požadované GitHub CI workflow.
- Změny v PR až na green exact HEAD SHA. Skipped testy explicitně popsat, nezaměňovat `skipped` za `passed`.

## 12. Pořadí implementace a práce s GitHub

1. **První výstup:** read-only audit a inventura s prioritami a potvrzenými nálezy.
2. Implementuj **A1 + A3** v jednom malém PR (retention correctness + Buffer copy), pokud lze bezpečně pracovat v izolovaném checkoutu. A2 přidej jen při zachování čitelného rozsahu; jinak samostatný PR.
3. Implementuj další balíček v samostatném PR **jen pokud** benchmark skutečně potvrdil odůvodnění a parita je zelená.
4. B, C, D řeš postupně; vyhýbej se souběžným konfliktním zásahům do `aircraft-state.ts`.
5. Každý PR musí mít dokumentaci zjištění, baseline/candidate, testy, rizika, rollback a limity.
6. Ulož bezpečné agregované výsledky do vhodného `artifacts/performance/...` a stručné české shrnutí; neobsahuj raw produkční data.
7. Po vytvoření PR sleduj kompletní CI/CodeQL; pokud selže, oprav příčinu a opakuj validaci, ale neprováděj merge do `main` ani deploy.
8. **Bez samostatného výslovného povolení** žádné nasazení, restart, aktivace diagnostiky, mazání produkčních archivů či migrace.

## 13. Akceptační kritéria

### Funkční a bezpečnostní

- [ ] Nová archivní retence skutečně identifikuje expirované PNG, jejich fyzickou velikost a bezpečně řeší věkové i diskové limity.
- [ ] Žádná změna API, historických bodů, pořadí zpráv, dopravních zdrojů, ATC, nav-integrity klasifikace, alerts ani SSE kontraktu.
- [ ] Přesné regresní testy chybových, out-of-order, reentrant a race podmínek.
- [ ] Žádné neautorizované úpravy hostitele, DB, běžící produkce, konfigurace či live dat.
- [ ] Production checkout a jeho SHA/dirty state zůstaly nedotčené.

### Výkonové

- [ ] Každá optimalizace obsahuje stejné workloady baseline/candidate a ověřitelné artefakty.
- [ ] Žádný potvrzený významný propad P95/P99, datové freshness ani nárůst RSS/GC/SQL wait oproti baseline při srovnatelném provozu.
- [ ] Pokud benchmark neprokáže čistý přínos, implementaci neprosazovat a označit `REWORK` nebo `REVERT`.
- [ ] Tvrzení o odstranění >4s stallů pouze tehdy, když se objeví měřená příčina a efekt opravy.

### CI a dodání

- [ ] Green všechny požadované checks a CodeQL na přesném SHA PR, chybějící/skipped jobs explicitně popsány.
- [ ] Malé oddělené PR s dokumentovaným rollbackem a doporučeným pořadím integrace.
- [ ] Zpráva jasně uvede, co bylo implementováno, co jen analyzováno, co měřeno a co zůstává BLOCKED.
- [ ] Bez automatického merge/deploy, i kdyby vše prošlo.

## 14. Finální výstup agenta — požadovaná struktura

Předej výsledky **v češtině**:

1. **Verdikt a bezpečnostní stav:** PASS / PARTIAL / BLOCKED; produkce změněna ANO/NE.
2. **Provenience:** čas, aktuální `main` SHA, případné produkční SHA, branch/worktree, Node/Rust backend.
3. **Potvrzené problémy:** priorita; `soubor:řádek`; důkaz v kódu; reálné měření nebo jeho absence.
4. **Dokončené změny:** jednoznačné commit/PR odkazy, rozsah, testy, rollback.
5. **Výkonová tabulka:** stejné workloady baseline/candidate, procenta jen u platného porovnání; CPU/RAM/IO/DB; negativní výsledky neskrývat.
6. **Nezpracované kandidáty:** důvod, blokátor, potřebný profil, odhad implementačního rizika (bez spekulativních procent).
7. **CI/CodeQL:** výsledky každého požadovaného gate na přesném SHA.
8. **Rozhodnutí:** KEEP / REWORK / REVERT / BLOCKED pro každý balíček.
9. **Doporučený následující krok**, včetně konkrétních ručních produkčních zásahů, pokud by byly později schváleny.
10. **Výslovné potvrzení:** žádný neautorizovaný restart, deploy, úprava produkčních souborů, DB nebo mazání archivu; žádné zveřejnění citlivých dat.

---

## 15. Krátké pořadí priorit

| Priorita | Úkol | Soubor |
|---|---|---|
| P0 | Opravit rozpor `listFrames()` × `cleanup()` | `lib/server/map-context.ts` |
| P1 | Odstranit redundantní Buffer → Uint8Array kopii | `lib/server/map-context.ts` |
| P1 | Snížit opakované procházení PNG archivu | `lib/server/map-context.ts` |
| P1 | Profilovat/optimalizovat alokace SBS ingestu | `lib/server/adsbhub-provider.ts` |
| P1 | Profilovat network Map merge | `lib/server/network-failover-provider.ts` |
| P1 | Optimalizovat výstavbu state/public snapshotů dle parity | `lib/server/aircraft-state.ts` |
| P1 | Dovyšetřit 4s event-loop stall podle #980 | `lib/server/runtime-*`, `aircraft-state.ts` |
| P1 | Určit náklady jednotlivých SQL statementů historie | `lib/server/history.ts` |
| P2 | DB bulk merge pro hourly coverage, pouze po DB benchmarku | `lib/server/receiver-coverage-analytics.ts` |
| P2 | Ověřit ekonomiku batch persistence Navigation Integrity | `lib/server/navigation-integrity.ts` |
| P2 | Prověřit retenci V8/trajectories / post-GC | `lib/server/aircraft-state.ts`, `lib/aircraft/trail.ts` |
| P3 | Ověřit dopad oldest-track eviction při maxTracks | `lib/server/adsbhub-provider.ts` |

**Zásada:** Raději žádný PR než PR s neprokázaným přínosem, sníženou správností nebo ohrožením produkce. Začni opravou skutečné archivní retenční chyby; ostatní oblasti posuzuj podle měření.

