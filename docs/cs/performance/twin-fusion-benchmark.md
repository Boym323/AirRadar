# Operational Twin / Track Fusion – reprodukovatelné výkonnostní testy

Sada měří **stávající implementaci TypeScript** a nepřepisuje algoritmy do
Rustu. Nezasahuje do PR #925 (BEAST/Rust) ani PR #926 (metadata a plánování).

## Místní spuštění – bez přístupu k produkci

```bash
npm ci
npm run prisma:generate
npm run test:targeted -- tests/benchmark-twin-fusion.test.ts
npm run benchmark:twin-fusion
AIRRADAR_PERF_PROFILE=extended npm run benchmark:twin-fusion
```

Výstupy: `.benchmarks/twin-fusion/report.json` a `summary.md`
(adresář je v .gitignore). Skript běží s Node `--expose-gc`, aby mohl
uvádět stav paměti po vynucené garbage collection. Doby běhu jsou pouze
informativní; běh se automaticky nezastavuje kvůli překročení
milisekundového limitu.

## Spuštění na GitHubu

V repozitáři otevřete **Actions → Operational Twin & Track Fusion benchmarks
→ Run workflow** a vyberte profil `smoke` nebo `extended`. PR upravující
benchmark či dané komponenty spustí rychlý test automaticky. Až bude
workflow začleněn do `main`, spouští se automaticky také každou neděli
v 03:35 UTC. Hostovaný GitHub runner používá Node 22, nevyžaduje
přístup k databázi ani produkčnímu serveru a má oprávnění pouze ke čtení.

Každý běh uloží JSON a Markdown jako unikátně pojmenovaný **Actions
artifact** s retencí do 90 dní (podle pravidel repozitáře). Souhrn se
zobrazí přímo v konkrétním běhu. Historii lze porovnat stažením JSON
artefaktů pro stejný profil a zohledněním SHA commitu, změn zátěže
a šumu sdíleného runneru. Neexistuje automatická hranice výkonové
regrese; PASS/FAIL ověřuje shodu výsledků, bezpečné meze a konečné
číselné hodnoty, nikoli údajné produkční zrychlení.

## Operational Twin

Používá existující `runT57Scenario()` z
`scripts/benchmark-operational-twin-t57.ts`, bez duplikace algoritmu.
Porovnává inkrementální vyhodnocení a úplný průchod na **stejném commitu**
a vyžaduje sémantickou shodu. Scénáře obsahují čekající události,
120 bodů trajektorie, opravy historie, ATC kontroly a expiraci.

- Rychlý profil: 78 letadel, 20 čekajících událostí, simulovaný interval
  3 s, doba 60 simulovaných sekund.
- Rozšířený profil: 78/20 při 1 s; 250/1000 při 3 s;
  250/3000 při 10 s, každý po 120 simulovaných sekundách.
- Dvě opakování u rychlého a tři u rozšířeného profilu;
  pořadí obou algoritmů se střídá.

## Track Fusion

Samostatně měří `TrackFusionShadow.observe()`, bez započítání přípravy
syntetických vstupů. Ověřuje stabilní stav, společná lokální/síťová
pozorování, odstranění a opětovné získání zdroje, výběr podle změněných
ICAO identit, pravidelný úplný průchod, sloučení zdrojů a úklid
starého stavu. Simulovaný pětisekundový krok odpovídá omezování
vyhodnocování ve službě, nikoliv frekvenci všech providerů.

Dvě až tři celá opakování musí vykázat naprosto stejný výsledný
stav a diagnostické počitadla. Porovnání využívá SHA-256 nad
syntetickými výstupy; do reportu se nevypisují identity letadel.

Součástí výsledků jsou P50/P95/P99/max latence, CPU čas,
histogram event-loop, heap/RSS a stav po GC, počty vyhodnocení,
rozdíly pozic a přechody zdrojů.

## Interpretace

Přepis do Rustu dává smysl až po reprodukci charakteru skutečné zátěže
a měření plného zpracování včetně nákladů na předávání dat mezi
TypeScriptem a Rustem. Historické hodnoty T58 před PR #895 nejsou
současnou referencí. Samotný mikrobenchmark nerozhoduje o nasazení.

Možná kritéria pro pozdější přijetí Rustu (zatím neověřená):
bezchybná sémantická shoda; opakovaně nejméně 20 % úspory CPU
na zvolené celé cestě; nezhoršené P99 event-loop a dlouhodobá RAM;
ověřený Linux/macOS build a produkčně podobný nezávislý soak test.
