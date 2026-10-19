# Zadání pro Codex — AirRadar: přímo `main`, zdrojový kód v produkčním checkoutu

[English](../../agents/CODEX-DIRECT-MAIN-PRODUCTION-2026-10-19.md)

**Schváleno provozovatelem:** 19. 10. 2026. **Repozitář:** `Boym323/AirRadar`. **Jediný pracovní checkout:** `/var/www/airradar`. **Produkce:** https://airradar.pomykal.cz.

## Režim práce

- Úpravy zdrojových souborů prováděj přímo v `/var/www/airradar`, na větvi `main`. Nevytvářej pracovní větve, PR, druhé vývojové checkouty, trvalé worktree ani vedlejší vývojové adresáře. Krátkodobé atomické adresáře buildu používané existujícím release skriptem nejsou další vývojový checkout a musí zůstat zachované.
- Jde o výslovnou výjimku z historického doporučení používat oddělený vývojový checkout. Ostatní pravidla `AGENTS.md`, `docs/RUNTIME-INVARIANTS.md` a `docs/RELEASE.md` stále platí.
- Pracovat a pushovat smí vždy jen jeden agent. Nejdříve ověř `pwd`, `git branch`, čistotu stromu, čerstvý `origin/main`, běžící CI/deploy, `/api/version` a veřejné zdraví produkce. Nepřepisuj změny někoho jiného.
- Dělej malé logické commity přímo do `main`. Před každým pushem zkontroluj celý diff, potřebné neinvazivní testy, `git fetch origin main` a aktuální HEAD; ověř, že vzdálená historie obsahuje tvůj základ a že push lze provést rychlým posunem. Pushuj bez `--force`. Pokud se upstream změní, znovu si přečti dotčené soubory, změnu přizpůsob a ověř ji.
- Push do `main` spouští automatické CI/CD. Po dobu release do produkčního checkoutu nezapisuj a další produkční commit nedělej před výsledkem kontrol přesného SHA a ověřením aktuální verze produkce. Pro deploy musí být pracovní strom čistý.
- **Zásadní ochrana:** editace zdrojového kódu v produkčním checkoutu je povolena, ale **nespouštěj `npm run build` ani `next build` do živého `.next`**, protože by běžící Next.js mohl ztratit JS/CSS. Nespouštěj druhý vývojový server, nepřepisuj runtime dependencies, nepouštěj testy zapisující do produkční DB a neměň tajné údaje. Sestavení a nasazení nech na CI a ověřeném `deploy/release.sh` s atomickým přepnutím sestaveného buildu. Jeho dočasné `.next-release-*` adresáře neodstraňuj.
- Neprováděj ruční restart služby, ruční release, zásah do produkční konfigurace, tajemství nebo změny schématu či destruktivní operace nad produkční databází bez dalšího výslovného souhlasu. Neobcházej problém špinavého checkoutu parametrem `--allow-dirty`.

## Cíle a pořadí

1. Ověř aktuální `main`, vydanou verzi i verzi skutečně nasazenou, GitHub Actions, CI, CodeQL, release a veřejné runtime diagnostiky. Změř výchozí stav tam, kde to bezpečně jde, a staré výsledky nepovažuj za aktuální důkaz.
2. Nejdřív oprav všechny aktivní překážky produkčního release. Zachovej skutečné prohlížečové testy a bezpečnostní brány; neupravuj jejich očekávání tak, aby pouze znovu zezelenaly. Po dokončeném nasazení zkontroluj reálnou funkčnost mapy, CSS/JS, SSE a konzoli prohlížeče.
3. Pokračuj v modularizaci již rozpracované v #1087 (HUD, vrstvy mapy, parsování datasetů a popisky), #1088 (vyřazené routy), #1086 (odlehčené ATC), #1090 (release smoke) a #1089 (OGN a navigační fokus). Hotovou práci neopakuj. Rozděl `components/airradar-app.tsx` podle odpovědnosti na vlastníky mapového lifecycle, zdrojů a vrstev, letadel a OGN, výběru, ovládacích panelů, načítání dat a prezentace. Zachovej jediného vlastníka živého stavu a neduplikuj inicializaci MapLibre.
4. Postupně konsoliduj `app/globals.css`: odstraň pouze pravidla, která se prokazatelně nepoužívají nebo jsou překrytá, a tam, kde to dává smysl, přesuň styly do lokálních CSS modulů. Zachovej sémantické tokeny a přístupnost. Ověř šířky 320, 375, 390, 430, 768, 820, 821, 900, 1024, 1366 a 1920 px. Nabídka **Vrstvy** musí být viditelná, kliknutelná a otevíratelná bez vybraného letadla, při otevřeném i zavřeném panelu provozu.
5. Optimalizuj jen změřená úzká místa: zbytečné generování či nahrávání GeoJSON, opakované výpočty geometrie ATC, nadbytečné React rendery a DOM aktualizace, duplicitní popisky nebo OGN výpočty a neomezené cache. Před a po změně porovnej srovnatelnou zátěž, CPU, RSS, P95/P99, event-loop stally, frekvenci SSE a dobu vykreslování mapy; samotný syntetický benchmark nedokazuje zrychlení produkce.
6. Odstraňuj pouze prokazatelně nepoužívaný nebo bezpečně nahrazený kód. Každého kandidáta označ KEEP/DELETE/MERGE/DEFER a před rozhodnutím prověř importy, dynamické odkazy, API routy, ovládací prvky, překladové klíče, registr funkcí, diagnostiky, migrace, rollback skripty, CI a externí konzumenty. Zachovej veřejné bezpečné GET diagnostiky, bezpečnostní kontroly a nativní Rust/BEAST parser i jeho parity testy.
7. Zachovej architekturu modulárního monolitu: `readsb -> RAM -> SSE`, jediný `AircraftStateService`, vzorkovanou historii v PostgreSQL, nezávislost OGN, izolaci chyb providerů, MapLibre chování, autorizaci zápisů a bezpečné veřejné diagnostiky. Nepřeváděj systém na mikroservisy.

## Povinné testy a vykazování

- Před commitem zkontroluj celý diff a regresní testy, `git diff --check`, `npm run docs:check`, `npm run features:check`, `npm run visual:check` a relevantní Vitest/lint/typecheck. Lokální kontroly smějí být jen syntetické, mockované nebo pouze pro čtení; nesmějí zapisovat do produkční DB ani měnit aktivní `.next`. Produkční build a úplnou prohlížečovou matici nech na CI.
- Spusť také `node scripts/release-scope.mjs` nebo odpovídající klasifikátor. Před pushem znovu ověř stav stromu, celý zdrojový diff, release lock a vzdálený commit. Po běžném pushi přímo na `main` vyčkej na CI, CodeQL, úplné release/browser/performance brány a deploy přesného SHA; neposílej další commit spouštějící deploy, dokud předchozí běží.
- U vizuální změny samotná zelená unit suite nestačí. Ověř desktopový i mobilní prohlížeč, stav s vybraným letadlem i bez něj, zasažení a otevření tlačítka **Vrstvy**, responzivitu a MIME/HTTP 200 veřejných statických assetů po restartu provedeném CI. Selhání považuj za blokaci a odstraň jeho příčinu; nevypínej kontrolu.
- Při změně stránek/API oprav `docs/features.registry.json`, vygeneruj `docs/FEATURES.md` a udržuj anglickou i českou dokumentaci.
- Každé kolo zakonči zprávou: změněné a odstraněné soubory, commit SHA, PASS/FAIL/NOT RUN všech bran, naměřený rozdíl výkonu a odděleně stav `main`, stav CI a **skutečně nasazená** verze podle `/api/version`.
- Pokračuj autonomně po malých ověřených krocích, ale při selhání kritické brány, nečistém checkoutu, kolizi agentů nebo potřebě zásahu do produkční DB zastav zápisy a dolož blokaci. Nic neprohlašuj za nasazené bez důkazu.

## Aktuální priorita

Nejprve ověř stav po sloučení PR #1087/#1088/#1086/#1090/#1089 a všech pozdějších commitech. Starší vývoj opakovaně narážel na neúspěšné release kontroly a produkční verze zaostávala. Rozhodují čerstvé důkazy, nikoli data a stav popsané v dřívějším zadání.
