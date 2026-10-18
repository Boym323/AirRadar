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

## Povinné prostředí pro provedení

Pracuj v **samostatném plném neobsluhujícím checkoutu s nainstalovanými závislostmi**, spusť příslušné lokální kontroly, pak dodrž proces **jediného zapisujícího agenta a ověřených neforce commitů přímo do main**. Push do main může automaticky nasadit produkci. Neodesílej runtime změny, pokud nemáš izolovaný checkout, nemůžeš testovat, neumíš bezpečně ověřit produkční stav nebo není dostupný single-writer režim. Označ to BLOCKED; pravidla neobcházej a nevymýšlej měření.

Produkční flagy ověř pouze z povolené read-only a sanitizované diagnostiky. Nejsou-li dostupné, označ stav **UNKNOWN**. Staré CI/T58 není důkaz dnešního nasazení.

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
- Nelze read-only zkontrolovat produkční flagy: **produkční stav UNKNOWN**.
- Nejasný single-writer nebo automatický deploy: pozastav runtime push.
- Neúplné vazby API či chybějící testy: pozastav jen příslušnou dávku.
- Destruktivní produkční DB či ruční deploy vyžadují zvláštní souhlas.

Po skutečném provedení doplň přesné commity a ověřené výsledky. Tento dokument sám o sobě **neodstraňuje žádnou runtime funkci**.
