# Zadání pro Codex — AirRadar: přímo `main`, zdrojový kód v produkčním checkoutu

[English](../../agents/CODEX-DIRECT-MAIN-PRODUCTION-2026-10-19.md)

**Schváleno provozovatelem:** 19. 10. 2026. **Repozitář:** `Boym323/AirRadar`. **Jediný pracovní checkout:** `/var/www/airradar`. **Produkce:** https://airradar.pomykal.cz.

## Režim práce

- Úpravy zdrojových souborů prováděj přímo v `/var/www/airradar`, na větvi `main`. Nevytvářej pracovní větve, PR, druhé vývojové checkouty, trvalé worktree ani vedlejší vývojové adresáře. Krátkodobé atomické adresáře buildu používané existujícím release skriptem nejsou další vývojový checkout a musí zůstat zachované.
- Jde o výslovnou výjimku z historického doporučení používat oddělený vývojový checkout. Ostatní pravidla `AGENTS.md`, `docs/RUNTIME-INVARIANTS.md` a `docs/RELEASE.md` stále platí.
- Pracovat a pushovat smí vždy jen jeden agent. Nejdříve ověř `pwd`, `git branch`, čistotu stromu, čerstvý `origin/main`, běžící CI/deploy, `/api/version` a veřejné zdraví produkce. Nepřepisuj změny někoho jiného.
- Dělej malé logické commity přímo do `main`. Před každým pushem zkontroluj celý diff, potřebné neinvazivní testy, `git fetch origin main` a aktuální HEAD; pushuj bez `--force`. Pokud se upstream změní, změnu znovu přizpůsob a ověř.
- Push do `main` spouští automatické CI/CD. Po dobu release do produkčního checkoutu nezapisuj a další produkční commit nedělej před výsledkem kontrol přesného SHA a ověřením aktuální verze produkce. Pro deploy musí být pracovní strom čistý.
- **Zásadní ochrana:** editace zdrojového kódu v produkčním checkoutu je povolena, ale **nespouštěj `npm run build` ani `next build` do živého `.next`**, protože by běžící Next.js mohl ztratit JS/CSS. Nespouštěj druhý vývojový server, nepřepisuj runtime dependencies, nepouštěj testy zapisující do produkční DB a neměň tajné údaje. Sestavení a nasazení nech na CI a ověřeném `deploy/release.sh` s atomickým přepnutím sestaveného buildu. Jeho dočasné `.next-release-*` adresáře neodstraňuj.
- Neprováděj ruční restart služby, ruční release, zásah do produkční konfigurace, tajemství nebo změny schématu či destruktivní operace nad produkční databází bez dalšího výslovného souhlasu. Neobcházej problém špinavého checkoutu parametrem `--allow-dirty`.

## Cíle a pořadí

1. Ověř aktuální `main`, vydanou a nasazenou verzi, CI/CodeQL, runtime diagnostiku a výchozí výkon. Staré výsledky nepovažuj za aktuální.
2. Nejdřív oprav všechny aktivní překážky produkčního release. Zachovej skutečné prohlížečové testy a všechny bezpečnostní brány. Po deployi zkontroluj reálnou funkčnost mapy, CSS/JS, SSE a konzoli prohlížeče.
3. Pokračuj v modularizaci již rozpracované v #1087, #1088, #1086, #1090 a #1089; neopakuj hotovou práci. Rozděl `components/airradar-app.tsx` na vlastníky mapového lifecycle, zdrojů/vrstev, letadel/OGN, výběru, UI panelů a datových hooks. Zachovej jednoho vlastníka živého stavu a neduplikuj MapLibre inicializaci.
4. Postupně konsoliduj `app/globals.css`, odstraň skutečně neúčinná/přepisovaná pravidla a zapouzdři styly. Ověř šířky 320 až 1920 px. Nabídka **Vrstvy** musí být viditelná a kliknutelná i bez vybraného letadla, s otevřenými i zavřenými panely.
5. Optimalizuj jen měřená úzká místa: zbytečné GeoJSON zápisy, opakovanou geometrii ATC, časté React/DOM aktualizace, OGN/popisné výpočty a neomezené cache. Porovnej P50/P95/P99, event-loop stally, CPU, paměť, SSE a vykreslování za srovnatelné zátěže.
6. Odstraňuj pouze prokazatelně nepoužívaný kód. Každý kandidát klasifikuj KEEP/DELETE/MERGE/DEFER po ověření importů, dynamických volání, API, uživatelských funkcí, překladů, dokumentace, migrací, CI a externích konzumentů. Zachovej veřejné bezpečné GET diagnostiky, oprávnění pro zápis a nativní Rust parser/CRC parity.
7. Zachovej modulární monolit: `readsb -> RAM -> SSE`, jediného `AircraftStateService`, vzorkovanou historii v PostgreSQL, oddělení OGN a volitelných providerů a bezpečné chování při jejich výpadku. Nezaváděj mikroservisy.

## Povinné testy a vykazování

- Před commitem: přehledný diff, regresní testy, `git diff --check`, kontrola registru features, dokumentace, vizuálního systému a jen takové lokální testy, které nepoškozují běžící runtime ani produkční DB. Celý build a prohlížečovou matici nech provést CI.
- Po každém malém commitu do `main` vyčkej na CI, CodeQL, výkonnostní brány, release a deploy přesného SHA. U UI testuj režim s/bez výběru letadla, klikatelnost tlačítka Vrstvy, responzivitu a veřejné `/_next/static/*` assety.
- Při změně stránek/API oprav `docs/features.registry.json`, vygeneruj `docs/FEATURES.md` a udržuj anglickou i českou dokumentaci.
- Každé kolo zakonči zprávou: změněné a odstraněné soubory, commit SHA, PASS/FAIL/NOT RUN všech bran, naměřený rozdíl výkonu a odděleně stav `main`, stav CI a **skutečně nasazená** verze podle `/api/version`.
- Pokračuj autonomně po malých ověřených krocích, ale při selhání kritické brány, nečistém checkoutu, kolizi agentů nebo potřebě zásahu do produkční DB zastav zápisy a dolož blokaci. Nic neprohlašuj za nasazené bez důkazu.

**Aktuální priorita:** nejprve ověř stav release po PR #1087/#1088/#1086/#1090/#1089; v předchozím vývoji CI několikát selhávalo a produkční release zaostával. Rozhodující je nová kontrola, ne historický brief.
