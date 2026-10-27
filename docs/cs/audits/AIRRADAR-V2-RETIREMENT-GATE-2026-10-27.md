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

## Skutečný migrační a archivační stav

- **PR [#1115](https://github.com/Boym323/AirRadar/pull/1115) byl sloučen do V1 `main`**, commit `6a8f5dea`. Produkční GitHub workflow [#40514851874](https://github.com/Boym323/AirRadar/actions/runs/40514851874) skončilo úspěšně včetně jobu „Deploy production“. Tím není doložen samostatný hardwarový FPS benchmark.
- **PR [#1117](https://github.com/Boym323/AirRadar/pull/1117) byl sloučen**, commit `8b62549f`, a odděluje DF18 CF0/CF1; související PR CI, Rust parity, CodeQL a syntetická zátěž prošly. Produkční release samostatně ověřit.
- **Úplná záloha historie V2 byla vytvořena a testem obnovena**: archivní větev [`archive/airradarv2-complete-history-20261027`](https://github.com/Boym323/AirRadar/tree/archive/airradarv2-complete-history-20261027) v repozitáři V1. Soubor `AirRadarV2-full-history.bundle` má 1 664 501 bajtů, SHA-256 `12d3c50172cf3e51e5bde50e3f1c667cbba2bfc0153895128e102a474ddd7c36`. Uloženo 158 Git referencí včetně 34 větví a 63 tagů; `main` V2 = `7f0ad16bc7a4577a4348b188941a07c8f18b01c1`. [Archivační workflow #40516350354](https://github.com/Boym323/AirRadar/actions/runs/40516350354) ověřilo `git bundle verify`, kompletní shodu referencí po `git clone --mirror` a úspěšně bundle uložilo do samostatné větve V1. Do produkčního `main` nebyl bundle vložen.
- Po stažení archivního souboru použij `sha256sum -c SHA256SUMS.txt` a `git clone --mirror AirRadarV2-full-history.bundle AirRadarV2-restored.git`. Jediná kopie v GitHubu **není nezávislá offline záloha**; před smazáním V2 si soubory z archivační větve stáhni také mimo GitHub.
- Stále je nutno odstavit **externí DEV LXC**: zjistit aktivní `airradarv2*` systemd služby/timery, repo-scoped runner, Nginx proxy a samostatnou DEV PostgreSQL databázi/role; před deaktivací určit aktuální konzumenty, nepotřebná data/účty a rollback. K těmto hostitelům nebylo v tomto kroku administrátorské připojení. **Žádná externí služba ani DB nebyla zastavena/smazána**.

## Podmínky bezpečného smazání V2

1. **Záloha:** vytvořit úplný Git mirror V2 mimo GitHub včetně historie a tagů. Uchovat potřebné ADR, testovací fixture, původ/licence ikon, provozní návody a důkazy měření. Pouhý odkaz na V2 by po smazání nestačil.
2. **Přejímka funkcí:** na V1 ověřit skutečný příjem BEAST/JSON a failover, CRC/CPR, ICAO i non-ICAO identity, stáří poloh, důvěryhodnost kategorií, obnovu SSE při výpadku/změně epochy, 5 000 letadel a ukládání historie. Přiložit výsledky CI a provozních testů.
3. **Výkon:** porovnat CPU p95/p99, event-loop, paměť RSS, přenos SSE, snímkovou latenci a četnost zápisů PostgreSQL před/po. Měření SwiftShader V2 není benchmark skutečné grafické karty.
4. **Zrušení DEV infrastruktury:** po ověření konzumentů vypnout V2 runner, auto-deploy, systemd služby/časovače, reverse proxy/DNS/TLS a oddělené DB role/databázi až po zachování potřebných dat. **Tento krok nic takového nemění.**
5. **Schválení:** po úspěšném CI/CodeQL, nasazení a desktop/mobil smoke V1 samostatně rozhodnout o archivaci nepotřebných experimentů V2. Vzdálený repozitář V2 smazat až po uložení obnovitelného mirroru a výslovném potvrzení.

## Rozsah prvního přenosu

Ve V1 opraveno také dekódování ADS-B identifikačních rámců BEAST: původní `A${typeCode}` chybně interpretovalo Type Code jako číslo kategorie. Převzatá logika V2 používá **TC4=A, TC3=B, TC2=C** a spodní tři bity zprávy jako podtyp. Akceptuje pouze A1–A7, B1/B2/B4/B6 a C1/C2 z CRC-validních rámců DF17 nebo DF18 CF=0. Rezervované hodnoty nepřepisují poslední platnou kategorii. Samostatná navazující změna odděluje `DF18 CF=0` (ICAO) od `DF18 CF=1` (ne-ICAO, prefix `~`) a odmítá CF=2–7, dokud nebude doložena jejich nezaměnitelná provenience. Syntetické testy potvrzují oddělení polohových CPR stop i při stejných 24 bitech. Provozní měření rozdílu vůči V2 zůstává otevřené. Doplněny jsou přímo testy dekodéru, CRC i negativních případů.


Při neznámém typu letadla čte V1 již existující `AircraftView.category` z aktuálního datového toku a vybere již přibalené SVG pro kategorie A1–A6/B4. Nepřibývá HTTP, polling, SQL, vlákno ani nový DOM/MapLibre marker. Neznámé/rezervované hodnoty používají původní fallback; speciální vrtulníky, kluzáky, drony a pozemní objekty zůstávají beze změny. Kategoriová ikona nenahrazuje stávající počáteční doplnění přesného typu.

**Výsledky:** hlavní CI #40514851874 u PR #1115 prošla i se syntetickými testy; PR #1117 prošla samostatnou kontrolou CI/BEAST/CodeQL. Produkční hardware a fyzický mobil vyžadují vlastní měření.
