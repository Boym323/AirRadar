# V2-01 — Hranice architektury a důkazní záznam (21. 10. 2026)

**Základ:** main 53f137d8a3b43766d2125a1bca87a4e7c13d0bd9.
**Izolace:** větev v2/01-contract-boundaries-2026-10-21; žádné sloučení do main, vydání, zásah do běžící služby ani databáze.
**Stav:** PARTIAL — důkazy CI jsou neúplné a celková funkční parita není ověřena.

## Graf závislostí a vlastníci událostí

    readsb JSON / BEAST -> lib/server/providers.ts
                        -> lib/server/aircraft-state.ts (jediný owner)
                        -> RAM snapshoty
                           |-> lib/server/history.ts -> vzorkovaná historie PostgreSQL
                           |-> app/api/stream/route.ts
                              -> lib/server/public-serialization.ts
                              -> SSE V1/V2
                              -> components/radar/use-radar-live-aircraft.ts
                              -> components/airradar-app.tsx

Diagram vyjadřuje vlastnictví událostí, nikoli synchronní pořadí volání. Příjem ze sítě sdílí AircraftStateService a nesmí spustit druhý lokální poller.

| Událost / vedlejší efekt | Vlastník | Neměnná pravidla |
| --- | --- | --- |
| Lokální příjem, stale guard a source affinity | lib/server/aircraft-state.ts | Jediný poller, ICAO jako identita |
| Výběr/failover přijímače | lib/server/providers.ts | Typový port nespouští polling |
| Veřejná data | lib/server/public-serialization.ts | Sanitizace polohy a chyb providerů |
| Distribuce do prohlížečů | app/api/stream/route.ts | SSE, 15 s heartbeat, coalescing, 503 |
| Historie | lib/server/history.ts | Jen vzorkované lokální záznamy, výpadek DB nesmí zastavit radar |
| Interaktivní mapa | components/airradar-app.tsx | Bez přímého runtime importu serverových modulů |
| Radarové hranice ČHMÚ | lib/contracts/weather-radar.ts | Stejná konstanta jako v původním serverovém modulu |
| Soukromí OGN | lib/server/ogn-state.ts | Pravidla DDB a izolace od ADS-B historie |
| Diagnostika | lib/server/system-status.ts | Bezpečné veřejné čtení bez zahřívání zdrojů |
| Doručování | lib/server/alert-delivery-worker.ts | Asynchronní, mimo kritický ingest |

## Skutečně implementované změny

1. lib/contracts/history.ts: čisté typy veřejné historie a detailu; lib/server/history.ts je nadále exportuje pod původními jmény.
2. lib/contracts/weather-radar.ts: přesunuté hranice ČHMÚ se zachováním objektové identity; serverový modul je znovu exportuje.
3. lib/ports/aircraft-provider.ts: port lokálního přijímače bez konkrétních provider implementací.
4. components/airradar-app.tsx: nové klientsky bezpečné importy.
5. scripts/v2-architecture-graph.mjs: analýza TypeScript AST, importního grafu, typových a runtime hran, cyklů, importů serveru do klienta a dosažitelnosti z klientských vstupních bodů.
6. tests/v2-architecture-boundaries.test.ts: kontraktní a architektonické fixture testy. CI kontroluje hranice a ukládá graf před/po.

Příkazy: npm run architecture:check, npm run architecture:graph; striktní kontrola pomocí node scripts/v2-architecture-graph.mjs --strict --json.

Analýza zachytí statické a literálové dynamické importy; nevidí například dynamické cesty vypočítané až za běhu.

## Matice KEEP

Zadání uvádí 79 KEEP a 99 REMOVE, ale kanonický seznam SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json obsahuje 88 KEEP a 90 REMOVE. V2-01-KEEP-DEPENDENCY-MATRIX-2026-10-21.json proto eviduje všech 88 aktuálně zachovávaných funkcí a kandidátní architektonické rodiny. Jednotlivé vazby a funkční parita jsou označeny NOT_VERIFIED_PER_ID. Nejde o potvrzení 88 úspěšných regresních testů.

## Porovnání a zbylá evidence

CI vytváří archiv přesného společného předka s main a spouští na něm stejný analyzátor jako v PR. Artefakty before.json, after.json a after.dot obsahují porovnání.

První získaná CI evidence na dílčím SHA 3904c114: 486 -> 490 souborů, 926 -> 928 runtime importů, 353 -> 359 typových importů, 722 -> 730 vazeb mezi vrstvami, 0 -> 0 cyklů, 0 -> 0 server-to-client importů a **1 -> 0 serverových modulů dosažitelných v klientském runtime grafu**. Toto není výkonové A/B měření produkce ani potvrzení pro finální SHA.

Neověřeno: typecheck CPU/čas a RSS, ADS-B event-loop P95/P99, produkční CPU/RSS, datový objem SSE, regresní parita každé KEEP funkce a dokončení všech CI kontrol. Typový refaktor sám o sobě nemá prokazatelné zrychlení.

Původní CI doběhl na nové architektonické kontrole úspěšně, ale docs:check zaznamenal čtyři chybějící české překlady; tři jsou starší dokumenty v main, čtvrtý tento report (právě doplněn). Starší zadání mimo rozsah V2-01 neměnit jen kvůli zelenému CI. Neprovádět merge, dokud se rozhodne o těchto blokérech a neověří se přesný SHA.

## Rizika a návrat

Nesprávně zachycené dynamické importy, současné nepřímé závislosti, chybějící výkonnostní důkazy a neověřených 88 KEEP. V2-02 a další etapy nejsou součástí změny. Návrat znamená revert této izolované větve/PR; bez DB migrací, bez operací nad historickými daty. Produkční nasazení je samostatná etapa V2-15.
