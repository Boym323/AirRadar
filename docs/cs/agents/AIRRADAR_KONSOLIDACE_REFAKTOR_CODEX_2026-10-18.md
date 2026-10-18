# AirRadar — plán konsolidace, refaktoru a bezpečného nasazení

**Datum:** 18. 10. 2026
**Cílový projekt:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar)
**Produkční URL:** https://airradar.pomykal.cz
**Druh dokumentu:** pracovní zadání pro Codex, nikoli povolení provést destruktivní změny
**Výchozí auditovaná revize:** `cd15f4496c2d12359ebaea0666aed47b2c33e57a` (při spuštění ověřit aktuální `main` i nasazený commit)

> **Hlavní pravidlo:** Zjednodušovat na základě důkazů. Nemazat funkci pouze proto, že je složitá. Neprovádět úpravy kódu ani build přímo v běžícím produkčním checkoutu. Produkční prostředí slouží při průzkumu **jen pro čtení**. Vlastní vývoj probíhá v izolované větvi / worktree; nasazení až přes existující release proces.

## 1. Cíl a definice úspěchu

Vytvořit z AirRadaru jednodušší, lépe pochopitelný, bezpečnější a výkonnostně předvídatelný systém při zachování jeho skutečné hodnoty: vlastní ADS-B příjem, živý radar, SSE, historii letů a tras, informace o letadlech a letištích, navigační/ATC a meteorologický kontext a vědomě provozované doplňky.

Nejde o kosmetické přeskupení souborů ani o dosažení libovolného procenta smazaných řádků. Výstupy: podložený katalog KEEP / DELETE / MERGE / DEFER, malé nezávislé PR, měření před/po, aktualizovaná dokumentace, bezpečná produkční validace.

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

Nečti plošně `CHANGELOG.md`, všech 190 dokumentů ani velké historické artefakty. Staré audity nejsou důkaz aktuálního produkčního stavu. Není-li tento dokument součástí repozitáře, ulož jej jako kanonický anglický soubor a český ekvivalent do `docs/`/`docs/cs/` ve stejném PR podle pravidel projektu; nevytvářej druhou politiku nahrazující `AGENTS.md`.

## 3. Nezměnitelné hranice

**Trvale chránit:**

- Primární lokální `readsb`/BEAST příjem a fungující JSON fallback; jediný `AircraftStateService` v jednom Node procesu.
- Rust BEAST parser a CRC24 včetně TS fallbacku a parity; Rust nepřepisovat plošně.
- Sekvenci `readsb → RAM → SSE`, ohraničené fronty, backpressure, odběr/připojení klientů.
- PostgreSQL historii, migrační řetězec, `FlightPosition`, ACARS/VDL2 historické trasy a bezpečné zpracování doplňkových zdrojů.
- Anonymizaci veřejných API, původ dat, správné rozlišení LOCAL/NETWORK a geografických/časových hodnot.
- Bezpečnost přístupu, smlouvy veřejných API a související testy.

**Zakázáno bez zvláštního povolení:**

- `git push` přímo do `main`, merge PR, ruční produkční deploy nebo restart během přípravné fáze.
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
5. Proveď read-only ověření, zda `AIRRADAR_ADMIN_AUTH_ENABLED` v produkci umožňuje veřejný přístup k administrátorským údajům. V kódu `isWatchlistSessionValid()` při vypnuté auth vrací `true`. Pokud je produkce skutečně vystavena internetu bez další ochrany, klasifikuj nález P0 a navrhni samostatnou bezpečnostní opravu, nikoli tichou změnu konfigurace.
6. Prověř GitHub branch protection/ruleset a skutečný spouštěč deploymentu. Dřívější API vracelo `main protected=false`; znovu ověř.

**Brána:** Ulož sanitizovanou baseline, commit SHA a přesný čas. Při nepřístupné produkci pokračuj pouze se statickým/development auditem, nikoli s výrokem o produkčním výkonu.

## 5. Fáze 1 — inventura a rozhodovací matice

Pro všechny kandidáty proveď minimálně: statickou dohledatelnost importů/exportů (včetně dynamických importů), registry rout a API, `package.json`, `scripts/`, CI/workflow, dokumentaci, testy, typy, Prisma a runtime feature flags. Zvaž přímé i nepřímé konzumenty (např. veřejné URL, plánovaný job, recovery runbook, generovaný kód).

Každému kandidátovi přiřaď právě jeden výsledek:

- **DELETE:** žádný aktivní runtime/CI/externí konzument, dostupný rollback, odstranění je přínosné.
- **MERGE:** více implementací stejné odpovědnosti; vytvořit jediného vlastníka a odstranit starou cestu až po paritních testech.
- **KEEP:** jasná uživatelská nebo provozní hodnota a adekvátní náklady.
- **DEFER:** potřeba aktuálních dat o využití/výkonu, nelze bezpečně rozhodnout.

Vypracuj pro každou položku: cesta, důvod, důkaz využití/nevyužití, aktivní flag, dopad na CPU/RAM/I/O/DB, riziko, testy, doporučení, nejmenší příslušné PR a plán obnovy.

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
| 17 workflow, T57/T58/T5x, `scripts/production-gates.mjs` (~3009 řádků) | CONSOLIDATE | Zachovat povinné safety gates; eliminovat jen opuštěné nebo redundantní cesty, ne měření aktuálních stallů. |
| 141 položek `.env.example` | CONFIG HYGIENE | U každé ověřit reálného konzumenta, fallback, kompatibilitu a migrační plán; neřídit se samotným počtem. |
| `migrations/snapshots/`, `migrations/app/` | KEEP do rozhodnutí | Potřebné k Prisma 8 contract/migration historii a recovery, nelze plošně mazat. |

## 6. Fáze 2 — realizace po malých PR

Doporučené pořadí (uprav podle výsledků skutečné inventury):

- **PR-A / P0:** Oprava případného úniku administrátorské diagnostiky a související testy; zvlášť od výkonnostního refaktoru. Nastavení pravidel GitHub branch protection navrhnout s ohledem na existující automatické metadata PR a release workflow.
- **PR-B / úklid:** Archivace historie/artefaktů, nepoužívaných adaptérových souborů; žádné mazání živých runtime state souborů, DB a migrací.
- **PR-C / frontend:** Zmenšení `airradar-app.tsx`, sjednocení map lifecycle a CSS. Respektuj již existující `components/radar/`, neduplikuj je novou sadou.
- **PR-D / backend:** Výslovné rozdělení orchestrace/ingest/history/stats v `aircraft-state.ts`; zachování jednoho `globalThis` state ownera.
- **PR-E / experimenty:** Jeden po druhém rozhodnout Track Fusion, Operational Twin, readiness, další nadstavby; nikdy nevypínat vše najednou, před odpojením každé lane porovnat výsledek.
- **PR-F / CI/config:** Konsolidace historických benchmarků, workflow a nepoužívaných flagů. Neomezuj základní testy, CodeQL, T58 důkazy a release gate.

Každý PR musí mít: (a) odstraněný/změněný graf závislostí, (b) behaviorální a paritní testy, (c) před/po metriky, (d) seznam odstraněných souborů a dostupnost jejich historie, (e) návratový postup, (f) krátký CHANGELOG/ADR dle pravidel.

Před odstraňováním veřejných stránek, API, schématu nebo databázových dat předlož přesnou změnu veřejného kontraktu a vyžádej výslovné schválení provozovatele. Neprováděj „cleanup“ v rozsahu, který mění cizí klienty bez plánu kompatibility.

## 7. Fáze 3 — testovací brány

Nejen zelené jednotkové testy. Pro příslušné PR spusť:

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
# Pro změny UI až v izolovaném buildu / CI:
npm run test:production:browser
# Pro Rust/BEAST změny dle existujících CI/README:
cargo test --lib --manifest-path native/airradar-native/Cargo.toml
```

Ověř, zda výše uvedené příkazy odpovídají **aktuálnímu** `package.json`; nepředpokládej, že lokální stroj smí spustit produkční browser gate bez izolace a přístupových oprávnění. Než provedeš změnu modelů, použij oddělenou `airradar_dev` a ověř skutečný target; produkční schéma nikdy nemaž.

U výkonových úprav spusť stávající odpovídající benchmarky a srovnávací load testy; neinterpretuj mikrobenchmark jako celkový produkční výkon. Rust/TypeScript fallback a parity 1:1, SSE connect/reconnect, žádné ztracené zprávy či únik posluchačů, zdravý start/stop. Pokud test selže, PR neopravuj obcházením gate ani zvyšováním timeoutu bez příčiny.

Zvláště důležité: nedávný T58 Controlled Stall Canary měl ve 61 vzorcích jednu blokaci s maximem 1577,736 ms, takže nesmíš prezentovat event-loop stall problém jako definitivně vyřešený.

## 8. Fáze 4 — produkční release, teprve po schválení merge

AirRadar má **automatický release pipeline po push/merge do `main`**. Samostatné změny nejdřív připrav do PR, použij label `release-preview` (pokud je potřeba kompletní předprodukční build+browser/performance gate), ověř PASS CI, typecheck, CodeQL, migrace, browser a performance.

**Bez výslovného dalšího pokynu provozovatele nemerguj PR ani nespouštěj deploy.** Dokument sám takové oprávnění není.

Po schváleném merge:

1. Sleduj GitHub Actions `CI` na přesném SHA `main` a joby `release-scope`, `release-validate`, `release-tests`, `release-performance` a `deploy`.
2. Preferuj standardní **automatické** nasazení přes `deploy/release.sh --automated --commit ... --prepared-build ...`, které spouští CI self-hosted runner. Nespouštěj současně další ruční release.
3. Jakmile CI deploy skončí, ověř bezpečnými read-only požadavky `/api/health`, `/api/version`, `/api/system/status` (pouze v autorizovaném režimu). SHA `/api/version` musí být odpovídající release artifact/commit, ne jen náhodně odpovídající verze.
4. Pro UI ověř v reálném browseru desktop a mobil: mapa, live letadla, výběr detailu, historie, časová osa, weather, watchlist podle dostupnosti; `/_next/static/*` vrací 200 a správný MIME typ, JS konzole bez chyb.
5. Ověř chování SSE po reconnectu a minimálně jeden srovnávací read-only profil pod běžnou zátěží: CPU/RSS/heap, event-loop max/P99, DB a počet posluchačů. Pozor na nereprezentativní krátké měření.
6. Pokud nasazení selže, zastav další PR a analyzuj příčinu. Neprováděj automatické `git reset`, rollback DB ani restart bez schválení. `deploy/recover-previous-build.sh --apply` je pouze explicitně řízená obnova při ověřené kompatibilitě schématu; nejprve read-only preview.

**Pouze pokud je pro danou release explicitně schválen manuální zásah a automatická cesta není použitelná**, postupuj přes zdokumentovanou proceduru v `docs/RELEASE.md` a na produkčním stroji nejprve:

```bash
cd /var/www/airradar
sudo ./deploy/release.sh --dry-run
# Tímto se nic nenasazuje. Následující příkaz je povolen pouze po samostatném schválení:
# sudo ./deploy/release.sh
```

**Důležité:** Manuální `release.sh` může instalovat závislosti, aplikovat dopředné migrace, restartovat službu a vytvářet tag. `--dry-run` je pouze kontrola, nikoliv záruka budoucího úspěchu. Nezaměňovat s ručním `npm run build` v živém checkoutu.

## 9. Jak má Codex hlásit výsledky

Po každé fázi napiš stručnou česky psanou zprávu:

- Výchozí a cílové SHA, aktuální nasazená verze a zda byla skutečně ověřena.
- Tabulka kandidátů `KEEP/DELETE/MERGE/DEFER` s cestami a důkazy.
- PR URL, branch, seznam změn, které testy **byly skutečně spuštěny** a jejich výsledek.
- Měřené CPU/RSS/event-loop/DB/UI rozdíly s metodikou, bez vymyšlených procent.
- Otevřené riziko a jednoznačný verdikt `READY FOR MERGE`, `BLOCKED` nebo `DEPLOYED AND VERIFIED`.
- Přesně vypiš, co **nebylo** prověřeno a co se **nezměnilo**.

Nesmíš označit práci jako hotovou pouze podle úspěšného PR CI. Pro nasazení je nutný ověřený produkční SHA, bezpečný health check a UI/SSE smoke.

## 10. Spouštěcí zadání pro Codex

```text
Pracuj na repozitáři Boym323/AirRadar a postupuj přesně podle přiloženého dokumentu AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_2026-10-18.md.

Začni ověřením aktuálního main a živého produkčního commitu na https://airradar.pomykal.cz. Produkci používej nejprve výhradně read-only. Přečti AGENTS.md a relevantní části docs/CODEX-CONTEXT.md, docs/RELEASE.md a docs/RUNTIME-INVARIANTS.md.

1) Zmapuj prokazatelně nepotřebný kód, duplicitní implementace, historické artefakty, feature flagy a runtime náklady. Nenech se vést jen podobnými názvy souborů.
2) Sestav KEEP/DELETE/MERGE/DEFER katalog s přesnými cestami, vazbami a důkazy. Prověř bezpečnost admin API, produkční auth a ochranu větve main.
3) Proveď bezpečné nekonfliktní refaktory v samostatných PR. Priorita: opuštěné soubory a adaptéry, obří radar UI/CSS, aircraft-state orchestrátor, až poté Track Fusion, Operational Twin a CI. Zachovej rust parser, SSE, historii a funkční veřejné API.
4) Spusť odpovídající testy, migrace jen na DEV, performance baseline a případně release-preview. Oprav selhání příčinou, ne obcházením testů.
5) V této fázi NEMERGUJ, NENASAZUJ a NEMĚŇ produkční konfiguraci/databázi. Připrav PR a přesný bezpečný plán jejich následného produkčního uvolnění.
6) Průběžně a nakonec napiš souhrn v češtině, včetně měření a blokérů. Kde chybí důkaz, výsledek označ jako neověřený.
```

### Oddělený release prompt (až po výslovném schválení konkrétních PR)

```text
Pro Boym323/AirRadar je schváleno produkční nasazení PR: <DOPLNIT_PRESNA_CISLA>.

Nejprve zkontroluj přesné diffy, main/PR SHA, zelené CI + CodeQL, migrace, release-preview browser/performance gates a read-only produkční baseline. Pokud něco chybí nebo selhává, přeruš práci a nenasazuj.

Pak merguj POUZE uvedené schválené PR v bezpečném pořadí. Protože merge do main spouští automatický deploy, počkej na úplné dokončení CI/release jobs pro každé nasazené SHA a nepouštěj souběžně ruční deploy. Ověř /api/version + /api/health, desktop/mobil UI, statické assety, SSE a odpovídající metriky. Při regresi zastav další PR, sesbírej sanitizované diagnostické důkazy a navrhni bezpečnou obnovu; žádný automatický DB rollback ani destruktivní zásah. Napiš přesná nasazená SHA a důkazy v češtině.
```

---

**Poznámka k důkazům:** Počty a velikosti souborů odpovídají statické revizi z 18. 10. 2026 a musí se při samotném spuštění aktualizovat. Tento dokument není důkaz dostupnosti nebo konfigurace aktuální produkce ani automatická autorizace změn.
