# Schválené vyřazení funkcí AirRadaru — implementační plán (18. 10. 2026)

[English](../../agents/APPROVED-FEATURE-RETIREMENT-2026-10-18.md)

> **Schválení konkrétního úkolu, nikoli globální pravidla.**
> Nejprve načti [AGENTS.md](../../../AGENTS.md), potom [CODEX-CONTEXT.md](../CODEX-CONTEXT.md) a pouze příslušný kód a testy. Tento dokument schvaluje **funkční vyřazení** uvedených položek, nikoli destruktivní mazání produkční DB, ruční deploy, úpravy produkčních přístupů, obcházení testů či pravidel vydávání. Před každou dávkou ověř čerstvý origin/main a identitu produkce.

## Schválený rozsah (15 jmenovaných položek)

1. SondeHub — radiosondy (REST/MQTT, mapová vrstva, provider, API a relevantní testy).
2. NOAA Space Weather — volitelný kontext Kp a API.
3. Saved Workspaces (/workspaces).
4. Historical Baselines (/baselines); původní statistická data zachovat.
5. Aviation Event Feed (/events); původní Flight Intelligence, alerty, letištní události a Navigation Integrity zachovat.
6. My AirRadar (/my-airradar); sdílené služby a data zachovat.
7. Aircraft Discovery (/discover); společný logbook zachovat.
8. Route Network Explorer (/routes a /routes/:origin/:destination); společné statistiky zachovat.
9. Follow Flight / Journey (/journeys a tlačítko na detailu letadla); historii a skutečné události zachovat.
10. Mobile Spotter Mode (/spotter a API jeho Saved Spots).
11. Track Fusion Shadow (pouze experimentální alternativní slučování, outcome/readiness); kanonické slučování a historii zachovat.
12. PRG Spotting Mode (podfunkce Mobile Spotteru; neodstraňuj dvakrát).
13. Camera AR (podfunkce Mobile Spotteru; neodstraňuj dvakrát).
14. Volitelný 3D radar (terén, 3D modely, ovládání, ověření zařízení); 2D MapLibre a běžné markery zachovat.
15. Modelový vítr v Operational Digital Twin (wind-aloft fetch, závislé výpočty počasí, wind-timing shadow/promotion); ostatní SIGMET, PIREP, BDS pozorování a kanonické predikce zachovat.

**Co musí zůstat:** lokální readsb/BEAST, provenience a fallback síťových zdrojů ADSBHub/ADSB.lol, kanonické pozice, alerty a watchlist, SSE, Time Machine a historie, detaily letadel a letišť, reálné události Flight Intelligence, navigace/ATC, Navigation Integrity, skutečné meteorologické pozorování z letadel, ostatní METAR/SIGMET/PIREP/radar počasí, nezávislé součásti Digital Twin a veřejná bezpečně sanitizovaná diagnostika.

Vybraná funkce se smí odstranit i v případě, že má aktivního konzumenta: **změna produktového chování je schválena**. Technická bezpečnost je však povinná. Funkční kód neoznačuj nepravdivě za dead code; veřejné kontrakty vyřazuj až po zmapování klientů a záměrné aktualizaci testů. Sdílená data ani historii DB nemaž.

## Povinné prostředí a ověření produkce po jednotlivých kandidátech

Pracuj v **samostatném plném neobsluhujícím checkoutu se závislostmi**, spusť relevantní lokální testy a kontroly a pak dodrž **jediného zapisujícího agenta, ověřené neforce commity přímo do main**. Runtime push může spustit automatický produkční deploy. Neodesílej změny, pokud nelze spustit příslušné testy, checkout obsluhuje produkci, není bezpečný single-writer/release stav nebo zůstává nevyřešená podmínka konkrétní změny. Neobcházej testy a nevymýšlej měření.

**Nezablokuj všech šest dávek kruhovou podmínkou:** majitel již schválil produktové odstranění uvedených funkcí, včetně používaného UI/API. Ověřuj **skutečnou** konfiguraci a konzumenty každé funkce, nikoli neexistující společný feature flag. U funkce bez serverového přepínače zapiš `N/A (bez specifického serverového přepínače)`, zkontroluj její routy, UI, runtime spouštění, externí API klienty a aktuálně nasazenou SHA pomocí povolené read-only diagnostiky. To, že veřejné health DTO nevypisuje žádné přepínače, **samo o sobě neblokuje** tuto nezávislou funkci. Bezpečné vyřazení stále vyžaduje běžné regresní, bezpečnostní a browser testy.

V současném kódu jsou tyto **konfiguračně citlivé oblasti**:
- SondeHub: `SONDEHUB_ENABLED` a `SONDEHUB_MQTT_ENABLED`; obě jsou opt-in. Před tvrzením o aktivní zátěži a změnou integračního chování ověř skutečný stav povolenou sanitizovanou read-only cestou.
- NOAA Space Weather: `SPACE_WEATHER_ENABLED`, opt-in. Vlastní API/UI lze oddělit od Navigation Integrity, které musí zůstat.
- Track Fusion Shadow: `AIRRADAR_TRACK_FUSION_SHADOW_ENABLED` je defaultně zapnuté, není-li nastaveno false; `AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED` je samostatně opt-in. Před smazáním dohledávej jeho konzumenty, které nejsou součástí shadow funkce.
- Modelový vítr Digital Twin: `AIRRADAR_DIGITAL_TWIN_WIND_TIMING_POLICY` vybírá kanonický režim/promotion, **nevypíná načítání modelového větru**. Ověř skutečný builder, plánování kalibrace a případně bezpečně dostupnou efektivní politiku.
- 3D radar a samostatné stránky: ověř klientský stav a dostupnost rout, nevymýšlej serverové feature flagy. Mobile Spotter navíc obsahuje API Saved Spots a oprávnění, která musí být ověřena zvlášť.

**Povolené read-only důkazy o produkci:** existující sanitizovaná veřejná diagnostika verze/zdraví a případně operátorem schválené zjištění **pouze stavů předem vyjmenovaných přepínačů** přímo na hostu. Konfiguraci procesu/služby/aplikace čti přes zavedená oprávnění, ale nikdy nezveřejňuj kompletní environment, přístupy, polohu přijímače, adresy ani jiné nesouvisející údaje. Prostý snapshot environmentu procesu nemusí zachytit hodnoty načtené aplikací později; neoznačuj jej automaticky za efektivní nastavení. Jen kvůli úkolu nezaváděj nový veřejný endpoint vypisující environment. Pokud skutečný stav nelze ověřit, uveď `UNKNOWN`, popiš omezení a **blokuj pouze konkrétní konfiguračně závislé odstranění, pokud nejistota skutečně brání regresní bezpečnosti**; nezávislé stránky lze po plných testech řešit dál.

Každý push vyžaduje ověřený kód a vlastníka, vědomý produktový souhlas, paritu sdílených kontraktů, lokální gate, aktuální upstream SHA a single-writer režim. Historické CI/T58 nedokazuje současnou produkci ani reálnou výkonnostní úsporu.

## Dávky v pořadí závislostí

### Dávka A — volitelné externí zdroje (SondeHub, NOAA)

- SondeHub: zkontroluj `app/api/sondes/**`, `components/radar/use-sondehub-map-layer.ts`, `lib/server/sondehub-provider.ts`, `lib/server/sondehub-mqtt.ts`, přepínač mapy, localStorage, `tests/sondehub-*`, konfiguraci a dokumentaci. Odstraň časovače, naslouchání a všechny vlastní konzumenty; prokaž, že už neběží polling ani MQTT. Zachovej ADS-B/OGN.
- NOAA: prověř `app/api/navigation-integrity/space-weather/route.ts`, `components/navigation-integrity-space-weather.tsx`, `components/space-weather-context.tsx`, `lib/server/noaa-space-weather.ts`, `lib/server/space-weather.ts`, `tests/noaa-space-weather.test.ts` a `tests/space-weather.test.ts`. **Navigation Integrity samotné musí zůstat.**
- Negativní testy: žádný síťový požadavek / připojení na odstraněný zdroj, route chybí v registru; pozitivně musí fungovat radar a Navigation Integrity.

### Dávka B — samostatné stránky, jejich sdílené backendy zachovat

- Saved Workspaces: `app/workspaces`, `components/saved-workspaces*`, `lib/workspaces.ts`, navigace a `tests/saved-workspaces-v1.test.ts`.
- Historical Baselines: `app/baselines`, `components/historical-baselines*`, `lib/historical-baselines.ts`, `tests/historical-baselines-v1.test.ts`; **nemaž** `lib/navigation-integrity/baseline.ts` ani výkonové baseline nástroje se shodným slovem.
- Aviation Event Feed: `app/events`, `components/aviation-event-feed*`, `lib/aviation-event-feed.ts`; **zachovej** `/api/intelligence/events` i původní Flight Intelligence.
- My AirRadar: `app/my-airradar`, `components/my-airradar-home*`; sdílený watchlist, oblíbená letiště, SSE a logbook zachovat.
- Aircraft Discovery: `app/discover`, `components/aircraft-discovery*`; `/api/logbook/summary` zachovat.
- Route Network Explorer: `app/routes/**`, `components/route-network-explorer*`, `components/route-network-detail*`; `/api/statistics/traffic` zachovat.
- Followed Journeys: `app/journeys`, `components/followed-journeys*`, `components/follow-journey-button.tsx`, `lib/followed-journeys.ts`; zachovat kanonickou historii a události.
- Odstraň odkazy z menu, dashboardů, mobilní navigace a registry, aktualizuj dokumentaci a relevantní testy. Žádnou sdílenou službu nemaž jen proto, že její jeden konzument zmizel.

### Dávka C — Mobile Spotter a jeho dvě vybrané podfunkce

- Po prokázání výlučného vlastnictví odstraň `app/spotter`, `components/mobile-spotter-mode*`, `components/spotter-camera-ar*`, `app/api/admin/spotter/saved-spots`, pouze skutečně vlastní `lib/spotter*`, Camera AR projekci, PRG výpočty a relevantní `tests/spotter-*`. Některé obecné geografické či databázové typy mohou mít jiné konzumenty.
- Zmapuj localStorage, odkazy PWA/navigace, notifikace, sdílená data Saved Spots a přístupová oprávnění. Produkční historická data ani schéma nemaž automaticky. Zachovej mobilní hlavní radar/PWA a společné bezpečnostní kontroly přístupu k poloze.

### Dávka D — volitelný 3D radar

- Zkontroluj 3D stav, efekty a přepínače v `components/airradar-app.tsx`, `components/radar/radar-3d-device-check.tsx`, `lib/radar/aircraft-3d-models-v6.ts`, `lib/radar/aircraft-3d-v6-d.ts`, `lib/radar/terrain-v6-d.ts`, styly, assety a testy.
- Odstraň jen 3D vrstvu, nikoli běžnou 2D MapLibre mapu, markery, zoom, výběr letadel, SSE, stylové eventy či funkční 2D sledování letadla.
- Ověř inicializaci 2D mapy, markery, zoom/pan, reload stylu, SSE, desktop/mobil browser a vizuální/výkonnostní kontroly.

### Dávka E — Track Fusion Shadow

- Zmapuj `lib/track-fusion/**`, `app/api/admin/track-fusion/**`, `lib/server/aircraft-state.ts`, konfiguraci, systémovou diagnostiku, `docs/TRACK-FUSION-*.md`, `tests/track-fusion-*.test.ts` a případné skutečně **ne-shadow** konzumenty.
- Zachovej kanonické upřednostnění lokálních pozic a síťovou provenienci. Odstraň pouze shadow alokace, observe/truth/readiness práci, osiřelé časovače a shadow API. Zkontroluj bezpečnost a kompatibilitu veřejné projekce systémové diagnostiky.
- Úsporu CPU/alokací deklaruj pouze po srovnatelném A/B měření.

### Dávka F — modelový vítr v Digital Twin

- Prověř `lib/server/wind-aloft.ts`, `lib/weather/aircraft-wind-context.ts`, `lib/operational-twin/wind-timing-*`, `lib/server/operational-twin.ts`, periodickou kalibraci v `lib/server/aircraft-state.ts`, `components/aircraft-operational-twin.tsx`, DTO, nastavení a všechny konzumenty.
- Odstraň modelový fetch/cache, související výpočty a zbytkové UI. Zachovej meteorologii přímo z letadel/BDS a nesouvisející vítr na letišti z METARu; zachovej SIGMET/PIREP, non-wind koridor, kanonickou trajektorii a identitu. **Nemaž** mechanicky `lib/airport-runway-wind.ts`, je-li potřebný pro METAR.
- Negativními testy prokaž, že detail letadla ani periodická kalibrace nevolají modelový vítr; pozitivně potvrď ostatní Digital Twin a bezpečné fallbacky.

## Povinné kontroly po každé dávce

1. Ověř origin/main, produkční SHA (pouze schválený read-only přístup), stav ostatních zapisujících agentů a CI/deploye. Jeden zapisující agent, žádný force push.
2. Před mazáním cíleně dohledávej importy/exporty/volající a externí klienty veřejných API. Změny kontraktů musí být záměrné a doložené.
3. Uprav **`docs/features.registry.json`**, spusť `npm run features:generate` a `npm run features:check`. Generované EN/CZ stránky FEATURES nevydávej za ručně aktualizované zdroje. Aktualizuj autoritativní dokumentaci EN/CZ a všechny zastaralé odkazy. Historické audity a migrace zachovej.
4. Přidej pozitivní i negativní regresní testy. Spusť cílené testy; u sdíleného runtime i kompletní suite; dále lint, typecheck, izolovaný build, `npm run docs:check`, `npm run visual:check`, relevantní browser/performance gates a klasifikaci `scripts/release-scope.mjs`.
5. Prohlédni celý diff; jen ověřený malý neforce commit přímo do main dle AGENTS.md. Sleduj CI, CodeQL, release validaci, případný automatický deploy a skutečnou produkční SHA daného commitu. **Žádný ruční deploy.** Při selhání zastav další deploy-bearing commity.
6. Předlož pro každou dávku **DONE / BLOCKED**, SHA, odkazy na CI, smazané soubory/route/exporty, zachované testy a změřenou úsporu CPU/RAM/DB/sítě nebo **NOT_MEASURED**. Počet smazaných řádků není úspora výkonu.

## Stop podmínky a neověřená evidence

- Chybí izolovaný plný checkout, závislosti nebo lokální testy: **runtime mazání BLOCKED**.
- Neověřitelný efektivní produkční přepínač: u konkrétní konfiguračně závislé funkce **UNKNOWN/BLOCKED** podle rizika; neblokuje funkce bez takového přepínače.
- Nejasný single-writer nebo automatický deploy: pozastav runtime push.
- Neúplné vazby API či chybějící testy: pozastav jen příslušnou dávku.
- Destruktivní produkční DB či ruční deploy vyžadují zvláštní souhlas.

Po skutečném provedení doplň přesné commity a ověřené výsledky. Tento dokument sám o sobě **neodstraňuje žádnou runtime funkci**.

## Ověřené výsledky (18. 10. 2026)

Všechny níže uvedené runtime změny byly samostatně commitnuty přímo do `main`
z izolovaného neobsluhujícího checkoutu. Přesný seznam přidaných/upravených/
odstraněných cest je uveden v diffu každého propojeného commitu.

| Dávka | Výsledek | Commit / CI / CodeQL | Ověřená produkce |
|---|---|---|---|
| B — samostatné stránky | HOTOVO; `test:changed` 895 úspěšných, 9 přeskočeno; browser 74 cílů / 14 viewportů | [292646d](https://github.com/Boym323/AirRadar/commit/292646d81e51bbb8f77fa3dafb6c318c55499057) · [CI](https://github.com/Boym323/AirRadar/actions/runs/39149603898) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39149603691) | 1.0.519 / `292646d8`; automatický deploy úspěšný |
| C — Mobile Spotter | HOTOVO; `test:changed` 891 úspěšných, 9 přeskočeno; browser 72 / 14 | [346d7de](https://github.com/Boym323/AirRadar/commit/346d7de85ec7b22a4a89cdf96db5526f21603a43) · [CI](https://github.com/Boym323/AirRadar/actions/runs/39151012143) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39151012125) | 1.0.520 / `346d7de8`; automatický deploy úspěšný |
| D — 3D radar | HOTOVO; 85 cílených testů; browser 70 / 14 | [c595009](https://github.com/Boym323/AirRadar/commit/c5950097296025448404ff0b3cbd759a5c2030ab) · [CI](https://github.com/Boym323/AirRadar/actions/runs/39151990602) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39151990522) | 1.0.521 / `c5950097`; automatický deploy úspěšný |
| A — SondeHub / Space Weather | HOTOVO; `test:changed` 838 úspěšných, 9 přeskočeno; 3 cílené testy; browser 70 / 14 | [03b59c3](https://github.com/Boym323/AirRadar/commit/03b59c34bee2d7a5f40c6043e4869e4a0e203f78) · [CI](https://github.com/Boym323/AirRadar/actions/runs/39152862116) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39152862092) | 1.0.522 / `03b59c34`; automatický deploy úspěšný |
| F — modelový vítr Digital Twin | HOTOVO; `test:changed` 2 796 úspěšných, 15 přeskočeno; 25 cílených testů; browser 70 / 14 | [c347d3b](https://github.com/Boym323/AirRadar/commit/c347d3b93ce1d2cfea12b47b390416c30321752b) · [CI](https://github.com/Boym323/AirRadar/actions/runs/39154137242) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39154137259) | 1.0.523 / `c347d3b9`; automatický deploy i ověření identity release úspěšné |
| E — Track Fusion Shadow | HOTOVO; v PR prošlo 2 761 testů / 15 přeskočeno, release CI zelené | [06f55cc9](https://github.com/Boym323/AirRadar/commit/06f55cc927351f39dd5ece905c923654b36f8d45) · [PR #1029](https://github.com/Boym323/AirRadar/pull/1029) · [CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/39156732162) · [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39156732183) | v1.0.524 / `06f55cc9`: automatický deploy, lokální i veřejný health a identita artefaktu ověřeny; shadow výpočty/API/UI odstraněny. |

### Přepínače a produkční evidence

- B, C a D: `N/A (bez specifického serverového feature flagu)`; routy,
  klienti a konzumenti byly zmapováni a zachované backendy otestovány.
- A: efektivní produkční hodnoty `SONDEHUB_ENABLED`,
  `SONDEHUB_MQTT_ENABLED` a `SPACE_WEATHER_ENABLED` zůstávají `UNKNOWN`;
  povolená sanitizovaná veřejná diagnostika je nezobrazuje. To nedokazuje, že
  byly providery aktivní, proto se neuvádějí žádné úspory z jejich provozu.
- E: Čtení dřívějších přepínačů `AIRRADAR_TRACK_FUSION_SHADOW_ENABLED` a `AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED` bylo odstraněno společně s funkcí. Jejich bývalé produkční hodnoty zůstávají `UNKNOWN` a nejsou důkazem výkonové úspory. Digital Twin nyní používá kanonické LOCAL pozorování nezávisle na těchto přepínačích.
- F: `N/A (modelový fetch větru nemá specifický serverový feature flag)`.
  Dřívější `AIRRADAR_DIGITAL_TWIN_WIND_TIMING_POLICY` vybíral prezentační
  promotion, nikoli fetch; jeho čtení i promotion větev byly odstraněny. Analýza
  zdrojů nenašla časovaného konzumenta builderu weather corridor v
  `aircraft-state`.
- Po deployi F vrátily sanitizované read-only kontroly 200 pro `/`,
  `/aircraft/4CA9A4`, `/api/aircraft`, `/api/navigation-integrity/current`,
  `/api/ogn/state`, `/api/aircraft/:hex/situation` a Weather Fusion pro právě
  sledované letadlo; situation DTO zachovalo corridor/events a seznam zdrojů,
  ale nemělo `weatherCorridor.wind`. Odstraněná A API vrátila 404. Produkční
  konfigurace, tajné hodnoty ani databáze se neměnily.

### Změřené úspory

Ověřený ZIP produkčního buildu D se zmenšil ze 76 009 526 B na `346d7de8` na
75 917 796 B na `c5950097`: naměřeno o 91 730 B méně (0,12 %). Jde o velikost
artefaktu, nikoli o naměřené zrychlení runtime. CPU, RAM, databázová práce ani
síťový provoz nebyly u žádné dávky měřeny (`NOT_MEASURED`); CI performance
regression gate pro D a F prošel, ale tyto úspory neprokazuje. Úsporu nelze
odvozovat z počtu řádků ani neznámého stavu provider flagů.

### Dokončená dávka E — ověření

Byla odstraněna implementace Track Fusion Shadow, validační výpočty readiness/outcome, experimentální API a karta v systému; Digital Twin používá pouze kanonický LOCAL stav. [PR #1029](https://github.com/Boym323/AirRadar/pull/1029) prošel PR CI (2 761 testů / 15 přeskočeno), CodeQL, T57 benchmarkem a syntetickými škálovacími testy 1×/2×/4×. Squash commit [06f55cc9](https://github.com/Boym323/AirRadar/commit/06f55cc927351f39dd5ece905c923654b36f8d45) prošel [main CI](https://github.com/Boym323/AirRadar/actions/runs/39156732162), release validací, browser a performance gate a [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39156732183). Automatický deploy ověřil lokální a veřejný health i verzi 1.0.524 na 06f55cc9. Žádný ruční deploy, změna konfigurace produkce ani databázový zásah. Úspory CPU/RAM/DB/sítě dávky E zůstávají **NOT_MEASURED**.
