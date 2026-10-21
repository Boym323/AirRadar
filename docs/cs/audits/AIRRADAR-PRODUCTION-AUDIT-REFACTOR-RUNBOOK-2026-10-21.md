# AirRadar — produkční audit, zabezpečení, refaktor a bezpečné zmenšení kódu
**Prováděcí příručka — 21. října 2026**

> Jde o prováděcí specifikaci pro programovacího agenta s přístupem k repozitáři GitHub a ke *schválenému* prostředí pro build, testování a ověření produkce. Vytvoření tohoto dokumentu samo o sobě nepovoluje ani neprovádí změny kódu, databáze, restarty ani nasazení. Provozovatel povoluje běžné **automatizované nedevastující produkční nasazení** pouze tehdy, když výslovně spustí prováděcí zadání odkazující na tuto příručku. Přísnější aktuální pravidla repozitáře mají přednost.

**Repozitář:** https://github.com/Boym323/AirRadar
**Cíl:** aktuální výchozí větev `main`; její skutečné SHA zjisti až při provádění. Historická revize pro kontrolu k 21. 10. 2026: `4c85fec9ad46cfab9f72452ef987ccf5916fe2a6`. Nepředpokládej, že toto SHA nebo starší audit stále přesně popisuje repozitář.
**Zdroj pravdy:** [AGENTS.md](../../../AGENTS.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [docs/DATA-FLOWS.md](../DATA-FLOWS.md), [docs/RUNTIME-INVARIANTS.md](../RUNTIME-INVARIANTS.md), [docs/DEVELOPMENT.md](../DEVELOPMENT.md), [docs/RELEASE.md](../RELEASE.md), [docs/features.registry.json](../../features.registry.json), [docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json](../../audits/SELECTED-FEATURE-REVISED-2026-10-21.json) a kanonické doklady KEEP/REMOVE. Načítej pouze související části, nikoli celou dokumentaci.

## 0. Cíl práce a oprávnění

Dokonči práci, ne pouze další obecný audit: ověř aktuální implementaci; cílenými testy potvrď nebo vyvrať každý kandidátní problém; opravené závady skutečně oprav; odstraň opravdu nepotřebné zdrojové soubory, CSS, skripty a assety na základě důkazů o závislostech; zlepši efektivitu běhu bez změny zachovaného chování; otestuj celý systém; doruč změny přes schválené CI/CD; ověř produkci a zaznamenej měření před a po i každý změněný či smazaný soubor.

Prováděcí zadání povoluje běžné commity kódu a dokumentace, rutinní GitHub kontroly a již zavedené **automatizované** nasazení ověřeného commitu do produkce, včetně běžného restartu služby v rámci nasazení. **Nepovoluje** force-push, obcházení neúspěšných gate, ruční restarty či vydání mimo tento workflow, reset databáze, destruktivní migrace, mazání reálných dat, změnu tajemství nebo produkčního `.env`, přepis konfigurace reverse proxy ani změnu nastavení operačního systému. Pokud bude skutečně nutný ruční privilegovaný zásah nebo riziková databázová změna, izoluj blokaci a vyžádej samostatné schválení. Na běžná implementační rozhodnutí se neptej; nejprve dokonči všechny bezpečné části.

**Pravidla produkčních změn:** nejprve proveď pouze read-only měření výchozího stavu. Nespouštěj `npm run build` v aktivním produkčním checkoutu; použij oddělený nevysílající vývojový checkout, izolovaný CI build a `deploy/release.sh` podle předpisu. Nikdy nenasazuj neověřené SHA. Push do `main` může spustit automatické nasazení. Preferuj jeden ověřený push pro nasazení až po etapových lokálních commitech a kontrolách. Těsně před pushem znovu zkontroluj aktuální `main`. Řiď se schválenými pravidly přímé práce na hlavní větvi; pokud je pro přednasazovací bezpečnostní a browser testy nezbytná jednorázová varianta `release-preview` bez nasazení, považuj ji za odůvodněnou výjimku, nikoli nový běžný proces.

## 1. Podmínky přijetí: zachovat funkce KEEP

Načti nejnovější výslovný výběr. Dokumentovaný revidovaný stav je **79 KEEP / 99 REMOVE** (dříve 88/90, devět dalších položek bylo výslovně odstraněno). Za kanonický považuj aktuální výběr schválený uživatelem, nikoli zastaralý popis PR. Neobnovuj odstraněné chování. Ověř všech 79 ID KEEP proti implementaci a skutečnému chování všude, kde je to proveditelné; nestačí pouhá existence souborů. Zachované jádro zahrnuje:

- Lokální ingest readsb JSON a BEAST, akceleraci Rust BEAST/CRC a JS fallback, kontinuitu identity, omezený stav v RAM, lokální i rozšířené pokrytí, odolný failover a vzorkovanou PostgreSQL historii letů.
- Snapshoty letadel přes `/api/stream` SSE v1 a delty v2, slučování a backpressure, heartbeat, limity klientů a celkové kapacity, veřejnou serializaci a obnovení spojení klientem.
- Mapu MapLibre, výběr letu, detail a historii, trajektorie letadel, popisky a ikony, kontext vybraného letadla a trasu, responzivní navigaci, mobilní drawer, vrstvy mapy a počasí a jen požadované ATC/ATS vrstvy.
- Veřejný a záměrně sanitizovaný read-only stav systému, health a výkonu; chráněné privilegované diagnostiky a VŠECHNY administrační mutace; správné soukromí polohy přijímače.
- Zachované české ATC, relevantní sektory a frekvence; ATS reference CZ/SK/AT podle matice funkcí. Nezaměňuj odstranění SK/AT radio scan kanálů v jiném projektu za smazání ATS referenčních dat AirRadar.
- Letiště, METAR, SIGMET, zdroje počasí ČHMÚ, relevantní navigační data a detekci integrity, soukromí OGN/DDB/SoftRF, vybrané volitelné síťové providery a integrace RXW.
- Požadovaný transport push odběrů a trvalý stav doručení Pushover, diagnostiky požadované uživatelem, infrastrukturu vydávání a existující uložené záznamy potřebné pro KEEP.

**Nikdy nemaž** PostgreSQL tabulky letů, poloh a historie ani jejich data, produkční migrace, zachovanou geometrii tras/ATC, archiv počasí, úložiště odběrů, trvalé Pushover occurrence/delivery, soukromá data či persistenci OGN, deployment skripty, Rust fallback ani potřebné testy. Nesmaž sdílenou závislost jen proto, že byla odebrána původní stránka, která ji používala. Zachovej dynamické importy, veřejné endpointy používané externími klienty, hooky spuštění a ukončení workerů i kompatibilní DTO, pokud jsou prokazatelně potřebné.

## 2. Vytvoř autoritativní aktuální baseline

1. Ověř Git HEAD, čistotu vývojového checkoutu, aktuální produkční SHA z `/api/version`, stav GitHub Actions, pracovní větev, health produkce a poslední vydání. Nepředpokládej, že produkce odpovídá `main`. Zaznamenej, co bylo přímo pozorováno a co pochází ze starší dokumentace.
2. Existujícími read-only T58/health/integration nástroji zachyť baseline: lokální letadla a čerstvost ingestu, chování BEAST vůči JSON, zdrojové rychlosti, aktivní SSE klienty a čítače front/slučování, CPU %, RSS, heap, P50/P95/P99/max event-loopu, hlavní GC, rychlost a latenci DB zápisů, latenci odpovědí a chyby klíčových endpointů. Příčinu neodvozuj z osamocených špiček.
3. Spusť nebo prověř aktuální testovací matici, lint, TypeScript, audit balíčků, integritu migrací Prisma, CodeQL, release scope, feature registry a browser gate pro vydání. Zaznamenej příkazy a skutečné výsledky. Ověř, že lze odlišit aktuální commit `main` od úspěšných kontrol na předchozím commitu. Před tvrzením o výkonu spusť syntetický radarový fixture při 1×/2×/4×.
4. Zmapuj verzované soubory `app/components/lib/scripts/styles/data/public` a graf importů, volání i referencí. Zahrň dynamické routy, assety načítané za běhu, samostatná spuštění workerů a nepřímé cesty importů. Počet zdrojových řádků určuj projektovými metrikami; baseline k 21. 10. 2026 byla přibližně **86 598 neprázdných produkčních LOC a 28 000 testovacích LOC**, nejde o autoritativní budoucí hodnotu.
5. Ověř skutečné hranice závislostí a oprávnění živého přijímače, PostgreSQL, Web Push a upstream integrací. Neměň konfiguraci databáze ani proxy jen kvůli dokončení auditu.

## 3. Oprav všechny potvrzené kandidáty P1, nejprve testy

### P1-A: fronta notifikací chybně označuje nepodporované kanály jako odeslané
Prostuduj `lib/server/alert-delivery-worker.ts`, `lib/server/alerts-fleets-repository.ts` a `tests/alert-delivery-worker.test.ts`. Kandidátní chyba: po podmíněném zpracování PUSHOVER se bezpodmínečně volá `markDeliverySent()` i pro jiné hodnoty kanálu. Nejprve přidej neúspěšný test reprodukující chybu, potom zaveď explicitní dispatcher podporovaných kanálů. Nepodporované/neplatné kanály musí být dohledatelné jako neúspěšné (FAILED nebo explicitní bezpečný stav), nikdy SENT bez skutečného doručení. Zachovej retry/backoff, idempotenci, obnovu zastaralého claimu, řádné ukončení a již zařazené řádky. Testuj HTTP 200 provideru, 4xx, 429, 5xx, timeout, neznámý kanál, dvojitý worker a restart. Opakovaný pokus nesmí vést k duplicitnímu doručení, pokud to není zdokumentované jako nevyhnutelné chování provideru.

### P1-B: oprav hranici admin/public přístupu, nevynucuj plošné přihlášení
Prostuduj `lib/server/watchlist-auth.ts`, všechny routy `app/api/admin/**`, API `/system` a veřejnou serializaci. Kandidátní chyba: `isWatchlistSessionValid` vrací při `AIRRADAR_ADMIN_AUTH_ENABLED=false` hodnotu true. Repozitář záměrně zpřístupňuje VEŘEJNÉ SANITIZOVANÉ read-only health/system projekce; bez přihlášení je zachovej. Citlivá diagnostika pouze pro administrátory musí vyžadovat striktní admin relaci a nikdy nesmí odhalovat tajemství, přesnou polohu přijímače, interní ID hostů, přihlašovací údaje providerů, syrové výjimky ani interní infrastrukturu. Všechny mutace musí fail-closed bez ohledu na starý opt-out. Připrav matici rout public/admin/access a testy anonymního GET, přihlášeného GET, chybějícího/neplatného tokenu, změny ze stejného originu a odmítnutí CSRF. Pokud je čtení už sanitizované a záměrně veřejné, zachovej přístup a oprav pouze skutečné úniky.

### P1-C: stav doručení Web Push musí odpovídat skutečnosti
Prostuduj `lib/server/web-push.ts`, `lib/server/web-push-store.ts`, `app/api/push/**`, `lib/server/delivery-health.ts` a případného trvalého producenta/konzumenta. Rozliš „transport nakonfigurován“ od „pipeline doručení funkční“. Ověř, zda matice KEEP skutečně vyžaduje Web Push jako aktuální transport událostí; neobnovuj odstraněné Alert/Fleet pravidlové enginy. Pokud existuje povolený aktivní producent, napoj skutečné end-to-end doručení a pozorovatelný stav fronty. Pokud neexistuje, výslovně to uveď a přesně promítni do health/status; nevymýšlej úspěšná oznámení ani potichu nemaž zachované odběry. Otestuj očekávané chování odběru v mobilním/prohlížečovém klientu a chybové stavy.

## 4. Oprav P2 a vady spolehlivosti

### P2-A: souběžné změny odběrů
`lib/server/web-push-store.ts` po čtení a změně zapisuje do stejného `.tmp`. Reprodukuj paralelní přidávání/mazání; zápisy serializuj bezpečnou in-process frontou/zámkem, použij unikátní dočasný soubor a atomickou náhradu, omez délku endpointu/klíčů a velikost JSON požadavku, zachovej režim souboru 0600 a bezpečně se zotav z přerušeného zápisu. Pokud mohou zapisovat různé procesy, zvol vhodný cross-process mechanismus, nespoléhej pouze na zámek jednoho procesu. Testy musí prokázat, že nedochází ke ztracené změně, duplicitnímu endpointu ani neplatnému zkrácenému JSON.

### P2-B: odlehčený veřejný refresh systémového SSE
`lib/server/system-status-stream.ts` nyní každých pět sekund volá `readSystemStatus()` s výchozím plným detailem. Odděl sdílené a omezené veřejné čtení stavu od privilegované plné diagnostiky. Anonymnímu klientovi nikdy neposílej syrová privilegovaná pole. Zachovej SSE kontrakt, úklid při abortu, slučování a možnost autorizovaných admin klientů získat bohatší diagnostiku. Změř dopad na CPU, DB dotazy a tail latence event loopu; bez srovnatelných důkazů netvrď zlepšení výkonu.

### P2-C: škálovatelná SQL agregace health doručení
`deliveryHealthSnapshot` v `lib/server/alerts-fleets-repository.ts` načítá všechny řádky `AlertDelivery` do JS. Nahraď to omezenými DB agregacemi nebo obhajitelným průběžným souhrnem, zachovej všechna vracená health pole i správné zpracování nullů a časů. Pokryj prázdnou tabulku, fixture o 100 a 100 000+ řádcích, neobvyklé stavy a souběžné změny. Před případným přidáním indexu prověř query plan a stávající indexy. Bez destruktivní migrace.

### P2-D: správnost historie Navigation Integrity
`lib/server/navigation-integrity.ts` nyní řadí a omezuje výsledek před všemi časovými filtry. Přesuň použitelné překryvné filtry `from/to` do DB dotazu, zajisti stabilní řazení s tie-breakem a podle kontraktu zaveď omezenou stránkovanou/cursor navigaci. U limitu se nesmí vynechat starší platné anomálie; určete chování při nedostupné DB a přidej fixture s více než 200 událostmi a překryvnými aktivními anomáliemi. Slučitelně aktualizuj volající/API i testy.

### P2-E: bezpečnost upgradu Prisma 8 RC
Historická verze `package.json` připíná `@prisma/orm-postgres` 8.0.0-rc.9 a Prisma CLI 8.0.0-rc.13; `prisma/contract.prisma` používá mnoho implicitních mapování tabulek. Před úvahou o sjednocení verzí či explicitním `@@map` spusť existující read-only `scripts/audit-prisma-rc-mapping.mjs` a prověř skutečný DB katalog read-only. Prisma automaticky neupgraduj. Každý přechod schématu vyžaduje výslovně ověřenou kompatibilitu, zálohu/obnovu a souhlas provozovatele; jinak ponech funkční připnutou verzi a zdokumentuj zbytkové riziko. Spusť integrační kontroly skutečným runtime klientem; nepoužívej `prisma reset` ani destruktivní migraci.

### P2-F: zpevnění vstupů API a zátěže
Prověř `/api/ogn/state`, `/api/ats/routes`, `/api/push/subscribe` a zbývajících 52 rout: limity vstupu, neošetřená chyba `request.json`, drahé veřejné požadavky, správnost cache, oprávnění/soukromí a neočekávané 500. Kde je to vhodné, přidej sdílený rate limit, zdokumentuj výjimky SSE, omez payloady a ověř, že `x-real-ip` je důvěryhodné jen za správně nakonfigurovanou proxy. Reverse proxy bez zvláštního schválení neměň. Veřejný health check musí zůstat funkční. Zachovej potřebnou CSP pro Next/MapLibre; `unsafe-inline` zpřísňuj pouze po ověření kompatibility browser testy. Upřednostni praktické změny s malou režií podložené neúspěšným regresním testem.

### P2-G: kontrola odolnosti
Prověř zahlcení, timeouty/backoff a úklid v ingestu, síťovém fallbacku, zápisech historie, SSE, počasí/radaru, geometrii ATC, enrichmentu, shutdownu, OGN a databázi. Selhání providerů nesmí blokovat živé jádro `readsb → RAM → SSE`. Než změníš smyčky nebo přidáš cache, najdi skutečná CPU úzká místa profilerem. Zachovej slučování práce, předvídatelnou zátěž, původ dat a fail-closed soukromí.

## 5. Systematické odstranění mrtvého kódu a souborů bez regrese

Cílem je menší **nezbytný** codebase, nikoli libovolné snižování LOC. Historický snapshot již splnil cíl 100 tisíc *produkčních* LOC; nemaž zachované funkce ani neoslabuj testy kvůli číslu.

1. Spusť `scripts/audit-code-footprint.mjs`, `scripts/selected-feature-premerge-audit.mjs` a kontroly feature registry; porovnej statické importy, dynamické importy, URL, použití TS symbolů, runtime entrypointy, server workery, GitHub workflow, startovací skripty, kompatibilitu migrací, generované assety a matici KEEP/REMOVE.
2. Pro každého kandidáta na odstranění uveď cestu/symbol, úsporu bajtů/LOC, přesné příchozí reference (nebo důkaz jejich absence), ID KEEP/REMOVE, riziko dynamického použití, důkazy testů a zda jde o historická data, nebo spustitelný kód.
3. Skutečně osiřelé komponenty, CSS stránky, nepoužívané importy, mrtvé helpery, zastaralé alternativní implementace, duplicitní serializaci, zastaralé komentáře, nepotřebné feature flags, jednorázové staré skripty/benchmarky a nereferencované assety mazej POUZE s důkazy, že se nepoužívají za běhu. Soubor jen „zdánlivě nepoužívaný“ nemaž, pokud zůstává nevyřešená dynamická či externí závislost. Nemaž snapshoty, důkazy, migrace DB, runtime soubory, integrační vrstvy ani release infrastrukturu kvůli úspoře místa.
4. Duplicitní kód slučuj až po testech prokazujících shodu chování. Zachovej záměrné veřejné routy a datové kontrakty. Při změně API aktualizuj registry, feature dokumentaci, autoritativní české verze, volající klienty a testy. Endpoint nemaž pouze proto, že byla odstraněna stránka; ověř přímé/externí klienty i závislosti.
5. Velké moduly rozděluj postupně: `components/airradar-app.tsx` (stav/handlery/hooky), `app/globals.css` (CSS komponent), `lib/server/aircraft-state.ts` (ingest/lifecycle/enrichment/notifikace), `lib/server/history.ts` (čtení/zápisy/retention), `lib/server/system-status.ts` (veřejné/admin buildery). Vytahuj soudržné části, nepřepisuj celou aplikaci. Zachovej exporty modulů a nevytvářej desítky pětřádkových wrapperů.
6. Znovu prověř vyřazené backend cesty, např. staré plochy Flight Story/event, zastaralé typy smart search, nevyužívané varianty route intelligence, nepotřebné ATC prediktory, staré statistiky/recap funkce, nepodporované config přepínače a neaktuální benchmarky vůči současnému rozsahu. Neodstraňuj sdílené závislosti H07/H14/J09 ani R11/R17.
7. Zaznamenej přesné produkční LOC, test LOC, počet verzovaných souborů, smazané bajty a změny testů/běhu před a po. Dávej přednost skutečnému zjednodušení a menším alokacím za běhu před kosmetickým formátováním.

## 6. Testy a kvalitativní brána

Před každým pushem nebo vydáním, které může nasadit do produkce:

- Spusť `npm ci`; `npm run lint`; `npm run typecheck`; `npm run test:full`; `npm run build` v **nevysílajícím vývojovém checkoutu**; `npm audit --omit=dev --audit-level=high`; `npx prisma migration check`; `npm run features:check`; `npm run docs:check`; `npm run visual:check` a relevantní audit ikon. Pokud se aktuální skripty liší, řiď se skutečnou konfigurací repozitáře a přesně zaznamenej, co proběhlo. Neobcházej kontroly pomocí skip flagů.
- Spusť cílené P1/P2 regresní testy: souběh, chybný JSON, zamítnuté admin čtení, veřejné sanitizované čtení, neznámý notifikační kanál, retry/claim doručení, SSE v1/v2 delta/reconnect/pomalí klienti, BEAST parser + CRC Rust parity/fallback, soukromí OGN, stránkování Navigation Integrity a PostgreSQL integrace, pokud je dostupná.
- Vyžaduj klasifikaci release scope, čistý CodeQL a všechny příslušné release-validation/release-tests/release-performance joby úspěšné pro **přesný kandidátní strom/SHA**; spusť úplný browser smoke na desktopu i mobilu (ne jen screenshoty), syntetickou zátěž 1×/2×/4× a porovnej profiler/runtime metriky. U rozsáhlého refaktoru se nespoléhej jen na chytré spouštění změněných testů.
- Ověř celou vybranou sadu funkcí i veřejné read-only chování; žádné chybějící routy, nefunkční statické assety, rozbité odkazy/navigace, ztracené vrstvy mapy či historie, změna priority zdrojů, ztráta notifikací ani únik soukromí.
- Při nalezení neúspěšného/neznámého testu, zastaralého CodeQL nebo nekompatibilní migrace zastav před nasazením, oprav/testuj nebo zdokumentuj tvrdé NO-GO. Nikdy nevydávej historické CI za aktuální zelený výsledek.

## 7. Produkční nasazení a ověření

1. Ověř aktuální baseline produkce, verzi/commit, čerstvost přijímače a stabilní chyby; zjisti SHA artefaktu nasazení a neměnné ID rollback buildu. Přečti `docs/RELEASE.md` a zkontroluj release plán CI. Ověř, že připravený build ani migrace destruktivně nemění data. Pro navrhovanou DB migraci vyžaduj ověřitelnou obnovitelnou zálohu a rollback kompatibilní se schématem; pokud chybí, schéma neměň a označ migraci jako blokovanou.
2. Pushni ověřený kód povoleným non-force postupem podle politiky přímé práce na main a bez nesouvisejících změn. Pokud je nutné předem ověřit rizikový CodeQL/browser rozsah, použij výjimečný release-preview bez produkčního nasazení. Nepushuj neotestovaný kód, který spouští vydání. Neměň produkční tajemství ani proxy.
3. Nech GitHub Actions nasadit přesně připnutý artefakt existujícím self-hosted workflow. Nikdy ručně nevytvářej build přes aktivní `.next`, ručně nerestartuj službu ani nespouštěj `release.sh` mimo schválený workflow kvůli obejití CI. Sleduj CI a CodeQL pro přesné SHA a ověř SHA nahlášené deploy jobem.
4. Po nasazení ověř veřejné `/api/version` SHA, `/api/health` včetně DB a přijímače, `/api/aircraft`, lokální/rozšířený počet letadel, SSE v1/v2, reconnect/backpressure streamu, detail a historii výběru, mapové dlaždice a zachované vrstvy, letiště, počasí, ATS, ATC kontext, sanitizaci system/public, chráněné admin operace, OGN/privacy při konfiguraci, stav trvalých notifikací, Pushover/Web Push pokud se používají a UI na mobilech/desktopu.
5. Porovnej T58 telemetrii při srovnatelné zátěži: čerstvost přijímače/zdroje, CPU, RSS/heap, P95/P99/max event loopu, DB latence/zápisy, SSE latence a chybovost. Výchozí a následná měření musí mít srovnatelný počet letadel i časová okna. Vysvětli nejistotu, špičky i rozdíly v provozu; netvrď nepodložené zlepšení.
6. Při kritické regresi zastav další push, zachyť logy a použij pouze schválenou obnovu kompatibilní se schématem popsanou v `deploy/recover-previous-build.sh`; `rollback-native.sh` nepoužívej jako náhradu plného rollbacku aplikace. Migrace se automaticky nevracejí. Pokud není bezpečná obnova schválená nebo jsou nesplněné předpoklady, nahlas NO-GO a zachovej data.
7. Pokud chybí přístup k živému serveru nebo oprávnění, dokonči implementaci, testy a GitHub kontroly v největším bezpečně dosažitelném rozsahu, produkční ověření výslovně označ **NOT DONE** a přilož přesné příkazy pro provozovatele. Netvrď, že nasazení proběhlo. Nenechávej nekonzistentní částečnou změnu bez souhrnu.

## 8. Závěrečný report (povinný)

Připrav stručný, důkazy podložený závěrečný report v češtině:

1. Rozsah a přesné výchozí/aktuální SHA, odkazy na PR/commity, skutečně spuštěné testy, produkční verze/SHA a stav nasazení.
2. Všechny nálezy P0/P1/P2/P3: reprodukované, vyvrácené, zmírněné nebo blokované; odkazy na přesné soubory/commity bez neověřených tvrzení.
3. Smazané soubory, změněné moduly, důvody mrtvého kódu, produkční LOC/test LOC/verzované soubory před/po a přidané závislosti/migrace (obvykle žádné).
4. Pokrytí bezpečnosti/soukromí i funkcí KEEP/REMOVE; přesný seznam neověřených KEEP ID a mezer kompatibility externího API.
5. Kvalitativní gate a URL spuštění: kompletní Vitest, lint, typecheck, npm audit, CodeQL, DB integrace, browser smoke a syntetické škálování.
6. Produkční CPU, RSS, P95/P99 event loopu, SSE, DB a čerstvost zdroje před/po při srovnatelné zátěži, případně výslovně nedostupné údaje.
7. Zbytková rizika, blokace vyžadující ruční schválení, pokyny k obnově a jasné rozhodnutí GO / NO-GO.

**Definice dokončení:** Žádná potvrzená chyba P1 nezůstane neopravená; každá změna má regresní test; žádná funkce KEEP neutrpí regresi; mrtvý kód se odstraňuje jen s důkazy o nepoužívání; bez snížení ochrany soukromí; všechny povinné kontroly jsou zelené pro přesné release SHA; produkce je nasazena a pozorována jako zdravá s měřitelnou srovnatelnou baseline — jinak musí být jasně označeno, že brání důkazy či oprávnění. Nevymýšlej výsledky gate ani nenaznačuj úspěch produkce jen na základě merge.
