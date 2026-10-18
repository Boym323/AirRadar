# AirRadar — plán konsolidace, refaktoru a bezpečného nasazení

[English](../../agents/AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md)

**Datum:** 18. 10. 2026  
**Cílový projekt:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar)  
**Produkční URL:** https://airradar.pomykal.cz  
**Druh dokumentu:** pracovní zadání pro Codex — výchozí postup je vývoj přímo v `main` a automatické CI/CD; nejde o povolení destruktivních změn  
**Výchozí auditovaná revize:** `cd15f4496c2d12359ebaea0666aed47b2c33e57a` (při spuštění ověřit aktuální `main` i nasazený commit)

> **Hlavní pravidlo:** Zjednodušovat na základě důkazů. Vývoj probíhá na **`main` bez automatického vytváření nových větví a PR** v odděleném vývojovém checkoutu (ne v živém `/var/www/airradar`). Po dokončených lokálních kontrolách malé commity pushuj do `origin/main` a sleduj existující automatický release. Veřejné **čtení sanitizovaných provozních/admin diagnostik** je záměrná funkce; zápisy a tajné údaje veřejné nejsou.

## 1. Cíl a definice úspěchu

Vytvořit z AirRadaru jednodušší, lépe pochopitelný, bezpečnější a výkonnostně předvídatelný systém při zachování jeho skutečné hodnoty: vlastní ADS-B příjem, živý radar, SSE, historii letů a tras, informace o letadlech a letištích, navigační/ATC a meteorologický kontext a vědomě provozované doplňky.

Nejde o kosmetické přeskupení souborů ani o dosažení libovolného procenta smazaných řádků. Výstupy: podložený katalog KEEP / DELETE / MERGE / DEFER, malé samostatně testované commity v `main`, měření před/po, aktualizovaná dokumentace a bezpečná produkční validace.

**Akceptační kritéria:**

1. Žádná regrese identity ICAO, dekódování BEAST/Mode-S, zdrojové provenience, perzistence, SSE, watchlistu/alertů ani provozního zabezpečení.
2. Žádná nová druhá ingest smyčka, nezávislý vlastní stav letadel či další trvalé paralelní výpočty bez odůvodnění.
3. Srovnatelné výsledky výkonu a uživatelských funkcí: CPU, RSS/heap, event-loop P95/P99/max, GC, DB latence, SSE a browser gate. Pokud data nejsou srovnatelná, uvést „výsledek neprokázán“.
4. Snížení zbytečného aktivního kódu, duplicit a trvale běžících funkcí; archivní přesuny odlišovat od reálného zrychlení.
5. Všechny změny nezávisle revidovatelné a vratné; migrace nikdy nemažou produkční data bez samostatného schválení.
6. Nová dokumentace v repozitáři respektuje EN/CZ pravidla a `npm run docs:check`.

## 2. Zdroje pravdy a pořadí čtení (šetření tokeny)

V konkrétním aktuálním checkoutu nejdříve přečti:

1. `AGENTS.md` (nadřazená pravidla pro Codex)
2. `docs/CODEX-CONTEXT.md` (router na relevantní soubory)
3. `docs/RUNTIME-INVARIANTS.md`, `docs/DATA-FLOWS.md` pro ingest a SSE
4. `docs/DEVELOPMENT.md`, `docs/RELEASE.md` pro vývoj, CI, migrace a produkci
5. `docs/FEATURES.md` či `docs/features.registry.json` **selektivně**, pouze pro právě řešenou funkci

Nečti plošně `CHANGELOG.md`, všechny dokumenty ani historické artefakty. Staré audity nejsou důkaz aktuálního produkčního stavu. Aktualizuj kořenový `AGENTS.md`, `docs/DEVELOPMENT.md` a `docs/cs/DEVELOPMENT.md` tak, aby pro tento projekt výslovně dovolovaly přímý vývoj v `main`; v současném stavu jej zakazují. Dokumentace musí odpovídat aktuálnímu kódu; české ekvivalenty udržuj konzistentní.

## 3. Nezměnitelné hranice

**Trvale chránit:**

- Primární lokální `readsb`/BEAST příjem a fungující JSON fallback; jediný `AircraftStateService` v jednom Node procesu.
- Rust BEAST parser a CRC24 včetně TS fallbacku a parity; Rust nepřepisovat plošně.
- Sekvenci `readsb → RAM → SSE`, ohraničené fronty, backpressure, odběr/připojení klientů.
- PostgreSQL historii, migrační řetězec, `FlightPosition`, ACARS/VDL2 historické trasy a bezpečné zpracování doplňkových zdrojů.
- Anonymizaci veřejných API, původ dat, správné rozlišení LOCAL/NETWORK a geografických/časových hodnot.
- Bezpečnost přístupu, smlouvy veřejných API a související testy.

**Zakázáno bez zvláštního povolení:**

- Neověřený push do `main`, force-push, `git reset --hard` sdílené historie, obcházení CI nebo souběžné pushnutí dalšího runtime commitu před vyhodnocením předchozího deploye. Vývoj do `main` je povolen pouze po lokálních kontrolách; ruční produkční deploy a restart nejsou součástí vývoje.
- `npm run build` v `/var/www/airradar` za běhu `airradar.service`.
- Úprava produkční `.env`, databáze, přihlašovacích údajů, systémových timerů a externích providerů jen kvůli testování.
- Mazání `migrations/app/` nebo `migrations/snapshots/` bez důkazu, souhlasu a plánu kompatibility.
- Zapínání neautorizovaných providerů (zejména ADSB.lol routeset), přímé provider probe bez povolení, zveřejňování tokenů/IP přesných pozic/cookies/logů.
- Automatický rollback schématu databáze; předchozí build je obnovitelný pouze při prokázané kompatibilitě schématu.

## 4. Fáze 0 — důkazy z produkce, bez změn

1. Načti aktuální SHA `origin/main`, otevřené PR, zelené/červené CI, CodeQL a release workflow. Zjisti aktuální nasazený SHA a verzi bezpečnými **GET** požadavky na `/api/version`, `/api/health` a povolené diagnostické endpointy. Pokud je veřejné HTTP nedostupné, ověř přes existující autorizované GitHub Actions / read-only host prostředky; nic nepředstírej.
2. Před jakoukoliv změnou proveď srovnávací baseline: CPU P50/P95, RSS a heap P95, GC, event-loop P95/P99 a nejdelší stall, počet lokálních/network aircraft, SSE clients/throughput a lag, latence DB/route cache, odpovědi API a UX mobil/desktop. Používej stávající **read-only** T58 procedury a nevytvářej další ingest zátěž na produkci.
3. Zjisti, které volitelné feature flags jsou opravdu aktivní; jejich **hodnoty bez tajemství** získej bezpečným mechanismem. V `.env.example` je 141 proměnných, nejde o doklad jejich aktivního produkčního nastavení.
4. Inventarizuj skutečné využití funkcí z anonymizovaných metrik (Matomo, pokud je k dispozici), ne z odhadu. Žádné IP, ICAO hex, přesné souřadnice ani uživatelské identifikátory do reportů.
5. Ověř úmyslnou dostupnost **read-only administrátorské/provozní diagnostiky** bez loginu a samostatně ověř, zda lze bez autentizace provádět zápisy watchlistu, alertů či konfigurace. Veřejné GET mohou nabízet bezpečně filtrované informace o výkonu, provozu a integracích; nesmějí vracet tokeny, cookies, DB URL, autentizační materiál, interní chyby upstreamů, přesné polohy přijímače nebo jiné citlivé údaje. Neautorizované zápisy klasifikuj jako bezpečnostní problém a odděl `canReadPublicDiagnostics()` od `requireAdminMutation()`; nepodmiňuj veřejnou diagnostiku `WATCHLIST_ADMIN_TOKEN`.
6. Prověř GitHub pravidla pro `main` a skutečný spouštěč deploymentu. Přímé pushování má být dovoleno; stále zakaž force-push/mazání větve a vyhodnocuj CI. Změny root `AGENTS.md` jsou podle současného `scripts/release-scope.mjs` klasifikovány jako **deploy-bearing**, i když jsou dokumentační: dopad ověř a nevyvolávej nevědomky zbytečný release.

**Brána:** Ulož sanitizovanou baseline, commit SHA a přesný čas. Při nepřístupné produkci pokračuj pouze se statickým/development auditem, nikoli s výrokem o produkčním výkonu.

## 5. Fáze 1 — inventura a rozhodovací matice

Pro všechny kandidáty proveď minimálně: statickou dohledatelnost importů/exportů (včetně dynamických importů), registry rout a API, `package.json`, `scripts/`, CI/workflow, dokumentaci, testy, typy, Prisma a runtime feature flags. Zvaž přímé i nepřímé konzumenty (např. veřejné URL, plánovaný job, recovery runbook, generovaný kód).

Každému kandidátovi přiřaď právě jeden výsledek:

- **DELETE:** žádný aktivní runtime/CI/externí konzument, dostupný rollback, odstranění je přínosné.
- **MERGE:** více implementací stejné odpovědnosti; vytvořit jediného vlastníka a odstranit starou cestu až po paritních testech.
- **KEEP:** jasná uživatelská nebo provozní hodnota a adekvátní náklady.
- **DEFER:** potřeba aktuálních dat o využití/výkonu, nelze bezpečně rozhodnout.

Vypracuj pro každou položku: cesta, důvod, důkaz využití/nevyužití, aktivní flag, dopad na CPU/RAM/I/O/DB, riziko, testy, doporučení, nejmenší bezpečný commit v `main` a plán obnovy.

### Konkrétní kandidáti — nikoli příkazy ke smazání

| Oblast / soubory | Směr | Co musí být prokázáno |
|---|---|---|
| Historické soubory `artifacts/`, `artifacts/performance/`, `flightaware-route-audit.json`, `data/runtime-telemetry-v1.json`, verzované historické snímky `data/weather-radar/` | ARCHIVE/DELETE z aktivní větve | Nesmějí být fixture, nutný rollback ani aktuální vstup; archiv musí zachovat důležité důkazy a licence. |
| `lib/server/adsblol-failover-provider.ts` proti `lib/server/network-failover-provider.ts` | DELETE/MERGE | Nesmí existovat aktivní import nebo konfigurace starého provideru. |
| `components/aircraft-detail-v2.tsx` a `components/aircraft-detail-v3.tsx` | MERGE | V3 je aktuální page owner, ale V2 může exportovat sdílené karty/formátovače a má další konzumenty. |
| `components/airradar-app.tsx` (~3828 řádků, 96 importů, 72 výskytů `useEffect`) | REFACTOR | Zredukovat orchestrátor bez nového nezávislého SSE klienta, polleru nebo mapového stavu. |
| `app/globals.css` (~7272 řádků) | REFACTOR | Až po skutečném mapování CSS selektorů, DOM a screenshotů všech důležitých breakpointů. |
| `lib/server/aircraft-state.ts` (~1896 řádků) | REFACTOR | Jeden state owner, izolované ingest/projekce/history writer/volitelné procesory, stejná semantika. |
| `lib/server/history.ts`, `lib/server/system-status.ts` | REFACTOR | Zachovat SQL limity, streaming, diagnostické hranice a dostupnost lokálního radaru. |
| `lib/track-fusion/*` a `lib/aircraft/source-merge.ts` | EXPERIMENT → KEEP/MERGE/DELETE | Shodný replay, zlepšení správnosti/freshness, porovnatelné CPU/RSS, evidence validity shadow. |
| `lib/operational-twin/*`, `lib/server/operational-twin.ts`, `lib/server/predictive-readiness.ts` | CONSOLIDATE | Skutečný veřejný přínos, readiness data, rozhodnutí o V2/V3 a důkaz, které kalibrace dál potřeba. |
| `lib/server/sondehub-mqtt.ts` proti REST SondeHub | OPTIONAL/DELETE | Doložená hodnota MQTT nad REST a aktivní používání. |
| NOAA Space Weather, ALADIN/ICON wind compare, nepotřebné vizualizace/recapy | DEFER nebo OPTIONAL | Anonymous usage a skutečné náklady; nikdy nemaž klientskou funkci jen podle názvu. |
| Workflow a T57/T58/T5x, `scripts/production-gates.mjs` (~3009 řádků) | CONSOLIDATE | Zachovat povinné safety gates; eliminovat jen opuštěné nebo redundantní cesty, ne měření aktuálních stallů. |
| 141 položek `.env.example` | CONFIG HYGIENE | U každé ověřit reálného konzumenta, fallback, kompatibilitu a migrační plán; neřídit se samotným počtem. |
| `migrations/snapshots/`, `migrations/app/` | KEEP do rozhodnutí | Potřebné k Prisma 8 contract/migration historii a recovery, nelze plošně mazat. |

## 6. Fáze 2 — realizace přímo v `main`

**Výchozí politika:** Nezakládej automaticky pracovní větve, worktrees navázané na nové větve ani PR. Běžné změny připravuj ve **vývojovém checkoutu na `main`**, nikoli v `/var/www/airradar`, který obsluhuje produkci. Paralelní agenti nesmějí současně zapisovat do stejného checkoutu nebo pushovat do `main`; určete jediného zapisujícího koordinátora. Pro případné paralelní čtení použij oddělené read-only checkouty. Každá ucelená oprava tvoří malý atomický commit.

**První změna:** Sjednoť závazná instrukční místa v `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/cs/DEVELOPMENT.md`, `docs/CODEX-CONTEXT.md`, `docs/cs/CODEX-CONTEXT.md` a zde. Odstraň pravidlo „pro každou změnu branch a PR“; zachovej pravidla CI, bezpečnosti a release. Uvědom si, že root `AGENTS.md` není ve výčtu bezpečných dokumentačních souborů v `scripts/release-scope.mjs` — jeho push nyní aktivuje produkční release. Před pushnutím toto chování výslovně zohledni, případnou klasifikaci uprav až s cíleným regresním testem a nevypínej další release gates.

**Postup:**

1. `git fetch origin main` a `git pull --ff-only origin main` **ve vývojovém checkoutu**, ověř `git status` a shodu s upstreamem. Nedovol přepsání cizí rozpracované práce.
2. Ověř dopad změny, referenční import graf a všechny veřejné kontrakty; nevytvářej abstrakce bez konkrétního užitku.
3. Proveď úzkou změnu; spusť cílené testy, typecheck, lint a dle dopadu browser/Rust/performance gates **před** pushnutím. Build i testy běží izolovaně mimo produkční checkout.
4. Použij explicitní `git add <cesty>` a jeden atomický commit. Nepoužívej force-push ani automatické komity neznámých souborů.
5. Před pushem vyhodnoť `scripts/release-scope.mjs` na konkrétním diffu. **Push do `main` může okamžitě spustit produkční deploy.** Pushej jediný připravený commit a ověř následné CI, CodeQL a deploy. Další změnu zveřejni až po vyhodnocení předchozí.
6. Při červeném CI nebo produkční regresi další postup pozastav; oprav malým novým commitem nebo připrav revert commitu bez přepisování historie. Neprováděj destruktivní rollback DB.
7. Do hlášení uváděj SHA, změněné cesty, skutečně spuštěné testy, status CI a nasazený SHA, nikoli číslo PR.

**Pořadí konsolidace:**

- **Commit A / veřejné diagnostiky a ochrana zápisů:** Zachovej veřejně čitelnou diagnostiku, ale odděl práva pro GET a mutace. Citlivé administrátorské zápisy musí vyžadovat autentizaci i při dostupnosti diagnostik. Doplň negativní testy na redakci secrets a odmítnutí anonymních zápisů.
- **Commit B / úklid:** Odstraň prokazatelně nepoužívané adaptéry a archivy s ohledem na fixtures, rollback a licenční informace.
- **Commit C / frontend:** Zmenši `airradar-app.tsx`, bez duplikace SSE/MapLibre lifecycle. Po každé viditelné změně browser smoke desktop/mobil.
- **Commit D / backend:** Rozděl orchestrace v `aircraft-state.ts`, ale zachovej jednoho state ownera, historií a datové invarianty.
- **Commit E / experimenty:** Jednotlivě vyhodnoť Track Fusion, Operational Twin a připravenost podle měřené hodnoty; nepřepínej plošně funkce.
- **Commit F / CI a konfigurace:** Čisti historické workflow a přepínače jen při zachování povinných gates.

Každý commit musí mít dohledatelné důkazy, vhodné testy a možnost návratu. Odstraňování veřejných rout, destruktivní databázové zásahy, nové providery a vědomé změny kontraktů vyžadují zvláštní schválení.

### Rozpracovaný PR #1017

Existující [PR #1017](https://github.com/Boym323/AirRadar/pull/1017) obsahuje opravu, která by **uzamkla i veřejnou diagnostiku** za admin session, a to odporuje novému požadavku. **Neslučuj ho v této podobě.** Selektivně převezmi prokázaně bezpečné nezávislé úpravy (např. odstranění mrtvého adaptéru) a otestuj je na aktuálním `main`. Nezaměňuj veřejné čtení diagnostiky za povolení anonymních administrátorských zápisů. Stávající PR se může po převzetí bezpečných změn uzavřít jako nahrazený; nevytvářej další PR.

## 7. Fáze 3 — testování před přímým pushem

Minimální lokální brána dle dopadu změny, vždy mimo produkční checkout:

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run prisma:generate
npm run lint
npm run typecheck
npm run test:full
npm run features:check
npm run docs:check
npm run visual:check
npm run test:production -- --core
# UI změny v izolovaném sestavení:
npm run test:production:browser
# Rust/BEAST změny podle relevantní verze native/README:
cargo test --lib --manifest-path native/airradar-native/Cargo.toml
```

Ověř aktuální skripty v `package.json` a vyber relevantní gate; výsledky přehledně rozliš PASS/FAIL/NOT RUN. Pokud živý produkční checkout brání typecheck/build, **neobcházej ochranu**; kontrolu spusť v samostatném DEV checkoutu nebo vhodném izolovaném CI prostředí **před** pushem. Větve/PR nejsou povinné, ale přímý push znamená, že GitHub CI se spustí až po integraci commitu — proto jsou pre-push testy zásadní. Vhodné testy admin diagnostiky: veřejný GET bez cookie vrací úmyslně povolené hodnoty bez tajemství, public DTO zůstává redigované, anonymní zápis vrací 401/403, autorizovaný zápis funguje.

Performance: srovnávej CPU/RSS/event loop/GC/SSE za stejných podmínek a počtu vzorků; krátký mikrobenchmark neprokazuje zlepšení celého systému. Bez důkazu nesděluj „optimalizace PASS“.

## 8. Fáze 4 — automatický produkční release z `main`

GitHub Actions po pushnutí do `main` spouští `release-scope`, `release-validate`, `release-tests`, `release-performance` a za úspěchu příslušné release podmínky i `deploy`. Dokumentační změny v `docs/*.md` jsou non-deploy; **kořenový `AGENTS.md` je aktuálně výjimka**, kterou klasifikátor řadí mezi deploy-bearing změny.

**Pro běžný rozpracovaný vývoj je výslovně zvolen přímý push do `main` a standardní automatický deploy.** Nepotřebuješ pro každý commit nové svolení ke standardnímu automatickému nasazení. Toto povolení **neplatí** pro ruční produkční release/restart, změnu produkční `.env`, API secrets, destruktivní DB změny, obcházení checks nebo zásahy mimo aplikaci.

1. Před pushem ověř čistý relevantní diff, bezpečnost, izolovaný build/test a klasifikaci release scope. Při selhání nutné gate commit nepublikuj.
2. Pushni malý ověřený commit přímo na `origin/main`, nikdy `--force`.
3. Sleduj GitHub Actions na přesném SHA. Jestli některá kritická kontrola selže, počkej s dalším pushem a vyřeš příčinu; nikde neobcházej CodeQL, migrace ani testy.
4. Jestli CI spustí automatický release, sleduj jej do konce. Nespouštěj současně ruční `deploy/release.sh`.
5. Po nasazení ověř `/api/version` (přesné SHA), `/api/health`, veřejnou sanitizovanou diagnostiku, SSE, Rust parser/CRC, historii, desktop/mobil UI a statické JS/CSS assety.
6. Při regresi okamžitě zastav další změny; navrhni malý fix/revert s ohledem na migrace. Automatický databázový rollback ani tvrdý reset nejsou přípustné.

Pokud si provozovatel **samostatně vyžádá manuální release**, použij oficiální `docs/RELEASE.md`. Nepouštěj `npm run build` přímo v běžící produkci.

## 9. Reporting

Po každé dokončené změně česky uveď: účel, změněné soubory, SHA na `main`, lokální testy PASS/FAIL/NOT RUN, stav CI/CodeQL, status deploye, skutečné nasazené SHA, případná měření před/po a rizika. Úspěšný commit ani zelené testy nejsou důkaz produkčního nasazení; produkční stav musí potvrdit následné ověření.

## 10. Spouštěcí prompt pro Codex

```text
Pracuj v Boym323/AirRadar podle dokumentu
AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md.

Aktuální uživatelská preference: VÝVOJ PŘÍMO V MAIN, BEZ NOVÝCH BRANCHÍ A PR.
Nejprve sjednoť instrukce v AGENTS.md, docs/DEVELOPMENT.md,
docs/cs/DEVELOPMENT.md a routerech kontextu. Ověř, že změna
AGENTS.md sama může vyvolat automatický deploy, a postupuj podle
release-scope. Neobcházej CI ani release pravidla.

Veřejné GET diagnostiky ponech volně dostupné kvůli vývoji:
/api/system/status, /api/system/integrations a další provozní metriky.
Poskytuj jen explicitně bezpečný sanitizovaný obsah; žádné secrets,
cookies, DB URL, privátní souřadnice ani interní raw chyby.
Veřejná diagnostika NESMÍ umožnit anonymní zápisy watchlistu,
alertů, konfigurace či dalších administrativních dat.
Odděl čtecí a zapisovací autorizaci a doplň regresní testy.

PR #1017 NEMERGUJ beze změn: uzamkl by veřejné diagnostiky.
Převezmi jen bezpečné nezávislé opravy po prověření a testování.

Pokračuj v architektonické konsolidaci KEEP/DELETE/MERGE/DEFER,
ale dělej malé navazující commity přímo na main ve vývojovém
checkoutu. Každý commit otestuj PŘED pushnutím a po pushnutí
zkontroluj CI, CodeQL, automatický deploy a výsledné produkční SHA.
Nikdy nestav aplikaci přímo ve stále běžícím /var/www/airradar.

V případě selhání zastav další push; zachovej historii bez force
push, neopravuj chybu obcházením gate a nemaž produkční databázi.
Průběžně reportuj výsledky česky.
```

---

**Poznámka:** Původní inventarizace a počty souborů pocházejí z auditu 18. 10. 2026. Při každém novém kroku ověř aktuální stav. Tento dokument nenahrazuje kontrolu skutečné produkce ani nezakládá právo provést destruktivní změnu.