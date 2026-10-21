# AirRadar V2 — jednotlivá zadání pro postupný přepis a zásadní optimalizaci

**Datum:** 21. října 2026  
**Repo:** https://github.com/Boym323/AirRadar  
**Charakter:** série samostatně spustitelných zadání pro Codex / vývojového agenta, nikoliv příkaz k okamžitému produkčnímu nasazení  
**Aktuální předpoklad:** remediation patch na \`audit/production-remediation-2026-10-21\` (\`7052147e\`) nebyl nasazen na produkci. Před každým úkolem zjisti aktuální stav.

## Jak spouštět

Každý níže očíslovaný úkol je samostatná pracovní jednotka. Agentovi zadej:

> Proveď **AirRadar V2-\`XX\`** podle tohoto dokumentu:  
> https://github.com/Boym323/AirRadar/blob/main/docs/audits/AIRRADAR-V2-REWRITE-OPTIMIZATION-TASKS-2026-10-21.md  
> Přečti \`AGENTS.md\`, ověř aktuální HEAD a skutečné implementace. Pracuj v izolovaném nevysílajícím checkoutu, dokonči implementaci, regresní testy, měření a dokumentaci pro dané zadání. Nedělej jiný úkol ani produkční deploy, pokud to zadání výslovně nepovoluje. Reportuj změny, testy, dopady a blokéry.

### Globální pravidla všech úkolů

- **Nedělej big-bang rewrite, neměň celý projekt najednou.** Starý a nový modul mohou přechodně koexistovat, ale nesmějí oba aktivně spouštět nezávislý live polling, persistenci nebo duplicity událostí.
- Zachovej chování všech **79 KEEP** podle aktuální matice a nesnaž se obnovovat 99 REMOVE. U kandidáta na odstranění prokaž nepotřebnost a vliv na veřejná rozhraní.
- Zachovej ICAO identitu, \`readsb → RAM → SSE\`, single-owner \`AircraftStateService\`, lokální versus rozšířený traffic, Rust/BEAST a fallback, historickou PostgreSQL persistenci, OGN privacy, ATC pravidla a safe public DTO.
- Neprováděj destruktivní migrace, resety databáze, mazání historie, úpravy reverzní proxy, tajemství či libovolné restarty produkčních služeb. Případný upgrade knihoven nebo schématu je samostatné schválené zadání.
- \`AGENTS.md\`, \`docs/RUNTIME-INVARIANTS.md\`, \`docs/RELEASE.md\`, \`docs/DEVELOPMENT.md\`, \`docs/features.registry.json\` jsou normativní. Veřejná sanitizovaná read-only diagnostika zůstává dostupná anonymně; administrační mutace a privátní data jsou zabezpečeny.
- Pracuj ve **vývojovém checkoutu**, testuj na fixture/DEV databázi, nepouštěj \`npm run build\` na aktivním produkčním checkoutu. Udržuj malé a přezkoumatelné commity. Při změnách \`main\` respektuj současnou politiku automatického deploye a výsledky CI na přesném SHA; žádný force push, žádné \`[skip ci]\` u kódu.
- Každý task musí dodat **before/after** srovnání při stejném testovacím vstupu, charakteristiky CPU/RSS/event-loop P95/P99, velikost dat/SSE dle relevance, jednotkové a integrační testy a dokumentaci. Neměřitelné položky označ \`NOT VERIFIED\`. Výkonový cíl je výrazné zlepšení tam, kde baseline prokáže bottleneck; nulová regresní tolerance u kritických smluv.
- Žádný nový runtime provider call, SQL query nebo složitý výpočet nesmí bez důkazu potřebnosti vstoupit do kritického ADS-B ingest path. Žádné záměrné vypínání testů/limitů, aby prošlo CI.
- Před integrací vždy zkontroluj dopad na ostatní úkoly, aktualizuj příslušné testy, anglickou a existující českou technickou dokumentaci; změny rout promítni do feature registru a regenerovaných docs.
- Každý úkol skončí stavem **DONE / PARTIAL / BLOCKED**, seznamem souborů, konkrétním přínosem, výsledky testů a riziky. Nepovažuj úspěšný build za důkaz provozní ekvivalence.
- Produkční nasazení je **samostatná etapa V2-15** po splnění gate. Úkoly V2-01 až V2-14 nemají automaticky autorizovat push do \`main\` se spuštěním deploye.

---

## V2-00 — Uzavřít současné remediation blokéry a stanovit důkazy (P0)

**Cíl:** Nesmí se přepisovat architektura nad neověřeným referenčním chováním.

**Zadání:** Zkontroluj patch \`audit/production-remediation-2026-10-21\` / \`7052147e\` vůči aktuálnímu \`main\`. Přenes prokazatelně správné opravy do bezpečné integrační základny, bez přepsání novějšího kódu. Prověř falešné \`deploy:false\` (počítej úplný commit diff, nikoliv prázdný working tree), oprav výběr rozsahu release. Diagnostikuj neúspěšný T58 preflight \`39633253019\`, doplň worker testy concurrent claim/stale-claim/restart, ověř read-only mapování Prisma tabulek a rollback kompatibilitu. Dokonči behaviorální evidenci všech 79 KEEP; doplň chybějící kontraktní a integrační fixture.

**Výstup:** referenční behaviorální test suite, výkonová baseline, přehled blokérů a oddělený bezpečný patch. Při chybějící produkční autentizaci či katalogu zaznamenej \`BLOCKED\`; nevymýšlej PASS.

**Hotovo když:** všechny použitelné opravy jsou reprodukovatelně zelené; produkční brány jsou vyřešeny nebo explicitně blokují nasazení.

## V2-01 — Zpřesnit architektonické hranice a datové kontrakty (P0)

**Cíl:** Odstranit cyklické importy a provázání UI, serverových providerů, state, DTO a databáze před přepisem.

**Zadání:** Nakresli skutečný dependency graf ze současných vstupních bodů, event ownership mapu a dependency matrix všech KEEP funkcí. Zaveď lehké interní balíčky/složky pro doménové datové typy, normalizaci, čisté algoritmy, porty providerů, veřejné DTO, persistence interfaces a UI adaptér. Do každé vrstvy dej jen nezbytný kód a přidej lint/boundary testy proti cyklickým a server→client importům. Nezaváděj mikroservisy, další databázi, nový framework ani alternativní message bus.

**Měř:** bundle import graph, počet křížových závislostí, server-only kód v klientském bundle, typecheck náklady.  
**Hotovo když:** existují testované stabilní kontrakty a další moduly lze oddělovat bez změny public API a runtime.

## V2-02 — Přepsat organizaci AircraftStateService, ne jeho logiku (P0, vysoké riziko)

**Zadání:** Rozděl \`lib/server/aircraft-state.ts\` na explicitní jednotky: lifecycle, local ingest orchestration, network affinity/merge, canonical aircraft state, continuity/stale guard, history sampling dispatch, diagnostics a bounded fan-out events. Jeden procesní owner a jediný aktivní poller se nemění. Zapouzdři side effects; nejprve přesuň beze změny algoritmy a ověř snapshot parity proti starému kódu na fixovaných časových sekvencích. Až pak optimalizuj CPU a alokace podle profilů. Cache nesmí měnit pravidla vypršení nebo lokální autoritu.

**Testy:** 1×/2×/4×, identity/callsign changes, disappearance/reappearance, mass-drop protection, stale affinity, fail-soft DB, provider outages, shutdown/restart.  
**Hotovo když:** bitově nebo semanticky shodná kanonická state observace a doložený přínos nebo nulová výkonová regrese.

## V2-03 — Normalizace readsb JSON, BEAST a síťových providerů (P1, vysoké riziko)

**Zadání:** Uspořádej vstupy jako nezávislé adapters: readsb JSON, local BEAST, ADSBHub SBS, ADSB.lol raw/HTTP. Sjednoť validaci, časové značky, bounded buffers, retries a source provenance; zachovej stávající field-level arbitration a failover. Rust BEAST parser/CRC24 **nepřepisuj** bez důkazu chyby; zachovej FFI/native akceleraci a ověř parity proti TypeScript fallbacku. Udrž síťové requesty mimo kritický local snapshot path, timeout/backoff limituj.

**Testy:** DF/CRC/Beast timestamp wrap, partial JSON, source loss, duplicate ICAO, network-only RAM (bez DB), invalid coordinates, memory bound a 1×/2×/4× replay.  
**Hotovo když:** žádná změna obsahu lokálních aircraft DTO, žádný duplicitní poller, lepší profil hot path při stejném provozu.

## V2-04 — Přepsat SSE V1/V2 distribuční vrstvu (P1, vysoké riziko)

**Zadání:** Vytvoř jeden bounded transportní engine se dvěma kompatibilními wire kontrakty: V1 full snapshot a V2 initial snapshot + changed/removed deltas. Zoptimalizuj serializaci a fanout s cache serializovaných public DTO tam, kde je skutečně sdílena, a vyhněte se O(klienti × plný aircraft snapshot) výpočtu na každém ticku. Respektuj per-client sekvence, slow-client coalescing, front/backpressure, heartbeat 15 s, abort cleanup, capacity 503 a \`X-Accel-Buffering: no\`. Neriskuj leak serverových metadat.

**Testy:** 1/10/100 souběžných klientů v izolovaném load testu, dlouhá spojení, zpožděný klient, reconnect, DeltaV2 parity, lokální i extended coverage, memory churn, socket/heap leak.  
**Hotovo když:** kompatibilní EventSource klient a doložená nižší CPU či traffic zátěž bez výpadků.

## V2-05 — Historie a databázové přístupy (P1)

**Zadání:** Rozděl \`lib/server/history.ts\` na zápis vzorků, single-lane queue, dotazování, časové rozsahy, DTO a retenční úlohy. Zachovej \`Flight\`, \`FlightPosition\`, \`FlightEvent\`, současnou historii i fallback do in-memory trail. Odstraň N+1 dotazy, nahraď nepotřebná \`.all()\` ohraničenou SQL agregací, měř objem a latenci. Dodrž APP_TIMEZONE pro denní statistiky, index coverage a cursor-based stránkování tam, kde je potřebné. Neprováděj neodsouhlasené DDL.

**Testy:** persist queue coalescing, multi-aircraft failure, DB down, pagination, 200+ řádků, DST, bounded memory, žádná duplicita historických záznamů.  
**Hotovo když:** identické historické API a nižší náklady DB/Node na referenčních datech.

## V2-06 — ATC/ATS, geometry a Navigation Integrity (P1)

**Zadání:** Odděl geometrii prostorů, bbox/spatial index, výškové podmínky, ATS routy, aktualizaci katalogů a Navigation Integrity od UI a snapshot lifecycle. Profiluj \`ringContains\`/point-in-polygon a přejdi na připravený prostorový index pro opakovaná vyhodnocení, atomicky publikovaný a invalidovaný generation tokenem. Respektuj hranice polygonů, AGL vs MSL, provenance a to, že ATC assignment je pravděpodobný, nikoliv známá laděná frekvence. Zachovej české celostátní i lokální ATC, ATS/NAVAID dle KEEP. Nepřidávej zpět odstraněné SK/AT seznamy bez požadavku.

**Testy:** geometry parity, 500–10000 bodů/syntetické polygony, invalidace za běhu, event-loop P95/P99, route context, Navigation Integrity bounds/completeness.  
**Hotovo když:** stejné ATC výsledky a měřitelně menší blokování event loopu.

## V2-07 — Weather, METAR a časový mapový kontext (P2)

**Zadání:** Přepiš organizačně počasí na nezávislé read-only cached providers (METAR/TAF, SIGMET, CHMI radar, případně vítr podle KEEP) s bounded TTL, stale-if-error a lazy refresh. Odděl current a archived map-context od live aircraft state. Zachovej časovou validitu radarových snímků/advisories, historické DTO a existující uložené záznamy AUP. Nespouštěj žádné dodatečné dotazy na počasí během BEAST/readsb pollingu. Neobnovuj odstraněné analytické funkce.

**Testy:** chybové provider responses, stale data, valid time windows, DDB-independent failure, nulová změna live CPU bez weather viewers, network request counts.  
**Hotovo když:** menší duplicita cache a stabilní veřejná weather API.

## V2-08 — OGN/FLARM a RXW komunikace (P2)

**Zadání:** Rozděl oddělené OGN APRS ingest, DDB resolver/persistent privacy cache, veřejný serializer, SSE a UI adapter. Doplň bounded batch/cancel/timeout a leak tests; ale chování privacy zachovej absolutně: noTracking drop, DDB unresolved fail-closed, anonymous IDs bez vysílání identity, izolace od ADS-B historie/alertů. RXW Hub ACARS/VDL2 ponech jako samostatný bounded diagnostický/komunikační modul bez návratu odstraněné flight-plan overlay.

**Testy:** 0/1/5000 OGN targets, APRS partial lines, DDB 429/timeout, cache reload, stale resolution, reconnect, subscriber drop, privacy snapshots.  
**Hotovo když:** stejné public DTO, žádné privacy regresní úniky a nižší zbytečná práce mimo aktivní použití.

## V2-09 — Hlavní mapa MapLibre a React UI (P1)

**Zadání:** Rozděl \`components/airradar-app.tsx\` a současné mapové hooky na nezávislé boundary: stream state, aircraft selection/detail, map instance/layers, controls, traffic panel, mobile drawer, weather overlays a navigační vrstvy. Minimalizuj React rerenders a opakované MapLibre \`setData\`/style reload, udržuj stabilní callbacks, memoizaci pouze podle profilů a RAF/batched update tam, kde zachová real-time odezvu. Mapa se nesmí remountovat při volbě letadla. Zachovej funkční desktop/mobile interakce a všechny 79 KEEP projekce.

**Testy:** browser E2E, map layer parity, interactions 375/821/desktop, delta traffic 1×/2×/4×, React commit counts, DOM/UI latency, long-running heap.  
**Hotovo když:** rychlejší interakce a menší rerender/data churn bez vizuálních regresí.

## V2-10 — Design systém, CSS a responzivita (P2)

**Zadání:** Rozděl \`app/globals.css\` po komponentech/panelech, proveď reachability analýzu tříd včetně dynamických atributů, portálů a fullscreen stavu, a prokaž nepoužité selektory před smazáním. Zachovej společné design tokens, \`components/ui-primitives.tsx\`, icon/aviation assets, kontrast a i18n délky textů. Nedělej plošné přebarvení ani vizuální redesign bez požadavku; jde o udržitelnost a style recalculation.

**Testy:** všech 27 vizuálních cílů a 14 viewportů z posledního reportu, desktop/mobile interactions, dark/light relevantní stavy, screenshot diff, CSS bytes a render cost.  
**Hotovo když:** menší CSS payload, méně globálních kolizí a bez chybných UI komponent.

## V2-11 — System status, T58 a provozní diagnostika (P1)

**Zadání:** Rozděl \`lib/server/system-status.ts\` a \`lib/server/system-status-stream.ts\` na ingest-independent registr měření, jednotlivé lazy probes, privacy-safe public projection a full/admin projection. Omez full refresh, DB dotazy i provider probes; zachovej shared poller a žádný per-client přístup k DB. Veřejný sanitizovaný status zůstane bez loginu; admin privátní informace pouze po autentizaci. Diagnostika nesmí předčasně zahřívat weather/optional caches. Oprav T58 preflight bez obcházení auth, obnov měření event-loop P95/P99 a korelaci s vybranými změnami.

**Testy:** status idle/read-only, disabled/offline/degraded semantics, DB queries per subscriber, SSE cleanup, privacy leak, T58 reproducible run.  
**Hotovo když:** pravdivé diagnostiky a levnější idle monitoring.

## V2-12 — Alert delivery, Pushover a Web Push (P1)

**Zadání:** Přepiš notifikační delivery orchestration na explicitní stavový automat \`PENDING → CLAIMED → SENT/FAILED/RETRY\`, idempotentní claim a omezené retry. Neexistující transport nikdy nesmí skončit SENT. Zachovej Pushover kontrolu status payload, Web Push endpointy, VAPID a subscription store; zajisti bezpečné serializované zápisy. Pokud neexistuje producent pro Web Push, reportuj \`UNAVAILABLE\`, nikoliv falešné \`HEALTHY\`; neobnovuj starý pravidlový alert engine. Nedělej duplicitní delivery při restartu ani při souběhu workerů, kde to transakční a provider semantika umožňuje; výslovně zdokumentuj nemožnost garantovat exactly-once vůči externí síti.

**Testy:** dvě souběžná worker instance, crash před/po odeslání, expired claim, provider 2xx error, 429/5xx, retry, unknown channel, duplicate subscription requests.  
**Hotovo když:** transportní stav odpovídá důkazům doručení a health neklame.

## V2-13 — HTTP API: bezpečnost, validace a náklady (P1)

**Zadání:** Udělej inventář 52 aktivních API, sjednoť validaci query/body, ochranu admin mutací, origin/CSRF podle aktuálního modelu, maximální velikosti vstupů a response schema. Zkontroluj \`X-Real-IP\` a trust boundary, ale neměň reverse proxy. Zachovej sanitizované veřejné GET. Sdílené request helpery zaveď jen když nezhorší latency nebo klientské cache kontrakty. U read-heavy GET odstraň nepotřebnou DB práci, N+1 a absence bounded pagination. Nedělej nekontrolované rate-limitování dlouhého SSE.

**Testy:** anonymous public read, unauthorized admin read/write, injection/malformed body, proxy header spoof, 429/503 contracts, error sanitization, latency/allocations.  
**Hotovo když:** srozumitelnější routing a menší attack surface bez veřejné regrese.

## V2-14 — Odstranění legacy kódu, nepoužívaných závislostí a duplicit (P2)

**Zadání:** Teprve po dokončení výše uvedených hranic proveď systematický dead-code sweep. Sestroj graf reachability z Next routes, dynamic imports, React hooks, i18n, CSS, systemd, scheduled jobs, package scripts, CI, externích aktivních API a runtime persisted formats. Pro všech 36 dříve nalezených kandidátů dokumentuj, proč je bezpečné odstranit/neodstranit. Odstraň jen prokázaně mrtvé exporty, moduly, testovací fixture, styles, icon assets a npm balíčky; aktualizuj feature registry, lokální dokumentaci i graf počtu řádků v README. Nedotýkej se chráněných historických dat a migrací.

**Testy:** před/po feature gate všech 79 KEEP, fresh \`npm ci\`, lint/typecheck, all tests, browser, size and perf.  
**Hotovo když:** doložený seznam smazaných položek, zmenšený maintainability/build footprint bez regrese; produkční LOC pod 100k není samostatným cílem, je již splněn.

## V2-15 — Integrační test, release a produkční ověření (P0, koncová etapa)

**Zadání:** Vyhodnoť výstupy V2-00 až V2-14; nedokončené moduly označ \`NOT READY\` a nenasazuj je. Na aktuálním HEAD proveď úplnou behaviorální matici 79 KEEP, správnost wire V1/V2, Rust/BEAST parity, PostgreSQL read-only catalog mapping, no-destructive migration check a testy autentizace. V izolovaném prostředí spusť \`npm run lint\`, \`npm run typecheck\`, \`npm run test:full\`, \`npm run features:check\`, \`npm run docs:check\`, \`npm run visual:check\`, \`npm run icons:audit\`, \`npm run test:production:all\` a load-scaling; dosáhni průchodu všech existujících release gates včetně CodeQL na **shodném SHA**. Ověř T58 produkční baseline a rollback kompatibilitu. Teprve pak bezpečně synchronizuj \`main\`, zkontroluj celý diff + release scope, proveď povolený non-force push a sleduj standardní automatický deploy (žádné \`[skip ci]\`). Žádný manuální build v live checkoutu.

**Po deployi:** ověř přesný commit, BUILD_ID, verzi, \`/api/health\`, SSE 1/2, mapu mobil/desktop, statické assety, readsb, lokální provoz a historii, ATC/weather/OGN dle konfigurace, logy a srovnatelné T58 P95/P99, CPU a RSS. Kritická regrese = zastavit a použít zdokumentovaný safe recovery jen po ověření schématu. Výsledný report napiš do \`docs/audits/\` se stavem **PRODUCTION PASS / PRODUCTION NO-GO / NOT VERIFIED** a přesnými důkazy.

---

## Doporučené pořadí práce

- **Nultá příprava:** V2-00 a V2-01.
- **Nejdražší live path:** V2-02 → V2-03 → V2-04. Každou etapu samostatně prokazatelně ověř.
- **Datové a letecké výpočty:** V2-05 → V2-06; V2-07 a V2-08 lze řešit odděleně až po uzamčení kontraktů.
- **Frontend:** V2-09 → V2-10.
- **Diagnostiky a bezpečnost:** V2-11 → V2-12 → V2-13. Kritické bugfixy z V2-00 mají vždy přednost před kosmetickým refaktorem.
- **Cleanup:** V2-14 až poté, co je opravdu známá dosažitelnost komponent.
- **Release:** V2-15 pouze pro ověřenou a správně oddělenou skupinu změn. Není povinnost čekat na všech 14 přepisů, když jde nezávislé dokončené komponenty bezpečně releaseovat podle pravidel projektu.

## Doporučená evidence ke každé etapě

Report per task: zadání, původní a nový commit SHA, změněné soubory, zachované invarianty, výsledky testů včetně nespuštěných, profil before/after se srovnatelným zatížením, dopady na 79 KEEP, rollback, otevřené blokéry, výsledek \`DONE / PARTIAL / BLOCKED\`.

**Rozhodovací pravidlo:** Přepis není úspěch, jestliže pouze přeskupí řádky. Musí snížit nezbytnou složitost a mít jasnou ekvivalenci chování; výkonové zlepšení musí být měřené, nikoli deklarované.
