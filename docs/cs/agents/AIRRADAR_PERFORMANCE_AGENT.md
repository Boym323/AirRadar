# AirRadar — Autonomní výkonové inženýrství

> **Historické rozsáhlé zadání, nikoli povinný kontext nové úlohy.** Používej
> [stručný výkonový postup](PERFORMANCE-WORKFLOW.md), aktuální kód a čerstvá
> měření. Zde uvedené verze, PR a výsledky jsou datované.

> **Startovací instrukce pro Codex / ChatGPT Work:** Přečti tento soubor celý, ověř aktuální stav repozitáře `Boym323/AirRadar` a autonomně proveď výkonnostní audit, reprodukovatelné benchmarky, měřením podložené optimalizace, regresní testy a přípravu PR podle níže uvedených pravidel. Do produkce bez samostatného schválení nezasahuj. Tento český dokument zachovává technické názvy, příkazy, odkazy a strukturu anglického zdroje.

## 1. Role a výsledek

Jednej jako tým specialistů: Principal Software Engineer, Node.js/V8 Performance Engineer, Rust Engineer, Linux SRE, PostgreSQL Engineer, Benchmark/QA Engineer a GitHub CI/CD Engineer.

- **Repozitář:** <https://github.com/Boym323/AirRadar>
- **Produkce:** <https://airradar.pomykal.cz>
- **Produkční adresář:** `/var/www/airradar`
- **Systemd služba:** `airradar.service`

**Hlavní cíl:** Najdi, reprodukuj a odstraň *skutečná* významná výkonnostní úzká místa AirRadaru. Dodávej měřitelná zlepšení, nikoli jen seznam hypotéz, diagnostiku bez závěru nebo neověřené přepisy. Pracuj až k otestovanému GitHub PR, pokud neexistuje objektivní překážka.

Prioritní oblasti:

1. Dlouhé synchronní blokace hlavního Node.js vlákna a event loopu.
2. Lokální snapshot pipeline a navazující Track Fusion, Operational Twin, statistiky, alerty, intelligence a Navigation Integrity.
3. Nárazové dekódování lokálních i síťových BEAST/SBS/MLAT vstupů.
4. CPU, přebytečné průchody daty, alokace, GC a dlouhodobá paměťová retence.
5. Snapshot cache, SSE serializace, delta a backpressure.
6. Route Cache, PostgreSQL, timeouty, souběžnost a skutečná efektivita celé read-through cache.
7. Škálovatelnost při výrazně vyšším počtu letadel a klientů.

## 2. Výchozí znalosti: ověř, nepředpokládej

Nejprve zjisti současnou větev, head `main`, otevřené PR, produkční commit, verzi, konfiguraci a dostupné výsledky z aktuálních GitHub Actions. Dále uvedené údaje jsou **historické**, nikoli automaticky aktuální:

- PR [#963](https://github.com/Boym323/AirRadar/pull/963) opravil řízení T58 canary a ověřování rollbacku; následně byl sloučen do `main` a vydán jako `v1.0.485` (commit `2c564400`). Ověř aktuální produkci nezávisle.
- Globální admin autentizace má zůstat **vypnutá**; uživatel si nepřeje její zapnutí. PR [#964](https://github.com/Boym323/AirRadar/pull/964) byl uzavřen bez merge.
- T58 stall evidence bylo po předchozím zásahu vypnuto. Nezapínej ho automaticky.
- Hodinový read-only soak na starší verzi: 61/61 vzorků za 3601 s, CPU P50/P95 18,0/23,9 %, RSS P50/P95/max 882/920/924 MiB, heap 465/542/545 MiB, vzorkované event-loop P99 P50/P95/max 50,5/60,3/62,9 ms, letadla P50/max 66/75, SSE klientů 0, Route Cache circuit zavřený.
- Historicky byly pozorovány jednotlivé dlouhé blokace až přibližně 6 s; během uvedeného soaku nebyly prokázány jako aktuální opakovaný problém.
- Trend post-GC: heap +73 MiB, RSS +64 MiB, old-space +58 MiB. To samo o sobě nedokazuje memory leak.
- Cgroup throttling telemetry nebyla dostupná. Dosavadní korelace `twin.eventOutcome.local`, `history.persist`, `network.metadata` a GC historickou několikasekundovou blokaci nepotvrdily.

**Důkazy interpretuj přesně:** `max` vzorkovaných hodnot event-loop P99 není nejdelší *jednotlivý* stall; délka asynchronní operace není synchronní CPU čas; kumulativní bypass Route Cache není automaticky SQL chyba. Zelené CI není důkaz produkčního zlepšení.

Relevantní soubory (aktuální umístění ověř):

- `lib/server/aircraft-state.ts`
- `lib/server/adsblol-raw-provider.ts`
- `lib/server/enrichment-cache.ts`
- `lib/server/route-postgres-cache.ts`
- `lib/server/sse-wire.ts`
- BEAST parser/decoder, native Rust bindings, síťové failover/metadata providery, history persistence, Operational Twin, Track Fusion, Navigation Integrity, SSE transport a runtime telemetry.

## 3. Bezpečnost a provozní hranice

**Autonomně povoleno:** read-only produkční diagnostika, analýza kódu, lokální změny na vývojové větvi, izolované benchmarky, lokální testy, neprodukční GitHub Actions, push větve, vytvoření/update PR, CodeQL, opravy CI a dokumentace.

**Bez nového výslovného schválení zakázáno:** deploy, restart produkční služby, úprava produkčního `.env`, systemd, reverse proxy nebo DB dat/schématu; aktivace T58 diagnostiky; produkční profily s nenulovou režijní zátěží; merge do `main`, pokud spouští produkční nasazení; zásahy do bezpečnostního režimu nebo administrátorské autentizace.

- Neměň `AIRRADAR_ADMIN_AUTH_ENABLED` a nepracuj na PR #964 v rámci výkonového úkolu.
- Neobcházej žádné existující bezpečnostní mechanismy, i když admin režim zůstává vypnutý.
- Produkční měření pouze read-only, bez výkonnostně náročného replaye na produkci.
- Nezapisuj do reportů ani artefaktů tajemství, cookies, tokeny, citlivé payloady, individuální pozice nebo identifikátory letadel.
- Zachovej stávající semantiku a správnost dat. Nepřidávej neomezené fronty, nekontrolované paralelní promise ani paměťovou retenci.
- Pro produkční vydání připrav přesný commit, migrace (pokud nějaké), plán dopadů, rollback a akceptační testy. Nasazení teprve po novém schválení.

## 4. Mapa a instrumentace skutečné práce

### 4.1 Zmapuj datové cesty

```text
readsb/BEAST -> parser/decoder -> normalizace -> aircraft state
                                          |-> source affinity / Track Fusion
                                          |-> Operational Twin / inteligence
                                          |-> statistiky / alerts / Navigation Integrity
                                          v
                                    snapshot cache -> SSE delta/encoding -> klienti

ADSBHub/ADSB.lol/MLAT/HTTP fallback -> parser/normalizace -> network state
                                                   -> coverage merge -> snapshot/SSE

Aircraft enrichment -> RAM cache -> PostgreSQL -> externí provider -> route validation
```

Pro každý významný krok určuj synchronní/asynchronní charakter, hlavní thread/worker/Rust, frekvenci, velikost vstupů, složitost, CPU, alokace, fronty, sdílený stav, duplicate work a backpressure. Rozliš podezření od potvrzeného nálezu.

### 4.2 Využij stávající měření

Kód již obsahuje například `measureRuntime()` a scopes `snapshot.apply.total`, `snapshot.local`, `snapshot.operationalTwin`, `snapshot.statistics`, `snapshot.alerts`, `snapshot.intelligence`, `snapshot.predictive`, `snapshot.navigationIntegrity`, dále Route Cache telemetry (`callerTimeoutOvershoot`, `dbLateSettlement` apod.). Před doplněním nové instrumentace ověř její existenci, rozsah a režii.

Doplň pouze slepá místa. Pro synchronní fáze zachycuj count, P50/P95/P99/max, celkový čas, velikost vstupu, počet > definovaný práh. Měření musí být bounded a nízkorežijní. Použij monotónní časy. Vnořené scopes nesčítej jako nezávislý CPU čas. Pro korelaci používej časové intervaly a jasné limity důkazů.

Rozliš mezi event-loop delay, utilization, CPU, GC, cgroup throttling, síťovým/DB čekáním a skutečnou dobou jednoho synchronního callbacku.

## 5. Snapshot pipeline: první prioritní experiment

Proveď izolovaný benchmark `applySnapshotCore()` / reálné cesty snapshotu. Konstruuj deterministické reprezentativní scénáře s **100, 500, 1 000, 2 500 a 5 000 letadly** a frekvencemi odpovídajícími běžné i nárazové zátěži. To jsou syntetické profily, ne tvrzení o současné produkční zátěži.

Scénáře: nové/zmizelé/vracející se letadlo, změna callsign, změna zdroje, source affinity, masový výpadek zdroje, dlouhá trail historie, aktualizace pozic, metadata refresh, snapshot s/bez trailů, lokální a rozšířené pokrytí.

Měř CPU, P50/P95/P99/max *synchronní* doby, event-loop lag, throughput, RSS/heap/GC, alokace a semantickou shodu. Identifikuj duplicitní průchody kolekcemi, zbytečné `Map`/`Set`, řazení, kopírování, práci bez změny stavu a neomezenou historii.

**Konzistence má přednost před prostým `setImmediate()` uvnitř mutace.** Pokud se práce rozděluje, zachovej atomickou publikaci, pořadí událostí, snapshot versioning, izolovaný pracovní stav, bounded frontu a jasnou latest-wins/cancellation politiku. Žádný částečný stav nesmí být vystaven SSE či dalším callbackům. Optimální může být inkrementální výpočet, nikoli asynchronní rozřezání mutace.

## 6. BEAST/SBS ingest: druhý prioritní experiment

Zkoumej lokální i síťové cesty, zvláště synchronní `handleBeast()` / `handleMlat()`. Měř počet bajtů a frames na callback, dekódovací dobu, maximum, chybovost, CPU, alokace a event-loop lag.

Vytvoř deterministický replay 1×/2×/4×/8× a extrémní krátké bursty. Testuj rozdělené/neúplné frames, hranice TCP chunků, SBS řádky, reconnect, ukončení, chyby a zachování pořadí. TCP chunk nemusí odpovídat zprávě; zachovej stav parseru.

Porovnej:

- Algoritmické a alokační optimalizace stávajícího parseru.
- Bounded chunking / `setImmediate()` při zachované semantice a backpressure.
- Worker Threads s měřením nákladů na přenos dat a frontu.
- Rust batch dekódování včetně JS↔Rust boundary a nákladů na alokace.

Implementuj nejlepší doloženou variantu. Všechny platné zprávy, CRC, timestampy, identita, pořadí a parser parity se musí zachovat. Když native addon chybí, proveď reprodukovatelný build v izolovaném prostředí nebo odpovídající CI; neskrývej `skipped` jako `passed`.

## 7. Paměť / GC

Analyzuj kopie snapshotů a trailů, merge síťových tracků, SSE buffers, parser buffers, dlouhodobé Map/Set, cache eviction, external/ArrayBuffer memory, old-space a post-GC trend.

Použij více cyklů při konstantní a proměnlivé zátěži. Rozliš přechodné alokace, expected cache warm-up a retenci. Pro tvrzení *memory leak* vyžaduj stabilně reprodukovatelný post-GC růst a identifikaci zadržujících referencí, nikoli jediný růst RSS. Ověř limity retence, TTL/LRU/FIFO, invariantu stop a možnou změnu veřejné semantiky.

## 8. SSE a backpressure

Zohledni současnou snapshot cache a sdílení již zakódovaných frames (`sse-wire.ts`): nepočítej každý klientský odběr automaticky jako novou serializaci.

Benchmarky pro **1, 10, 50 a 100 klientů**, včetně pomalých klientů, reconnectu, SSE resumption a burstů. Měř publish latency, CPU, serializaci, fronty, retenci, výpadky a lag. Zachovej event IDs, pořadí, protokol a delta shodu. Test bez SSE klientů není důkaz SSE škálovatelnosti.

## 9. Route Cache a PostgreSQL

Odděluj **RAM hit/miss, DB hit/miss, concurrency bypass, circuit backoff, caller timeout, opožděný timeout callback, skutečné dokončení DB operace a externí provider lookup**.

Aktuální návrh používá bezpečný cache key (ICAO + callsign + UTC den), validaci trasy vůči poloze, limit aktivních operací, timeout a circuit breaker. Neoslabuj správnost key/validace kvůli vyšší hit rate.

`Promise.race()` při timeoutu čekajícího nezruší SQL dotaz. Aktivní slot zůstává obsazen do settlementu; tuto invariantní vlastnost zachovej, dokud nepředložíš prokazatelně správné skutečné zrušení. DB-call elapsed zahrnuje pool/network a není automaticky čistý SQL execution time.

Zvaž single-flight, omezení duplicit, správné pořadí admission/maintenance, bounded queue, SQL query/index optimalizace pouze s důkazem. Nezvyšuj slepě konkurenci PostgreSQL; neposuzuj zdraví pouze podle kumulativních bypass čítačů či samotné DB hit rate.

## 10. Autonomní experimentální smyčka

Pro každý významný kandidát:

1. **Baseline:** Identifikuj konkrétní hot path a současné reprezentativní výkonnostní hodnoty.
2. **Hypotéza:** Napiš testovatelnou příčinu s očekávaným mechanismem.
3. **Reprodukce:** Vytvoř deterministický izolovaný scénář nebo dolož, proč reprodukce není dostupná.
4. **Experiment:** Proveď nejmenší bezpečnou změnu, nikoli plošný přepis.
5. **A/B měření:** Nejméně 3 opakování při stejném nastavení, s rozptylem, P95/P99/max a CPU/RSS; podle potřeby více.
6. **Parita:** Ověř funkcionalitu, pořadí, identitu, latency, restart/reconnect/shutdown, edge cases a memory/backpressure.
7. **Rozhodnutí:** Při měřitelném přínosu a bez regresí změnu ponech; při nulovém/negativním přínosu experiment vrať a zdokumentuj.
8. **Pokračování:** Prioritizuj další bottleneck podle evidence, nikoli počtu commitů.

Nekonči u prvního pozitivního benchmarku ani nezaváděj změny samoúčelně. Pokud není potvrzený problém reprodukovatelný, dolož limity a pokračuj dalším měřitelným problémem.

Orientační cíle, **nikoli povinné výsledky**: −30 % dlouhých synchronních blokací, −15 % CPU při stejné zátěži, −20 % event-loop P99, bez ztráty propustnosti či správnosti a bez významné paměťové regrese. Nerozhoduj podle jediné procentní hodnoty nebo mikrobenchmarku mimo realistický workload.

## 11. Testy, GitHub a reporty

Na aktuálním `main` ověř již hotové optimalizace a otevřené PR; neduplikuj je. Používej samostatnou větev a logicky oddělené PR podle nezávislosti změn.

Po změnách proveď relevantní testy: unit/integration/full Vitest, typecheck, ESLint, Rust/native parity, performance regression, produkční build, browser gates podle dopadu, GitHub CI a CodeQL. Při selhání analyzuj logy, oprav příčinu a testy zopakuj. Netlum kontroly a neposouvej limity pouze kvůli zelenému výsledku. Flaky test identifikuj a zdokumentuj.

Doplň zejména regresní testy: snapshot atomicity, input bursts/partial frames, source failover, shutdown/reconnect, queue overflow, stale work cancellation, SSE resumption, timeout race, memory retention.

Zaveď nebo rozšiř **neprodukční** GitHub Actions benchmark s ručním spuštěním, definovanými workloady, A/B porovnáním commitů, historií reportů a automatickou regresní signalizací. Artefakty ukládej sanitizované, např. do `artifacts/performance/` nebo jako CI artefakty. Zaznamenej commit, prostředí, Node/Rust verzi, velikost scénáře, metodiku, opakování, P50/P95/P99/max, CPU/RSS a rozptyl. Vyhýbej se public reportům s citlivými daty.

**GitHub deliverable:** push vývojové větve, hotový PR (nebo více oddělených PR), jasné popisy změn, odkazy na CI, benchmarky před/po, seznam případných rizik a rollback. Nevkládej do `main` bez schválení, pokud merge spouští deploy.

## 12. Produkční ověření až po schválení

Nejprve pouze read-only preflight (verze/commit, health, DB, readsb, Rust, CPU, RSS, event-loop, konfigurace, rollback readiness). Po schválení vydání přes existující standardní release mechanismus a následná nezávislá kontrola nasazeného commitu a zdraví.

Pro srovnatelnou produkční zátěž připrav 15min rychlé, 60min srovnávací a 24h dlouhodobé měření; každé spuštění nebo aktivace diagnostiky podléhá jeho provozním oprávněním. Zaznamenávej *skutečná* maxima event-loop oken a post-GC trend, nejen kvantily vzorkovaných P99. 24h test nevydávej za hotový dříve, než skončí. Pro dlouhé běhy využij trvalou CI infrastrukturu a uložené reporty; při neúplných důkazech uváděj omezení. Pro produkční regresi připrav předem schválený rollback.

## 13. Výstup a definice dokončení

Závěrečná zpráva musí obsahovat:

1. Aktuální identitu produkce a read-only baseline.
2. Tabulku podezření vs. **potvrzených** root causes.
3. Přesně reprodukovatelné benchmarky a workloady.
4. Změny algoritmů / případný Worker nebo Rust přepis s vysvětlením trade-offů.
5. Před/po: snapshot CPU/max duration, ingest throughput/max callback, event-loop P99/max, CPU, RSS/post-GC, SSE latency, Route Cache.
6. Semantickou paritu a regresní testy.
7. Commity, PR, CI, CodeQL a odkazy na sanitizované artefakty.
8. Dopad na produkci (jasně uvedeno, zda bylo něco nasazeno, restartováno či změněno).
9. Zbývající nejistoty/rizika a konkrétní další krok.
10. Verdikt: `PR_READY`, `AWAITING_PRODUCTION_APPROVAL`, `MEASURABLY_IMPROVED`, `BLOCKED` nebo `FAILED`; `PRODUCTION_VERIFIED` jen s reálným produkčním ověřením.

**Práci označ za `PR_READY` až tehdy, když jsou změny skutečně pushnuté, PR existuje, relevantní CI/CodeQL doběhly a benchmark má doložené výsledky.** Nepřeháněj jistotu: optimalizace jednoho bottlenecku není důkaz, že zmizely historické 6s stally.

## 14. Začni nyní

Bez zbytečných mezidotazů proveď:

1. Ověření `main`, produkčního commitu, otevřených PR a dostupných metrik.
2. Výkonovou mapu a využití existujících scopes.
3. Reprodukovatelné snapshot a BEAST/SBS benchmarky.
4. Vyhodnocení nejdražších synchronních operací a jejich časových souvislostí.
5. První měřením podloženou optimalizaci, A/B benchmark a regresní testy.
6. Další významná úzká místa podle výsledků.
7. Push, PR, úplné relevantní CI/CodeQL, opravy problémů a release plán.

Při objektivním blockeru neimprovizuj produkční přístup, ale podrobně dolož, co chybí, a dokonči ostatní povolené kroky. **Cílem je kvalitní doložené zlepšení bez regrese, nikoliv produkční experiment bez kontroly.**

