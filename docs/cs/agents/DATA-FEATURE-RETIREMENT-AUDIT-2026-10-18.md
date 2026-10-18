# AirRadar — audit vyřazení nepotřebných datových toků a funkcí (18. 10. 2026)

[English](../../agents/DATA-FEATURE-RETIREMENT-AUDIT-2026-10-18.md)

> **Zadání konkrétní úlohy, nikoli globální pravidla.** Nejprve načti [AGENTS.md](../../../AGENTS.md), potom [CODEX-CONTEXT.md](../CODEX-CONTEXT.md). Přednost má současný kód a ověřený commit, nikoli tento datovaný inventář. Nenačítej všechnu dokumentaci. Toto zadání se liší od [auditu zbytečné runtime práce](RUNTIME-REDUNDANT-WORK-2026-10-18.md): hledá nepotřebné datové produkty a opravdu nevyužívané funkce, nikoli jen rychlejší implementaci stávajícího provozu.

## Cíl a hranice oprávnění

Prověř celý řetězec **externí zdroj → příjem/dekódování → normalizace → RAM/cache → databáze/soubor → API/SSE → UI/alerty/analytika/historie/fallback**. Najdi data, která AirRadar načítá, počítá, ukládá, přenáší nebo udržuje, a přitom nemají prokazatelného konzumenta ani smysluplný účel pro odolnost systému. Bezpečné prokazatelně mrtvé moduly a nevyužité artefakty po cílených testech autonomně odstraňuj. Pokud má funkce stále konzumenta, veřejné API, historická data, fallback nebo uživatelský význam, nepovažuj vyřazení za schválené: popiš dopad a označ **NEEDS_PRODUCT_DECISION**, než změníš význam systému.

Výsledek: snížit CPU, RAM/heap, GC, síťové požadavky a objem dat, DB operace a údržbu **bez poškození** základního ADS-B/MLAT/ACARS/VDL2 provozu, historie, veřejných kontraktů, stále používaných meteorologických funkcí a ochranné diagnostiky. Upřednostni odstranění doloženě mrtvé práce před spekulativním přepisem do Rustu/C++.

Bez destruktivních operací v produkční DB, změn živé konfigurace, ručního deploye/restartu a neodsouhlaseného testování poskytovatelů. Produkci kontroluj jen povolenými read-only prostředky. Push do main může vyvolat automatické CI/CD; dodrž pravidla jediného zapisujícího agenta a kontroly konkrétní SHA z kořenového AGENTS.md.

## Jak prokázat skutečné nevyužití

U každého kandidáta dolož:
1. **Vlastník a spouštěč:** přesný soubor/funkce, výchozí feature flag, kdy kód běží (start, rámec, poll, timer, API, administrace, pouze CI).
2. **Konzumenti:** importy, nepřímé a dynamické závislosti, reexporty, workery, veřejné API a externí klienti, SSE, UI, mobily, alerty, historické přehrávání, predikce, validace, obnova, diagnostika a testy. Chybějící interní import **neznamená**, že veřejné API nikdo nepoužívá.
3. **Ukládání:** RAM, checkpointy, logy, soubory, tabulky/indexy PostgreSQL, retence, cleanup, migrace; odliš záložní/recovery data od duplicit.
4. **Produkční evidence:** bezpečně zjištěné zapnuté/vypnuté zdroje, hity/missy, čtení a zápisy, unikátní přínos, frekvence, CPU/alokace, síťové bajty, počet řádků a obsazené místo. Nedostupné měření označ **NOT_MEASURED**.
5. **Bezpečnost:** parita, původ dat/source affinity, expirace, ICAO identita, rozdíl LOCAL/NETWORK, soukromí, licence, zabezpečení, fallback, výpadky.

Rozhodovací štítky inventáře: **REMOVE** (prokazatelně mrtvé a bez kontraktu), **OPTIMIZE** (potřebné, ale nehospodárné), **DISABLE_CANDIDATE** (kandidát pro vypnutí, nikoli změna produkčního nastavení), **KEEP** (potřebné včetně zálohy/obnovy), **NEEDS_PRODUCT_DECISION** (aktivní funkce či externí kontrakt), **UNKNOWN** (nedostatek důkazů). Tvrzení označ **PROVEN / HYPOTHESIS / NOT_VERIFIED**. Odděl očekávanou od změřené úspory.

## Priority

### P0 — dokončení vyřazování modelového větru

Odstranění mapy/API větru 18. 10. 2026 **neprokazuje**, že modelový vítr už nikde nepracuje. V kontrolovaném kódu lib/server/operational-twin.ts stále volá defaultWindAloftProvider.getWind pro hladiny koridoru, staví weatherCorridor a windTimingShadow a provádí wind-timing promotion. Na stejný builder může přes periodickou kalibraci sahat lib/server/aircraft-state.ts. Komponenta Digital Twin může zobrazovat větrný profil. Prověř minimálně:
- lib/server/wind-aloft.ts; lib/weather/aircraft-wind-context.ts; lib/weather/corridor-intelligence.ts
- lib/server/operational-twin.ts; lib/operational-twin/wind-timing-shadow.ts, wind-timing-promotion.ts a event-outcome.ts
- lib/server/aircraft-state.ts; components/aircraft-operational-twin.tsx; feature flagy; veřejné DTO; dokumentaci.

Zjisti, zda má být modelový vítr skutečně úplně vyřazen, nebo stále patří do Digital Twin. Pouze při ověřeném souladu s produktovým záměrem odstraň celý modelový datový řetězec a osiřelá pole včetně závislých výpočtů. Zachovej SIGMET/PIREP, kanonickou trajektorii, přímo pozorované BDS meteorologické hodnoty a všechny ostatní funkce Digital Twin. Jinak označ NEEDS_PRODUCT_DECISION; nevypínej potichu viditelné prvky ani neměň veřejné DTO. Regresním testem prokaž, že žádný skrytý model-wind fetch nezůstal při kalibraci ani otevření detailu. Nezaměňuj model ICON-EU/ALADIN za data přímo pozorovaná letadly.

### P1 — duplicitní síťové zdroje a polling

Prověř lib/server/network-failover-provider.ts, network-source-value.ts, ADSBHub, ADSB.lol raw/HTTP, konfiguraci a diagnostiku. Využij počty všech/aktuálních/unikátních/překrývajících se pozic, skutečné zapnutí zdrojů a testy výpadků. Změř reálný unikátní přínos a cenu síťového příjmu/parsing/slučování. Nevypínej zdroj jen kvůli překryvu ICAO: důležité jsou záloha, MLAT, freshness, priorita, provenience a licence. Vypnutí navrhni jako DISABLE_CANDIDATE s dopadem; produkční flagy v rámci auditu neměň.

### P1 — automatické shadow a validační výpočty

Prověř lib/server/aircraft-state.ts, prediktivní validátory, navigation-integrity, Operational Twin a Track Fusion. U každého periodického výpočtu dohledávej konkrétní konzumenty v administraci, reportech, release gatech a pravidlech retence důkazů. Najdi práci, která pokračuje i při vypnuté funkci nebo nemá následný užitek. Měř podmíněné zkratky místo plošného vypnutí experimentů. Zachovej readiness, ground truth a historickou reprodukovatelnost.

### P2 — nadbytečné ukládání a cache

Prověř FlightPosition/Flight/FlightEvent, AircraftWeatherObservation, PredictiveObservation, Navigation Integrity, route/ADSBDB a aviation-weather cache, Map Context archivy a kalibrace. Porovnej produkci řádků se čtením, retencí a potřebou historie. Nejprve vyhodnoť již existující **shadow politiku ukládání letových pozic**, neaktivuj ji bez důkazů parity tras a Flight Story. Upřednostni zastavení nepotřebných budoucích zápisů před mazáním staré historie. Žádný DROP/TRUNCATE/DELETE produkčních záznamů ani přepis existujících migrací. Obnova, replay a fallback jsou legitimní konzumenti.

### P2/P3 — metadata, soubory a historické artefakty

U souběžného získávání metadat přes ADSBDB/tar1090 ověř, zda druhý zdroj skutečně přidává potřebná pole. Staré SVG ikony, auditní výstupy a generované snapshoty prověř z hlediska vazeb na produkční bundle a licencí. Odstranění z distribučního balíku není totéž co smazání migrační historie či důkazních auditních artefaktů. Migrační snapshoty/nezbytné licence nemaž jen kvůli velikosti.

## Provedení

1. Zjisti čerstvou SHA main; produkční SHA jen z povolené read-only diagnostiky; ověř soubory, konfiguraci bez tajných hodnot a poslední změny. První výstup je inventář kandidátů. Nepracuj v živém /var/www/airradar.
2. V izolovaném DEV checkoutu udělej cílený call graph (rg, relevantní testy), včetně externích konzumentů. Zapiš rizika smazání a rollback. Nečti celý repozitář do kontextu.
3. Pro měřitelné kandidáty vytvoř srovnatelný baseline (SHA, zátěž, flagy, seed, počet vzorků, verze), CPU/event, alokace, RSS/heap/GC, event-loop P50/P95/P99/max, síťové požadavky/bajty, DB zápisy/čtení/latence a fronty dle potřeby. Historický T58 není důkaz aktuálního stavu. Nula importů či čtení vyžaduje další potvrzení.
4. Autonomně realizuj jednu **prokazatelně bezpečnou** logickou změnu po druhé: spolu s nevyužitým zdrojem odstraň osiřelé plánování, cache, serializaci, testy a neplatnou dokumentaci. Zachovej veřejné kontrakty; jinak uveď NEEDS_PRODUCT_DECISION. Přidej negativní test, že odstraněný externí fetch už nenastává, i pozitivní testy parity/fallbacku.
5. Spusť cílené testy, relevantní typecheck, lint, build a příslušné feature/docs/security/visual/release-scope gates podle AGENTS.md. Při změnách rout aktualizuj docs/features.registry.json a generuj FEATURES.md. Změněnou autoritativní dokumentaci udržuj v EN i CZ. Ověř paritu a opakované A/B na stejné zátěži; ponech pouze přínos nad šumem bez regresí bezpečnosti a tail latencí.
6. Před push znovu zkontroluj origin/main, celý diff a jediného zapisujícího agenta. Používej malé ověřené neforce commity přímo do main dle AGENTS.md, rutinní PR nevytvářej. I docs-only push může spustit CI/CD: před dalším deploy-bearing commitem ověř CI/CodeQL/release pro přesnou SHA. Žádný ruční deploy ani T58 bez zvláštního schválení.
7. Při blokaci (nedoložený konzument, ztráta parity, neúspěšné testy, release check, nevěrohodný benchmark, DB/provozní omezení) zastav daného kandidáta, zachovej bezpečnost a vysvětli důvod. K nezávislému bezpečnému kandidátovi pokračuj jen v souladu s pravidly single-writer a release.

## Povinný závěrečný report

Odevzdej stručnou českou tabulku pro každého kandidáta: **priorita; zdroj a přesná funkce; spouštěč; současný konzument/fallback; zjištěná CPU/DB/síťová zátěž; odkaz na důkaz; REMOVE/OPTIMIZE/DISABLE_CANDIDATE/KEEP/NEEDS_PRODUCT_DECISION/UNKNOWN; regresní riziko; změna; A/B úspora nebo NOT_MEASURED**. Odděl **DONE / NOT_DONE / BLOCKED**. U každé provedené změny vypiš soubory, SHA commitu, odkazy na CI/CodeQL/release a postup rollbacku. Uveď i záměrně ponechané části a proč. Nikdy netvrď, že je změna v produkci, dokud neověříš nasazenou SHA.
