# Konsolidace AirRadar V2 → V1 a podmínky smazání (27. 10. 2026)

**Cíl:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar), stávající produkční radar. **Zdroj:** [Boym323/AirRadarV2](https://github.com/Boym323/AirRadarV2), samostatný vývojový projekt. Jde o **kontrolu zdrojových kódů**, nikoliv potvrzení nasazení, výkonu či souhlas se smazáním V2. [Anglická verze](../../../docs/audits/AIRRADAR-V2-RETIREMENT-GATE-2026-10-27.md).

## Inventura zdrojů

V2 uvádí v `contracts/feature-matrix.json` 45 schválených ID: **18 TESTED/ACCEPTED**, zbývajících **27 NOT_STARTED**. Živá mapa G-05 i SQLx zápisy G-04 jsou ve V2 vývojové, nikoli náhrada produkční V1. V1 má vlastní implementace většiny z těchto 18 a také mnoha funkcí, které V2 ještě nezahájila. Stejná funkce na obrazovce však automaticky neznamená stejnou kvalitu backendu.

| Funkce ve V2 | Odpovídající část V1 | Rozhodnutí |
| --- | --- | --- |
| J01/J02/J05/J11 místní readsb, BEAST, RAM, kontinuita | `lib/server/aircraft-state.ts`, `beast-local-provider.ts`, `aircraft-continuity.ts` | Ve V1 existuje; ještě ověřit reconnect, identitu a výkon |
| J03/J04 Rust parser/CRC a automatické přepínání BEAST↔JSON | `native/airradar-native`, `lib/server/beast-decoder.ts` a poskytovatelé V1 | **Otevřená přejímka** CRC/CPR, failoveru, CPU a zátěže; nezavádět druhý ingest |
| J06/J07/J08 HTTP, SSE snapshot/delta | `app/api/aircraft/route.ts`, `app/api/stream/route.ts`, `lib/server/sse-delta.ts`, `lib/aircraft/sse-v2.ts` | V1 již implementuje; ověřit mezery v sekvenci, reconnect a fanout |
| J09 vzorkování historie v PostgreSQL | Stávající historizační a vzorkovací části V1 | Jiný model a ORM; **nepřenášet** SQLx writer ani migrace přímo do produkční DB |
| R01/R04/R06/R08/R09/R12/R14 mapa, popisky, seznam, stopa, sledování, letiště, styly | `components/radar/`, `lib/radar/`, `lib/server/airport-catalog.ts` | V1 již má; ověřit mobil a výkon |
| R03 siluety podle ADS-B kategorie | `lib/aircraft/icon-classification.ts` a stávající SVG | **V tomto kroku přidán fallback A1–A6/B4** bez dalších HTTP/SQL dotazů; přesný typ má přednost |
| R03 originální siluety Path2D z V2 | `apps/web/src/radar/aircraft-icons.ts` ve V2 | Archivovat podle potřeby; V1 používá rozsáhlejší rodinu ikon |
| G-05.11 adaptivní GeoJSON `updateData` | V1 `lib/radar/aircraft-webgl-layer.ts` | **Nepřebírat přímo:** V1 vykresluje letadla vlastním WebGL, nikoliv V2 GeoJSON zdrojem. Případnou změnu nejdřív změřit |
| G-06 statický OurAirports katalog (rozpracováno) | `lib/airports/ourairports.ts`, `lib/server/airport-catalog.ts` | V1 má bohatší katalog/API, statická kopie by duplikovala data |
| Vite, Rust Axum, SQLx, DEV systemd V2 | Produkční Next.js infrastruktura V1 | Nepřepisovat stávající stack ani nespouštět dva zdroje živých dat |

Zbylých 27 funkcí se stavem **NOT_STARTED** ve V2 (letiště/NAVAID, počasí, notifikace, statistiky, diagnostika, PWA, lokalizace, hledání, emergency squawk) je **plán**, nikoliv hotový kód k přenosu. Část už existuje ve V1. Rozhodnutě vyřazené funkce V1 není správné obnovovat pouze kvůli úplnosti inventáře.

## Podmínky bezpečného smazání V2

1. **Záloha:** vytvořit úplný Git mirror V2 mimo GitHub včetně historie a tagů. Uchovat potřebné ADR, testovací fixture, původ/licence ikon, provozní návody a důkazy měření. Pouhý odkaz na V2 by po smazání nestačil.
2. **Přejímka funkcí:** na V1 ověřit skutečný příjem BEAST/JSON a failover, CRC/CPR, ICAO i non-ICAO identity, stáří poloh, důvěryhodnost kategorií, obnovu SSE při výpadku/změně epochy, 5 000 letadel a ukládání historie. Přiložit výsledky CI a provozních testů.
3. **Výkon:** porovnat CPU p95/p99, event-loop, paměť RSS, přenos SSE, snímkovou latenci a četnost zápisů PostgreSQL před/po. Měření SwiftShader V2 není benchmark skutečné grafické karty.
4. **Zrušení DEV infrastruktury:** po ověření konzumentů vypnout V2 runner, auto-deploy, systemd služby/časovače, reverse proxy/DNS/TLS a oddělené DB role/databázi až po zachování potřebných dat. **Tento krok nic takového nemění.**
5. **Schválení:** po úspěšném CI/CodeQL, nasazení a desktop/mobil smoke V1 samostatně rozhodnout o archivaci nepotřebných experimentů V2. Vzdálený repozitář V2 smazat až po uložení obnovitelného mirroru a výslovném potvrzení.

## Rozsah prvního přenosu

Při neznámém typu letadla čte V1 již existující `AircraftView.category` z aktuálního datového toku a vybere již přibalené SVG pro kategorie A1–A6/B4. Nepřibývá HTTP, polling, SQL, vlákno ani nový DOM/MapLibre marker. Neznámé/rezervované hodnoty používají původní fallback; speciální vrtulníky, kluzáky, drony a pozemní objekty zůstávají beze změny. Kategoriová ikona nenahrazuje stávající počáteční doplnění přesného typu.

**Před merge ověřit:** cílený Vitest klasifikace ikon, lint, TypeScript, audit ikon a příslušný browser smoke mapy. Přítomnost nových testů v PR **není důkaz jejich proběhnutí**.
