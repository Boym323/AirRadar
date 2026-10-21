# Architektura

Tento dokument popisuje architekturu zachovaných funkcí pracovní větve AirRadaru v PR #1096, **nikoli** již nasazenou produkci. Vlastnictví stránek a API je v docs/features.registry.json a výběr funkcí v docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json.

## Zpracování živých letadel

Hlavním vlastníkem stavu letadel je lib/server/aircraft-state.ts. Lokální ADS-B se přijímá z nakonfigurovaného readsb JSON a/nebo Beast. lib/server/providers.ts při chybějícím lokálním zdroji správně vrací diagnostickou chybu, nikoli uměle vytvořená produkční letadla. Simulované údaje jsou jen v izolovaných testovacích fixture. Volitelné ADSBHub a ADSB.lol poskytují omezené síťové pokrytí s hlídáním původu dat a nenahrazují skutečný lokální příjem.

Živé snapshoty a SSE napájejí radar a detail letadla. Pokrytí přijímače a statistiky mají vlastní sběr a retenci. Pozorování jsou ukládána do zachované historie. Horká cesta snapshotu stále vykonává Navigation Integrity a statistiky, ale **nespouští** Flight Intelligence, predikční shadow, Operational Digital Twin ani původní AlertEngine.

## Zachované rozhraní a HTTP kontrakty

Zachované stránky: /, /aircraft/[hex], /airports, /airports/[icao], /navigation, /navigation-integrity, /receiver/coverage, /system a /weather.

Důležité zachované API: /api/aircraft, /api/aircraft/[hex], /api/search, /api/stream, /api/airports, /api/airports/[icao], /api/history/[hex], /api/statistics, /api/atc/sectors, /api/ats/routes, /api/navigation/data, /api/navigation-integrity/current, /api/weather/metar-map, /api/weather/sigmet, /api/map-context/at, /api/map-context/range, /api/ogn/state a /api/ogn/stream. Interní a volitelná komunikační, Web Push a chráněná diagnostická API popisuje registr funkcí.

Samostatné stránky Flight Story, Time Machine, predikce, Operational Twin, původní Fleet/Watchlist pravidla, staré letištní analytiky a importer SID/STAR byly odstraněny. Seznam 50 vyřazených API a 21 stránek je v docs/audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json. Externí odběratele těchto adres je nutné prověřit na přístupových logách před nasazením.

## ATC, navigace a příjem

Publikovaná geometrie ATC sektorů, ATS trasy a navigační data zůstávají v mapě i v kontextu tras letadel. Volitelný OGN/FLARM má nezávislý APRS/DDB/SoftRF příjem, pravidla ochrany soukromí a SSE bez zápisu do ADS-B historie. RXW Hub zachovává metadata komunikace ACARS/VDL2; živá mapa H1/FPN byla odstraněna. Placený FlightAware se volá pouze na výslovné vyžádání a respektuje cache/rozpočet. ADSBDB, tar1090-db a referenční data letišť slouží k obohacení informací.

## Počasí a historický kontext mapy

Zachované počasí zahrnuje skutečný METAR/TAF, SIGMET, PIREP, dostupná pozorování z letadel a radar ČHMÚ. Omezený archiv kontextu mapy obsahuje dřívější METAR, radarové snímky i plánované české AUP/UUP záznamy.

**Plánovaný sběr T12 je zastavený.** MapContextArchiveService.poll() pravidelně aktualizuje jen METAR a radar ČHMÚ; již nevolá síťovou čtečku Czech AIM. Starší AUP data lze stále číst přes MapContextArchive.resolveAupAt() a historické API /api/map-context/at a /api/map-context/range. Metoda MapContextArchive.addAup() zůstala kvůli kompatibilitě archivu, ale nemá časovaný síťový zdroj. Neodstraňovat soubory map-context-aup-v1.json ani historické datové typy.

## Uložená data a upozornění

PostgreSQL záznamy Flight, FlightPosition, FlightEvent a další historické tabulky, migrace, navigační pozorování i statistiky zůstávají i při odstranění starých uživatelských stránek. Uložené záznamy doručování upozornění zůstávají beze změny. Samostatný worker doručuje Pushover a nadále existují Web Push/VAPID API. Starý pravidlový engine je vypnutý a nevyhodnocuje každé letadlo. Kompatibilní stav AlertStatus „disabled“ zůstává do prověrky externích konzumentů.

## Bezpečnost, měření a vydání

Veřejné zdravotní a systémové odpovědi jsou sanitizované, chráněné detaily providerů vyžadují přihlášení. Požadavky na providery jsou omezené a výpadek nesmí předstírat úspěšný lokální ADS-B příjem. Sledují se čerstvost příjmu, zpoždění DB a cache tras, událostní smyčka T58, RSS/CPU, SSE klienti a fronty doručení.

Syntetická zátěž 1×/2×/4×, TypeScript, Vitest, CodeQL a prohlížečové CI ověřují bezpečnost větve, ale nenahrazují A/B měření živé produkce ani kontrolu přístupových logů. Kanonická metrika produkčních řádků je scripts/code-metrics.mjs. PR #1096 nemění běžící produkci bez zvláštního povolení merge/nasazení a rollback plánu.
