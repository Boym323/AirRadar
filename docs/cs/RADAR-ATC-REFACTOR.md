# Odlehčení ATC v hlavní mapě AirRadaru (2026-10-19)

## Rozsah
Hlavní mapa slouží k zobrazení **publikovaných ATC sektorů** a jejich základních údajů (název, služba, zdroj, platnost, frekvence, výškové hranice a polohy vysílačů). Plánované využití prostorů AUP/UUP se načítá pouze po zapnutí jeho samostatné vrstvy. Vybranému letadlu zůstává ATC/ATS kontext a odhad předání; nejde o skutečně potvrzenou komunikaci ani skutečnou operativní konfiguraci řízení.

## Co už hlavní mapa nedělá
- Neobnovuje `/api/atc/sectors/traffic` každých 12 s.
- Neobnovuje `/api/atc/sectors/transitions` každých 15 s.
- Nenačítá samostatné panely ATC Vertical Traffic / Sector Flows ani netvoří tři překryvné MapLibre traffic vrstvy.
- Nevrací provozní odhady do detailu letadla jako údaj o skutečné komunikaci či přidělení sektoru.
- Vybraný ATC/ATS kontext obnovuje pouze u vybraného letadla, jedním navazujícím požadavkem a nejdříve po 30 s. Dřívější požadavky se při změně výběru přeruší.

## Zachované kontrakty
Databázové schema, import eAIP, publikované ATC/ATS geometrie, výškové přiřazení, API `/api/atc/sectors`, `/api/airspace/activity`, `/api/aircraft/[hex]/context` a samostatné stránky `/airspace` a `/airspace/sectors/[id]` se nemění. Historické traffic / transition endpointy zůstávají pro jiné spotřebitele. V1 radar presety při načtení ignorují již zrušený příznak `showAtcTraffic` a zachovávají ostatní nastavení.

## Výkon a ověření
Změna odstraňuje pravidelné dotazy z mapového režimu **pouze při dříve zapnuté traffic vrstvě**; bez izolovaného benchmarku netvrdíme konkrétní procento úspory. Kontroly: typecheck, lint, Vitest, build, příslušné browser gates, CodeQL, syntetická zátěž a zkouška hlavní mapy s ATC vypnuto/zapnuto, kliknutím na sektor, výběrem letadla a návratem ze starého presetu.
