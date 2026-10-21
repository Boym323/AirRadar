# AirRadar — prováděcí zadání: audit, opravy, odstranění mrtvého kódu a produkční nasazení

**Datum zadání:** 2026-10-21
**Repozitář:** https://github.com/Boym323/AirRadar
**Cílová větev:** \`main\`
**Charakter dokumentu:** prováděcí prompt pro vývojového agenta s přístupem k repozitáři, CI a případně k produkci; **nejde o důkaz, že úkoly již byly vykonány**.
**Referenční revize při sepsání:** \`4c85fec9ad46cfab9f72452ef987ccf5916fe2a6\`. Před změnami ověř aktuální SHA a nevycházej ze zastaralých auditů.

## 0. Zadání pro vykonávajícího agenta

Jsi seniorní TypeScript/Next.js/Rust/PostgreSQL engineer, bezpečnostní auditor a SRE projektu AirRadar. Tvým úkolem je **skutečně provést** níže popsané úpravy v aktuálním zdrojovém kódu, zrevidovat a odstranit nepotřebné soubory, importy, styly, kód a závislosti, spustit odpovídající testy a **bezpečně dovést změny do produkce pomocí existujícího release procesu**. Nestačí vypracovat další návrh nebo tvrdit, že staré CI už bylo zelené.

Pracuj autonomně v logických etapách, pokud máš odpovídající oprávnění. Neschovávej chyby ani nepřeskakuj gate kvůli rychlosti. **Pokud nesplníš produkční gate, zastav produkční nasazení a přesně popiš blokaci.** Nikdy nepředstírej přístup k produkci, úspěšné testy, nasazení či rollback. Každou opravu podlož konkrétními soubory, testem a měřením.

V produkčním runtime chraň nepřerušený příjem ADS-B, aktuální mapu, data a historii. Neprováděj destruktivní SQL ani reset PostgreSQL, nepřepisuj konfiguraci reverse proxy, neměň produkční tajemství, nesmaž historii, runtime state, zálohy nebo migrační soubory. Nové DB migrace a změny schématu jsou mimo rozsah této práce: pouze bezpečná read-only diagnostika kompatibility. Pokud je změna schématu nezbytná, vyčleň ji jako zdokumentovaný blokér dalšího samostatného schválení.

## 1. Nejdřív ověř skutečný stav a zásady projektu

1. Přečti \`AGENTS.md\`, dále jen dokumenty skutečně relevantní k úkolu: \`docs/CODEX-CONTEXT.md\`, \`docs/ARCHITECTURE.md\`, \`docs/DATA-FLOWS.md\`, \`docs/RUNTIME-INVARIANTS.md\`, \`docs/RELEASE.md\`, \`docs/DEVELOPMENT.md\`, \`docs/features.registry.json\`, \`docs/FEATURES.md\` a aktuální matici zachování funkcí. Historické audity v \`docs/audits/\` jsou vodítka, nikoliv důkaz aktuálního běhu.
2. Zjisti aktuální HEAD, čistotu working tree, aktivní pull requesty, změny od referenční revize a stav posledních Actions na **shodném SHA**. Respektuj cizí souběžné změny. Žádné force-pushy.
3. Ověř aktuální produkční \`/api/version\`, \`/api/health\`, veřejně bezpečnou projekci \`/api/system/status\`, dostupnost webu, SSE a provoz služby \`airradar.service\`. Pokud nemáš přístup, napiš přesně co chybí.
4. Pracuj v **odděleném nevysílajícím vývojovém checkoutu**; produkční \`/var/www/airradar\` nepoužívej pro lokální build ani refaktor. Nikdy nespouštěj \`npm run build\` přímo na běžícím produkčním checkoutu.
5. Projekt preferuje malé, nezávisle ověřené commity na \`main\` bez rutinních PR. **Lokální commity ale neposílej jednotlivě do \`main\`**, dokud neprojdou kontroly celé sekvence: push aktivuje automatické nasazení. Před jediným kontrolovaným non-force pushem znovu synchronizuj \`origin/main\`, zkontroluj diff a release-scope. Pokud není možné zaručit atomicky bezpečné odeslání, zastav a popiš konflikty; nevytvářej libovolné paralelní větve.
6. Vstupní referenční soubory: \`docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json\`, \`docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json\`, \`docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json\`, \`scripts/selected-feature-premerge-audit.mjs\`. Aktuálně revidovaná matice obsahuje **79 KEEP a 99 REMOVE**; původní 88/90 není platný cílový stav. Před akcí ověř, že nebyla aktualizována.

## 2. Neprolomitelné funkční a provozní invarianty

- Zachovej **všech 79 KEEP funkcí** podle přesného popisu v aktuálním katalogu, nejen existenci souboru nebo API. Je nutné ověřit jejich skutečné chování. Odstranění 99 REMOVE nesmí rozbít společné závislosti KEEP funkcí.
- Zachovej lokální \`readsb JSON\` a BEAST TCP, Rust BEAST parser a CRC24, failover, jediného vlastníka \`AircraftStateService\`, deduplikaci ICAO, identitu letadel, lokální/rozšířené pokrytí a stabilitu při pádu externích integrací.
- Zachovej mapu MapLibre, letadla, orientaci, barvy, filtraci, výběr, detail, trajektorii, SSE V1/V2, delta aktualizace, heartbeaty, omezenou frontu pomalých klientů, ukládání vzorkované historie a přístup k historickým detailům.
- Zachovej výslovně vybrané ATC/ATS/NAVAID, Navigation Integrity, Airport, METAR/TAF/SIGMET/weather radar, OGN/FLARM s fail-closed DDB soukromím, RXW Hub a ostatní integrované zdroje v rozsahu matice KEEP.
- Zachovej runtime diagnostiky, T58, produkční health a release gates. Veřejná anonymizovaná \`/api/system/*\` GET diagnostika je **záměrně veřejná**, podle \`AGENTS.md\`; neomezuj ji bezdůvodně admin loginem. Plné interní a privátní administrační informace musí být chráněné.
- Zachovej Pushover/Web Push rozsah deklarovaný KEEP maticí, ale neobnovuj odstraněný alert/fleet/watchlist engine bez explicitního důvodu a schválení změny rozsahu.
- Zachovej existující PostgreSQL historii a data, OGN DDB cache, web-push subscription state, runtime soubory, migrační historii, bezpečné public DTO a pravidla atribuce poskytovatelů.
- Respektuj aplikační timezone \`Europe/Prague\` a rozhraní \`APP_TIMEZONE\`; datumy SQL a letové identity nesmí být chybně posunuty.
- Žádné neověřené změny formátu wire/API bez kompatibilitních testů. Když nejde dosáhnout ekvivalence, opravu bezpečně izoluj a nepublikuj ji.

## 3. Fáze A — dokumentovaná výchozí baseline

Před prvním kódovým patchem vytvoř read-only baseline a ulož stručný strojově čitelný i lidsky čitelný výsledek.

- Změř počet verzovaných produkčních a testovacích řádků pomocí existujícího projektu, rozložení podle adresářů, velikost distribuovaného bundle, počet aktivních API, balíčků a dosažitelných entrypointů. Výchozí graf kódu v README musí zůstat funkční.
- Na produkci (pokud je přístup) získej reprezentativní T58 interval: počet lokálních/rozšířených letadel, stáří readsb/BEAST snapshotu, CPU, RSS, heap, event-loop P50/P95/P99/max, SSE klienty/payload, DB write rate/latence, hot paths, stav upstreamů. **Nikdy nevymýšlej metriky.**
- Srovnávej před/po při přibližně srovnatelném provozu. Syntetické testy při 1×/2×/4× zatížení jsou doplňkem, ne náhradou reálného srovnání.
- Ověř, že existuje použitelný plán návratu předchozího buildu a známá kompatibilita datového schématu; bez zásahu do DB nebo proxy. Jestli provozní bezpečnost nelze prokázat, zaznamenej NO-GO a změny zatím nenasazuj.
- Ověř závislosti a bezpečnostní advisory aktuálních verzí; \`npm audit --omit=dev --audit-level=high\`; neaktualizuj závislosti naslepo.

## 4. Fáze B — opravy P1 (nejvyšší priorita)

### B1: Notifikační kanály a stav SENT
Prostuduj \`lib/server/alert-delivery-worker.ts\`, \`lib/server/alerts-fleets-repository.ts\`, \`lib/server/web-push.ts\` a související testy.

**Přímo identifikovaná chyba:** worker volá \`markDeliverySent()\` i po větvi, která zná pouze \`PUSHOVER\`; cizí kanál může být potvrzen jako odeslaný bez transportu.

- Implementuj explicitní dispatch pro skutečně podporované kanály. Neznámý nebo nepodporovaný kanál = bezpečně \`FAILED\` / chybový stav, nikoli \`SENT\`.
- Zamez falešnému úspěchu, i když poskytovatel vrátí HTTP 2xx s chybovou odpovědí, pokud to jeho protokol připouští.
- Prověř lease/claim/recovery, souběžné instance, opakování po restartu, počet pokusů, retry/backoff a idempotenci; neopakuj úmyslně doručení bez kontroly duplicitních efektů.
- Přidej reálné izolované regresní testy pro známý a neznámý kanál, timeout, provider 429/5xx, dvojí worker, vypršený claim a restart.

### B2: Admin autentizace a veřejná sanitizovaná diagnostika
Prostuduj \`lib/server/watchlist-auth.ts\`, všechny \`app/api/admin/**\`, \`app/api/system/**\`, \`app/api/watchlist/session/**\`.

- \`isWatchlistSessionValid()\` vrací při \`AIRRADAR_ADMIN_AUTH_ENABLED=false\` true; některé interní \`/api/admin\` GET routy ji používají. Pro každou routu rozhodni podle citlivosti a pravidel projektu, zda má zůstat veřejně sanitizovaná, nebo musí vyžadovat striktní admin autentizaci.
- Pro privilegované čtení použij \`isWatchlistAdminSessionValid()\` nebo ekvivalent fail-closed a nevyzrazuj citlivé údaje přes chyby.
- **Nezavírej** legitimní veřejné, read-only a sanitizované health/system diagnostiky jen proto, že jejich implementace používá \`full\` data.
- Všechny mutace zabezpeč autentizací a CSRF/origin kontrolou. Zvaž forwarded host/proto jen podle ověřené konfigurace důvěryhodné proxy; **neměň proxy konfiguraci**.
- Doplň testy: anonymní public read OK, anonymní admin/sensitive read DENY, anonymní mutation DENY, přihlášený admin OK, auth-disabled fail-closed pro skutečně privátní routy.

### B3: Web Push — funkční a pravdivá diagnostika
- Ověř celý tok: produkce události -> zařazení -> uložené odběry -> \`WebPushNotifier.send()\` -> výsledný stav.
- Pokud matice KEEP vyžaduje skutečné Web Push doručování, propojit jej s **existujícími zachovanými událostmi**, neobnovovat staré odstraněné alert pravidlové API. Ověř VAPID, chybové HTTP, expirované subscription, retry/failure stavy a deduplikaci.
- Pokud skutečného producenta událostí nelze bezpečně zavést v povoleném rozsahu, **neprezentuj transport jako HEALTHY nebo doručování jako funkční**. Pravdivě ukaž \`CONFIGURED\`, \`DISABLED\`, \`UNAVAILABLE\` či obdobný existující kontrakt a zdokumentuj blokaci.
- Přidej izolovaný end-to-end test s mockovaným push poskytovatelem a uloženým subscription.

## 5. Fáze C — opravy P2 a stabilita

### C1: Web Push zápisy a validace
- \`lib/server/web-push-store.ts\`: odstraň lost-update race způsobený \`read -> modify -> write shared .tmp -> rename\`.
- Zaveď serializované zápisy, atomickou náhradu, unikátní temp soubory a bezpečné file permissions. Pokud provoz podporuje více Node instancí, zvaž cross-process locking; samotný JS mutex nestačí.
- Omez velikost JSON těla, endpointu a klíčů, validuj strukturu a protokol, bezpečně vracej 400 pro invalidní JSON.
- Paralelní registrace a mazání musí zachovat očekávaný výsledek; přidej race test.

### C2: System status SSE a diagnostická zátěž
- \`lib/server/system-status-stream.ts\` volá \`readSystemStatus()\` každých 5 s s výchozím režimem \`full\`. Odděl lehkou veřejnou a bohatší admin projekci bez zbytečných DB/provider dotazů.
- Zachovej jedno sdílené polling jádro, bounded SSE, heartbeaty, sanitizaci, kapacitu a současné chování klientů. Nepřidej DB dotaz na každého připojeného klienta.
- Testuj anonymní stream, administrátorský stream, počet provedených DB dotazů, připojení/odpojení a 429/503 kontrakt podle existujících invariantů.

### C3: DeliveryHealth agregace
- \`lib/server/alerts-fleets-repository.ts\`: \`deliveryHealthSnapshot()\` nyní načítá všechny řádky \`AlertDelivery\` a agreguje je v Node.
- Přesuň počty a agregace do ohraničených SQL dotazů nebo vytvoř kompatibilní agregovanou projekci bez migrace. Historii nemaž.
- Porovnej výsledky se současnou logikou a změř čas/memory při velkém počtu záznamů. Zachovej stávající API kontrakt.

### C4: Historie Navigation Integrity
- \`lib/server/navigation-integrity.ts\`: dotaz s \`limit(200)\` filtruje část časového okna až po načtení, takže může vynechat relevantní anomálie.
- Aplikuj požadované časové hranice v databázové query, zajisti stabilní řazení a stránkování nebo jednoznačnou informaci o truncation.
- Přidej test přes 200 záznamů a přes hranice \`from\`/\`to\`, výpadek DB a fallback bez mylného tvrzení úplnosti.

### C5: Prisma RC kompatibilita
- \`package.json\`: runtime \`@prisma/orm-postgres@8.0.0-rc.9\`, CLI \`prisma@8.0.0-rc.13\`. \`prisma/contract.prisma\` má převážně modely bez \`@@map\`.
- Proveď audit přes \`scripts/audit-prisma-rc-mapping.mjs\` proti **skutečnému read-only katalogu** PostgreSQL, pokud je k dispozici.
- Bez samostatného bezpečnostního ověření **neupgraduj Prisma, negeneruj databázové DDL, nespouštěj reset a nepřidávej migrace**. Zdokumentuj bezpečnou kompatibilitní cestu, riziko není důvod k automatické změně databáze.

### C6: Další příbuzné problémy, které najdeš během revize
V mezích stejného rozsahu oprav chyby validace API, neodchycené promise, neuzavřené streamy/timery, neohraničené cache, N+1 dotazy, race conditions a chybnou klasifikaci \`HEALTHY\`/\`DEGRADED\`/\`DISABLED\`. Každý nový nález musí mít reprodukci a regresní test. Nevyvolávej nové síťové dotazy v hot path \`readsb -> RAM -> SSE\`.

## 6. Fáze D — skutečné odstranění nepotřebného kódu a refaktor

Před mazáním sestav statickou i runtime **mapu dosažitelnosti** od všech aktivních Next.js pages/API, \`instrumentation.node.ts\`, \`package.json scripts\`, CI workflow, deploy/systemd služeb a timerů, dynamických importů, React hooků, CSS selektorů, i18n klíčů, veřejných assetů a importovaných dat.

1. Vyhledej nedosažitelné \`.ts/.tsx/.js/.mjs\` moduly, exporty, funkce, typy, překlady, CSS selektory, testy, skripty, benchmarky, veřejná media, závislosti a přepínače odstraněných funkcí. Konzervativně zacházej s dynamickými referencemi, importem za běhu a external CLI.
2. Kandidáta smaž až tehdy, když prokážeš **nulové potřebné volání**, pokrytí běžících i vypnutelných KEEP scénářů a přidáš odpovídající regresní kontrolu. Nepovažuj nízké využití funkce ani samotnou absenci importu za důkaz, pokud existuje externí API klient či runtime data.
3. Vyřaď dříve odstraněné UI/analytické funkce pouze podle REMOVE matice. Zachovej sdílené závislosti KEEP funkcí (například aircraft history/detail, current ATC sektory, ATS, weather/OGN, RxW, push a T58).
4. V \`lib/server/history.ts\` odděl zápis historie, dotazování, retention a serializaci; při odstranění legacy public history/Flight Story chování zachovej potřebné interní tabulky a sdílené objekty.
5. V \`lib/server/aircraft-state.ts\` odděl lifecycle, ingest, síťovou deduplikaci/failover, history sampling, enrichment, ATC práci a diagnostiku, pokud lze ověřit nulovou změnu funkčního chování a procesního vlastnictví.
6. V \`components/airradar-app.tsx\` (referenčně cca 2 275 řádků) odděl řízení mapy, výběru letadel, navigace, panelů, streamu a UI hooků; zachovej MapLibre hlavní mapu, mobilní drawer i detail. Nefragmentuj komponenty bez důvodu.
7. \`app/globals.css\` (referenčně přes 7 tisíc řádků) rozděl podle komponent a stran do modulů, odstraň pouze nepoužívané deklarace po vizuálním ověření všech viewportů.
8. \`lib/server/system-status.ts\` rozděl po doménách až po zajištění ekvivalence veřejné/admin serializace a telemetry.
9. Odstraň nepoužívané npm dependencies pouze po ověření runtime, build, CI a command line skriptů. Respektuj licenční/provenance soubory a povinné assety.
10. Každé odstranění eviduj v tabulce: **soubor/symbol, důkaz nepotřebnosti, KEEP/REMOVE vztah, riziko, test, počty odstraněných řádků**. Nepoužívej plošné regex mazání bez ruční revize diffu.
11. Měř \`production LOC\`, \`test LOC\`, velikost buildu, počet modulů a dopad na CPU/paměť před/po. Pod hranicí 100 000 produkčních řádků projekt již je; **neoptimalizuj na samoúčelný počet řádků**. Preferuj srozumitelnost, bezpečnost a provozní úsporu.
12. Aktualizuj \`docs/features.registry.json\`, regeneruj \`docs/FEATURES.md\` při změně rout a oprav dotčené odborné dokumenty, české překlady tam, kde existují. Zachovej graf \`docs/metrics/code-growth.svg\`, \`docs/metrics/code-history.json\` a workflow aktualizace.

## 7. Fáze E — povinné testy a měření

Ve vývojovém prostředí spusť odpovídající kompletní sadu, minimálně:

\`\`\`bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm run test:full
npm run features:check
npm run docs:check
npm run visual:check
npm run icons:audit
node scripts/selected-feature-premerge-audit.mjs
node scripts/audit-code-footprint.mjs
npm run test:production:all
npm run benchmark:load-scaling
\`\`\`

Pokud \`test:production:all\` nebo benchmark vyžaduje izolované prostředí, připrav je bezpečně podle projektu. Nikdy netestuj syntetickou zátěž proti živému produkčnímu přijímači. Přidej/rozšiř cílené testy:

- Neznámý notifikační kanál nesmí skončit \`SENT\`; povolený kanál může skončit \`SENT\` pouze po skutečném přijetí providerem.
- Web Push registrace/odhlášení race test, validace nepovolených/malformovaných vstupů, reálný mock end-to-end.
- Public GET system/status a stream funguje anonymně a neodhaluje interní údaje; privátní \`/api/admin\` vyžaduje admin.
- 200+ navigation integrity anomalies v okně a přesnost SQL filtrace.
- DeliveryHealth konzistence vůči staré agregaci při velkém počtu řádků.
- Ingest BEAST/JSON parity, Rust CRC parity, single-poller, SSE V1/V2 fanout/backpressure, history persistence bez vlivu na live, OGN privacy/DDB, dostupnost cílových KEEP stránek.
- Desktop, mobil (včetně cca 375px a 821px) a změny CSS/mapy. Žádné chybějící static assets, chybné Content-Type, chyby v browser console nebo ztráta navigace.
- Statický funkční sweep přes všech 79 KEEP, doplněný vhodnými integračními/runtime důkazy. Evidence samotné existence souborů **nestačí**.

Všechny testy musí být zelené na **konečném stejném SHA**. Pokud nelze některý test spustit, označ to jako \`NOT RUN\` s dopadem, nikoli \`PASS\`. Nesnižuj kritické prahy a nemaž testy jen kvůli průchodu.

## 8. Fáze F — kontrolovaný release do produkce

**Záměr zadání zahrnuje produkční nasazení aplikace**, pokud je bezpečné, automaticky prostřednictvím existujícího CI na \`main\`. Nikdy neprováděj ruční restart nebo zásahy do infrastruktury mimo již schválený standardní release postup.

Před produkčním pushem požaduj:

- čistý revidovaný diff a žádné konflikty vůči aktuálnímu \`origin/main\`;
- dokončené opravy P1, všechny relevantní testy a build/staging browser smoke;
- úspěšné read-only prověření schématu a absence destruktivních migrací;
- ověřenou obnovitelnost předchozího buildu, databázovou kompatibilitu a provozní rollback plán; pokud chybí bezpečnostní důkazy, **NO-GO pro deploy**, i kdyby kód byl připraven;
- zachování referenčního stavu dat a napájení živého přijímače;
- baseline T58 a dopad na dostupnost;
- kontrolu, že nejsou měněny proxy, produkční secrets, SQL migrace ani trvalé letové záznamy.

Pak proveď jeden kontrolovaný non-force push ověřené série commitů do \`main\` (projektový standard), sledování kompletního workflow pro **přesné nové SHA**: CI, CodeQL, release-validate, release-tests, release-performance, browser smoke a produkční deploy. \`[skip ci]\` pro kódové změny je zakázáno. Pokud workflow selže, **nepředstírej úspěšné nasazení**. U zastavené automatizace neprováděj náhradní ruční deploy, který obejde gate.

Existující release provádí izolovaný Next build a atomickou aktivaci; do něj nezasahuj. Pokud narazíš na požadavek destruktivní migrace, nová oprávnění, změnu prostředí či nekompatibilitu schématu, zastav na NO-GO a předlož důvod.

Po dokončeném automatickém deployi:
1. Ověř produkční commit a BUILD_ID proti vydanému CI artefaktu, \`/api/version\` a \`/api/health\`.
2. Ověř server, veřejné statické assety, mapové styly/tiles, desktop + mobil, browser console, SSE obě verze včetně dlouhého spojení a reconnectu.
3. Ověř readsb JSON/BEAST, počet skutečných lokálních letadel, zdrojovou provenance, výběr letadla, detail, historii, stávající nav/ATC/ATS, weather a OGN dle zapnuté konfigurace.
4. Ověř admin/public security kontrakt, notifikace a diagnostiku, nulové falešné \`SENT\` pro neznámý kanál, a že prod queue je konzistentní.
5. Změř srovnatelný T58 interval CPU/RSS/heap/event-loop P95/P99, SSE tlak, DB latence a hot paths, kvalitu live feedu.
6. Pokud je nalezena kritická regrese, označ **NO-GO**, zastav další push. Použij pouze zdokumentovaný \`deploy/recover-previous-build.sh\` po ověření compatibility a oprávnění; nikdy neprováděj \`git reset --hard\`, DB rollback/migraci nebo destruktivní odstranění dat jako improvizaci.
7. Pokud není přístup k produkci, uveď status **DEPLOY NOT VERIFIED**; úspěch GitHub CI není automaticky důkaz koncového uživatelského fungování.

## 9. Dokumentace a závěrečný report (povinné)

Ulož do \`docs/audits/\` nový datovaný **výsledkový** report (odlišný od tohoto promptu). Zahrň:
- skutečný před/po commit SHA, datum a produkční verzi;
- nalezené chyby se závažností, root-cause, reprodukcí, konkrétními diffy a výsledky regresních testů;
- seznam změněných a odstraněných souborů, symbolů, importů a závislostí;
- tabulku dokladů pro 79 KEEP a 99 REMOVE s explicitním \`PASS / PARTIAL / NOT VERIFIED\`, plus seznam rizikových sdílených závislostí;
- počty produkčních/testovacích LOC před/po, odstraněné LOC po kategoriích, počet API, bundle size, případně objem DB dotazů;
- výsledky kompletního CI/CodeQL/browser/performance včetně URL, čísla jobu a **shodného SHA**;
- T58 srovnání CPU/RSS/P95/P99, přenosové latence, feed freshness, DB a upstream stavu;
- \`GO/NO-GO\` rozhodnutí a přesné blokéry/zbývající rizika;
- potvrzení, zda produkce skutečně běží na správném commitu, a jestli nebyly měněny DB/proxy/secrets.

Pokud byly upraveny veřejné routy nebo smlouvy, aktualizuj příslušnou dokumentaci, registry a existující české lokalizace podle \`AGENTS.md\`. V dokumentech piš anglicky, pokud jsou součástí běžné projektové technické dokumentace; tento uživatelský vykonávací prompt a závěrečné shrnutí může být česky.

## 10. Kritéria úspěchu

Úkol je dokončen pouze pokud:
- všechny reprodukované P1 nálezy jsou opraveny a mají regresní test;
- P2 nálezy jsou opraveny nebo jednotlivě označeny a důvodně zdokumentovány jako out-of-scope/blocked;
- nevyužitý kód byl **skutečně** bezpečně odstraněn; nic důležitého nebylo smazáno jen pro číslo;
- všechny 79 KEEP jsou zachovány a ověřeny na dostupné úrovni; případné nezměřené scénáře jsou označeny;
- lokální/staging testy i přesně příslušné GitHub gates prošly;
- produkční nasazení buď proběhlo s doloženou identitou a post-deploy smoke, **nebo** bylo bezpečně zablokováno s jasným NO-GO;
- finální report je uložen v repozitáři a závěrečná odpověď je stručná, faktická a česky.

**Nevracej pouze radu „lze opravit“. Proveď práci, pokud máš přístup. Nevynechej limity a nikdy netvrď, že je práce hotová, jestliže ještě chybí ověření produkce.**
