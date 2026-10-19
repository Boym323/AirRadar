# AirRadar – možnosti redukce zdrojového kódu (19. 10. 2026)

[English](../../research/CODE-REDUCTION-OPTIONS-2026-10-19.md)

**Stav: návrh; nejde o schválení odstranění uvedených produkčních funkcí.** Výchozí metrika `docs/metrics/code-history.json`, verze v1.0.536 (`3961d366`): 139 974 neprázdných řádků produkčního kódu a 45 625 řádků testů. Pro cíl **méně než 100 000 řádků produkčního kódu** je třeba čistě odebrat nejméně 39 975 řádků. Metrika zahrnuje nástroje ve `scripts/`, nikoli testy, dokumentaci, migrace ani soubory `public/`.

## Ověřená velikost vyčleněných souborů – ne garantovaná úspora

| Oblast | Zdrojové řádky ve vybraných souborech | Co se ztratí odstraněním celé funkce | Doporučení |
| --- | ---: | --- | --- |
| OGN/FLARM | 3 082 | Samostatný OGN APRS, sledování cílů na mapě/SSE, DDB/SoftRF a ochrana jejich soukromí | Kandidát, pokud se nepoužívá |
| FlightAware | 406 | Placené doplňování letových plánů a diagnostika využití | Kandidát, pokud se nepoužívá API |
| ACARS/VDL2 (RXW) | 1 170 | FPN body, komunikace ACARS a historické zobrazení tras | Zatím zachovat |
| Digital Twin | 9 625 | Kalibrace výsledků, situace letadel, regionální pozornost; zásah i do predikcí | Odděleně zredukovat staré generace |
| Prediktivní subsystém | 5 251 | ETA, dráhy, změny dráhy, trajectory advisory a readiness | Rozhodnutí s velkým dopadem |
| Pokročilé počasí | 6 570 | Meteorologická API, radar, PIREP, SIGMET, kontext a další vrstvy | Zachovat základní METAR, zvažovat rozšíření |
| Letištní operace | 6 280 | Letištní přehledy, odhady drah/příletů, pohyby a jejich API | Oddělit katalog od náročné analytiky |

**Součty nelze jednoduše sčítat:** některé soubory se překrývají (např. `components/airport-weather.tsx` je v letištích i počasí). Sdílené UI, konfigurace, překlady, další závislosti a testy nejsou úplně započítány. Uvedené řádky **nejsou prokazatelně mrtvý kód ani garantovaná čistá úspora**. Před odečtením překryvů činí součet těchto sedmi oblastí 32 384 řádků; samotným odstraněním vypsaných souborů tedy nevznikne požadovaná úspora 39 975 řádků.

## Co má zůstat

- readsb/Beast ingest, identita ICAO, jediný AircraftStateService, lokální pozorování jako autorita, ohraničené stavy a stopy a arbitráž síťových zdrojů.
- SSE V2, freshness/failover, veřejné sanitizované diagnostiky a ochrana administračních zápisů.
- Historická data a bezpečné migrace do případného zvlášť schváleného plánu změny.
- Testy bezpečnostních kontraktů, parity, ochrany soukromí a vydávání, měření T58. Pomocné nástroje T53/T57 **stále využívá T58**.

## Doporučené etapy

1. **Ověřit využití:** nezávadné souhrny počtů požadavků a provozních přepínačů bez přístupových údajů či identifikátorů letadel; před odstraněním ověřit nevyužívanou integraci i externí konzumenty.
2. **Malé bezpečné zásahy:** odpojené obrazovky, staré paralelní experimenty, duplicity, jednorázové skripty až po kontrole workflow, npm příkazů, systemd a ručních postupů.
3. **Volitelné integrace:** pokud nejsou používané, nejdříve FlightAware a OGN. Mazat celé jejich propojení včetně testů a EN/CZ dokumentace. RXW/ACARS nyní zachovat.
4. **Velké funkční celky:** rozhodnout mezi pokročilým počasím + letištní analytikou nebo starými generacemi prediktivního Twinu; nikoli odstranit vše bez kontroly dopadů.
5. **Zbývající rozdíl:** konsolidovat skutečně duplicitní implementace podle grafu volání a porovnat výkon před/po. Nepřesouvat soubory do vyjmutých složek jen kvůli číslu, neminifikovat zdrojový kód a nesmazat testy nebo migrace pouze kvůli metrice.

## Kontroly každého odstranění

- `npm run features:check`, `npm run docs:check`, lint, typecheck a relevantní Vitest; žádná osiřelá API cesta nebo zastaralá registrace.
- CI, CodeQL, produkční browser testy a syntetická zátěž 1×/2×/4×; T58 pro zásahy do ingestu nebo event loopu.
- Změřit produkční LOC před/po na konkrétním commitu, ne odvozovat úsporu z hrubého odhadu.
- Nasazovat jen běžným release CI, ověřit release identity a Integration Health před další změnou.
