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

## Vývojová databáze

Izolovaná vývojová databáze má tyto kanonické identifikátory:

```text
Databáze: airradar_dev
Role/uživatel: airradar_dev
Schéma: public
Env soubor: .env.dev.local
```

Vývoj používá samostatný soubor `.env.dev.local`. Prisma i vývojové runtime
procesy nadále používají standardní proměnnou `DATABASE_URL`; oddělení DEV/PROD
zajišťuje env soubor, nikoli jiný název proměnné. Lokální soubor vytvořte pouze
s placeholdery:

```env
# Development database only
DATABASE_URL="postgresql://airradar_dev:<DEV_PASSWORD>@<DB_HOST>:5432/airradar_dev"
AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=false
```

`.env.dev.local` nikdy necommitujte, nevkládejte do něj produkční
`DATABASE_URL` a neukládejte jeho heslo do dokumentace. Před každou DEV
migrací, testovacím zápisem nebo canary musí `DATABASE_URL` mířit na
`airradar_dev`. Soubor chraňte a ověřte pravidla Gitu:

```bash
chmod 600 .env.dev.local
git check-ignore .env.dev.local
```

Tento repozitář již ignoruje `.env*`. Pokud lokální checkout ignoraci nemá,
použijte lokální exclude místo změny sdíleného pravidla:

```bash
echo ".env.dev.local" >> .git/info/exclude
```

Před použitím Prismy nebo integračními zápisy ověřte skutečný cíl:

```bash
set -a
source .env.dev.local
set +a

psql "$DATABASE_URL" -c "SELECT current_database(), current_user, current_schema();"
```

Očekávaný výsledek je `airradar_dev | airradar_dev | public`. Pokud
`current_database()` není `airradar_dev`, zastavte se: DEV migrace ani
testovací zápisy se nesmí spustit.

### Refresh z PROD do DEV

Produkce je při refreshi pouze read-only zdroj. Logický snapshot ve vlastním
formátu vytvořte pomocí produkčního read-only připojení dodaného operátorem;
jeho URL ani přihlašovací údaje do tohoto dokumentu nepatří. Snapshot se potom
obnoví pouze do izolované DEV databáze:

```bash
PROD_DB="<production-db-name>"
DEV_DB="airradar_dev"
DUMP="/var/backups/airradar-dev-bootstrap/$(date +%Y%m%dT%H%M%S)/airradar-prod-snapshot.dump"

mkdir -p "$(dirname "$DUMP")"
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP" \
  "$PROD_DB"
pg_restore --list "$DUMP" >/dev/null
```

Před jakoukoli destruktivní operací DEV vyžadujte guard názvu databáze:

```bash
[ "$PROD_DB" != "$DEV_DB" ] || {
  echo "STOP: PROD and DEV database names are identical"
  exit 1
}

dropdb --if-exists --force "$DEV_DB"
createdb \
  --owner=airradar_dev \
  --encoding=UTF8 \
  --template=template0 \
  "$DEV_DB"
```

Heslo nevkládejte do příkazů. Pro autentizaci použijte `.pgpass` nebo schválený
env/credential mechanismus:

```bash
pg_restore \
  --dbname="$DEV_DB" \
  --username=airradar_dev \
  --no-owner \
  --no-acl \
  "$DUMP"
```

Při TCP připojení uveďte `<DB_HOST>` a DEV databázi explicitně:

```bash
pg_restore \
  --host=<DB_HOST> \
  --port=5432 \
  --username=airradar_dev \
  --dbname=airradar_dev \
  --no-owner \
  --no-acl \
  "$DUMP"
```

Produkční databázi nikdy nedropujte, kvůli DEV refreshi neukončujte produkční
session a proti produkci nepoužívejte `TRUNCATE`. Refresh z DEV databáze nedělá
trvalý archive stagingové historie.

Po obnově znovu načtěte `.env.dev.local` a ověřte cíl a schéma:

```bash
set -a
source .env.dev.local
set +a

psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"
psql "$DATABASE_URL" -c '\dt'
psql "$DATABASE_URL" -c \
'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 10;'
```

Po refreshi lze provést základní sanity counts pro `Flight` a
`FlightPosition`; byte-identická velikost databáze není požadavek.

### DEV migrace a lifecycle

Pending migrace aplikujte až po výše uvedené kontrole připojení:

```bash
set -a
source .env.dev.local
set +a

npx prisma migrate status
psql "$DATABASE_URL" -Atc "SELECT current_database();"
# Musí vypsat: airradar_dev
npx prisma migrate deploy
npx prisma migrate status
```

Doporučený lifecycle je:

```text
PROD snapshot → restore do airradar_dev → pending DEV migrace
→ DB integrace → DEV canary → validační report → feature OFF → commit / CI
```

`airradar_dev` slouží pro validaci migrací, DB integrační testy, predictive
prospective canary, validaci reportů, kontroly lifecycle/deduplikace,
porovnání výkonu OFF versus ON a bezpečné experimenty se syntetickými řádky.
Syntetické observation rows patří pouze do DEV/test databází.

### Bezpečnost produkční databáze

Role `airradar_dev` nesmí mít přístup k produkční databázi. Produkční
administrátor má oddělení vynutit například takto:

```sql
REVOKE CONNECT ON DATABASE <PROD_DB> FROM airradar_dev;
```

Produkci používejte pouze jako read-only zdroj dumpu; integrační testy proti ní
nikdy nespouštějte. Produkční cleanup je samostatná, výslovně potvrzená
operace omezená na jednoznačně testovací data. Role DEV se nesmí použít pro
připojení k produkčnímu dumpu.

Pro Predictive Prospective Validation V2 aplikujte po obnovení PROD snapshotu
migraci `20261003T0515_predictive_prospective_observations_v1` do DEV a switch
ponechte OFF. Stage 0 je ověření DEV schématu; aplikace schématu neznamená
graduation ani veřejné vystavení feature. DEV canary zapněte až po PASS DEV
migrace, PASS DB integrace a PASS runtime safety checks:

```env
AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true
```

Po canary vraťte switch na `false`, pokud není záměrně ponecháno DEV capture.
Při `false` nevznikají prospective persistence writes, prediktivní engine
zůstává v režimu SHADOW a veřejný SSE snapshot se nemění. Viz
[workflow Predictive Prospective Validation V2](PREDICTIVE-PROSPECTIVE-VALIDATION-V2.md)
pro staged postup.

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

Commity pouze s dokumentací (Markdown dokumentace, `README.md` a výslovně
uvedené generované metadatové soubory) nespouštějí produkční nasazení. Změny
runtime, release, schématu nebo konfigurace ano; smíšené commity se nasazují a
neznámé cesty jsou z bezpečnostních důvodů klasifikovány jako deploy.
Strojově čitelné soubory, například `docs/features.registry.json`, proto mezi
docs-only nepatří.
Klasifikaci release scope pokrývají deterministické regresní testy.

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

## Bezpečnostní CSP a kontrola aktualizace Prisma RC

### Striktní nonce pro skripty na dynamické stránce systému

Existující `/system` používá `force-dynamic`. Volitelný Next 16
`proxy.ts` obsluhuje výhradně tuto stránku. Výchozí stav
`AIRRADAR_STRICT_CSP_SYSTEM_ENABLED` je vypnuto. Ostatní stránky radaru
zůstávají na stávající politice z `next.config.ts`. Pro ověření **jen na
DEV** nastavte `AIRRADAR_STRICT_CSP_SYSTEM_ENABLED=true`, restartujte DEV a
zkontrolujte prohlížeč, načítání JS/CSS, přechody mezi stránkami a panely
systémových událostí. Každý HTTP požadavek dostane kryptograficky náhodný
128bitový nonce, který musí shodně dorazit do Next request i response
hlaviček. Režim zakazuje `unsafe-inline` pouze u **script-src**;
style-src ještě potřebuje samostatnou migraci. Bez browserových a
výkonnostních testů jej v produkci nepovolujte.

Přímé čtení skutečných HTTP hlaviček na DEV:

```bash
npm run ops:audit:headers -- --origin http://127.0.0.1:3000 --require-hardened --require-nonce
```

Skript nic nezapisuje: kontroluje geolokaci povolenou jen pro vlastní web,
omezení objektů/framů a unikátní nonce ve dvou požadavcích. Volba
`--require-nonce` má smysl až po explicitním zapnutí DEV režimu. Navíc
ověřte desktop a mobilní browser gate bez CSP chyb a zachování odezvy.
Běžný radar zůstává staticky vykreslovaný.

### Bezpečnostní brána aktualizace Prisma 8 RC

Projekt používá starší přesně připnuté Prisma 8 RC. Novější RC mění implicitní
jména SQL tabulek. Nesmí se naslepo změnit verze a spustit
`prisma:deploy` proti produkci. Nejdříve spusťte kontrolu pouze pro čtení:

```bash
npm run prisma:upgrade:preflight -- --print-candidates
# Pouze na obnovené DEV databázi PostgreSQL:
psql "$DEV_DATABASE_URL" -Atqc "SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json) FROM pg_catalog.pg_tables WHERE schemaname='public';" > /tmp/airradar-dev-table-catalog.json
npm run prisma:upgrade:preflight -- --catalog-json /tmp/airradar-dev-table-catalog.json --require-safe
```

Nenamapovaný model nebo chybějící katalog musí kontrolu
`--require-safe` zastavit. Kandidátní historická jména nejsou důkazem;
ověřte fyzické tabulky, připravte odpovídající `@@map` na samostatné větvi
a otestujte emitovaný kontrakt, rozdíly migrací a dotazy se skutečnými
obnovenými DEV daty. CLI a runtime aktualizujte v kompatibilní dvojici
podle vydaných verzí. Bez destruktivního zásahu do produkční databáze.
