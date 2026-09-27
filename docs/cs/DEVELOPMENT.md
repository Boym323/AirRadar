# Vývoj

## Zdrojový kód a prostředí

Používejte Node.js `>=22.18.0` a npm `>=10`. Pro lokální práci zkopírujte
`.env.example` do `.env`. Prázdná hodnota `READSB_BASE_URL` zapne demo režim;
PostgreSQL je pro živý radar volitelný a historie v takovém případě přechází
na ukládání v paměti. Nikdy necommitujte `.env`, databázová URL, přihlašovací
údaje ani API klíče.

Zdrojem pravdy je `prisma/contract.prisma`; verzované migrace jsou v
`migrations/app/`. Vygenerované artefakty Prisma a buildu jsou postradatelné.
Uživatelské texty udržujte v `lib/i18n/` a používejte existující překladové
klíče.

## Smyčka zpětné vazby a kontrolní brány

Pro úzce zaměřenou změnu spusťte vybrané soubory:

```bash
npm run test:targeted -- tests/aircraft-state.test.ts
```

`test:targeted` používá stejný Vitest runner s argumenty souborů předanými za
`--`; je to preferovaná rychlá kontrola pro úzkou změnu. Pro kombinovanou
změnu požádá `test:changed` Vitest, aby vybral testy ovlivněné aktuálním
diffem:

```bash
npm run test:changed
```

Vitest sleduje statické importy a zahrne i tranzitivně závislé testy. Pokud
nedokáže vztah spolehlivě určit, zvolte cílený nebo úplný běh; nezužujte sadu
testů jen proto, aby prošla. `npm test` je výchozí affected-test režim a v
čistém stromu nemusí vybrat žádné testy. Kompletní sada je dostupná explicitně:

```bash
npm test
npm run test:full
```

`test:unit` vynechává explicitně klasifikované sady na hranici DB/API/runtime;
`test:integration` tyto sady spouští. Klasifikace se záměrně udržuje ručně ve
`vitest.integration.config.ts` místo odvozování podle délky běhu.
`test:watch` používá nativní affected watch režim Vitestu.

Test importéru metadat v produkčním měřítku je záměrně oddělený od běžné sady,
protože jeho fixture se 617 000 záznamy ověřuje chování zdrojů, nikoli běžnou
správnost. Spouštějte jej pomocí `npm run test:scale`; CI ho spouští v nočním
nebo ručním heavy workflow. Běžný test metadat nadále ověřuje více úplných
dávek, zbytkovou dávku, omezenou velikost dávky, streamování a počty záznamů.

Relevantní produkční kontroly jsou:

```bash
npm run prisma:generate
npm run features:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:production
```

`features:check` ověřuje `docs/features.registry.json` proti všem aktuálním
Next.js stránkám a API routám a kontroluje vygenerovanou část registru v
`docs/FEATURES.md`. Při přidání, odebrání nebo přejmenování routy nejprve
aktualizujte registr a před validací spusťte `npm run features:generate`.
`typecheck` generuje Prisma kontrakt a Next typegen. `build` zapisuje
ignorovaná metadata buildu, generuje Prisma kontrakt a spouští `next build`.
Předchozí úspěšný průchod všech bran je po změně zdrojového kódu, testů,
balíčků, buildu, migrací nebo nasazení zastaralý. Vždy přesně uveďte, které
příkazy byly spuštěny; nikdy netvrďte, že přeskočená kontrola prošla.

`test:production` spustí hotový build v izolovaném podprocesu v demo režimu a
ověřuje HTTP health, `/api/version`, základní přístupnost domovské stránky,
připojení/snapshot/odpojení SSE, cache statického payloadu, autorizaci změn
watchlistu, runtime diagnostiku, chování PWA manifestu a zdroj aditivních
migrací. Migrace neaplikuje a produkční providery nekontaktuje. Volitelná
browser varianta přidává desktopové/mobilní Playwright smoke testy, pokud je
prohlížeč nainstalovaný:

```bash
npm run test:production:browser
```

Produkční brány také přijímají režimy `--core`, `--browser` a `--all`.
Browser režim spustí jeden sestavený server a ověří kompletní interakční
kontrakt na reprezentativních mobilních a desktopových šířkách, zatímco všech
deset nakonfigurovaných šířek drží kontrakt responzivního rozložení. `--all`
spustí core i browser kontroly v jednom životním cyklu serveru pro CI.

Produkční brána přijímá verzi a kanál z metadat aktuálního buildu
`generated/build-version.json` a vyžaduje buď stabilní dvojici
`X.Y.Z/production`, nebo kanonickou dvojici
`X.Y.Z-rc.N/release-candidate`. Aktuální dvojici zjistí automaticky; pomocí
`PRODUCTION_GATE_CHANNEL=stable` nebo `PRODUCTION_GATE_CHANNEL=rc` lze
vynutit konkrétní variantu.

U vizuálních změn spusťte také desktopovou/mobilní browser bránu. Vizuální
změnu neověřujte spuštěním `npm run build` v živém produkčním checkoutu:
běžící proces Next.js může držet starý build manifest, zatímco se přepisuje
`.next`, čímž se smíchají odkazy ze starého HTML s novými statickými assety.
Během implementace použijte samostatný worktree nebo lokální/staging proces a
pro produkci potom `deploy/release.sh`.

Živý radar má volitelnou browser sondu výkonu. Přidejte k URL radaru
`?perfDiagnostics=1` a poté v DevTools zkontrolujte
`window.__airradarPerformanceDiagnostics.snapshot()`. Snapshot hlásí práci
animation frame, zápisy markerů, dobu kolize labelů, virtualizované řádky
provozu a browser long tasks. Sonda je ve výchozím stavu vypnutá a nesmí měnit
sémantiku live state, SSE ani pohybu.

Po připraveném produkčním buildu spusťte `npm run benchmark:radar`, který
provede produkční výkonnostní baseline radaru. Playwright benchmark nahrazuje
pouze aircraft EventSource v prohlížeči deterministickým syntetickým provozem
SSE V2 a poté měří skutečný produkční radar při 50, 100, 250 a 500 letadlech.
Zaznamenává průměrnou/maximální dobu animace, zápisy markerů za sekundu,
průměrnou/maximální dobu kolize labelů, browser long tasks, počty DOM/MapLibre
markerů a připojené/virtualizované řádky provozu. Výsledky se zapisují do
`artifacts/radar-performance-baseline.json` i
`artifacts/radar-performance-baseline.md`; CI oba soubory nahraje a Markdown
tabulku vloží do souhrnu kroku GitHub Actions.

CI pass/fail záměrně používá jen deterministické strukturální a instrumentační
limity ze `scripts/radar-performance-budget.mjs`: přesné počty markerů/handle,
omezený počet virtualizovaných řádků provozu a důkaz, že diagnostika animace a
kolizí skutečně proběhla. Časy animace/kolizí, zápisy za sekundu a browser long
tasks se ukládají jako observační baseline data, ale nejsou CI branami,
protože zatížení hosted runnerů tyto hodnoty výrazně rozkolísává. Časovou
metriku povyšte na bránu až po získání stabilního rozdělení z více běhů na
cílové třídě runneru.

Pro rychlejší lokální vzorek vyberte scénáře nebo zkraťte měřicí okno,
například `RADAR_PERF_SCENARIOS=50,250 RADAR_PERF_MEASURE_MS=1200 npm run
benchmark:radar`. Strukturální limity měňte jen s vysvětlením v PR; neuvolňujte
je pouze proto, aby regrese prošla.

Změny pouze v dokumentaci, které se nedotýkají kódu, souborů balíčků, schématu,
migrací ani konfigurace buildu, nevyžadují build ani kompletní sadu testů,
pokud si je uživatel výslovně nevyžádá. Přesto spusťte relevantní lehké
kontroly, například validaci odkazů a `git diff --check`.

## Main, worktrees a paralelní agenti

Kanonický checkout je `/var/www/airradar` na větvi `main`. Změny každého
úkolu držte izolované a před úpravami zkontrolujte `git status`. V dirty
worktree nepřepisujte nesouvisející uživatelské změny.

Paralelní agenti musí používat samostatné Git worktrees a větve. Každý agent
vlastní svůj worktree, neupravuje checkout jiného agenta a hlásí změněné
soubory i provedené kontroly. Integrujte práci záměrným merge nebo cherry-pickem
do `main` a poté znovu spusťte kontroly ovlivněné kombinovaným diffem.
Vyhněte se tomu, aby dva agenti upravovali stejné řádky nebo spouštěli
konkurenční buildy nad jedním checkoutem.

Produkční release skript je svázaný s `/var/www/airradar`, stavem služby,
locky, migracemi a health kontrolami; nespouštějte jej z vývojového worktree.
Release nikdy není implicitní krok vývoje ani dokumentace.

## Bezpečné změny

Nenahrazujte SSE WebSockety, nezavádějte další state store/worker a
neresetujte ani znovu nevytvářejte produkční databázi bez konkrétního
požadavku a revize. Změny databázového schématu vyžadují kontrakt i dopřednou
migraci. Změny providerů nebo enrichmentu musí zachovat best-effort izolaci,
omezené cache/concurrency a živou polling cestu.
