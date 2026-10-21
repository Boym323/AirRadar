# Funkce a routy

<!-- feature-registry:start -->
## Registr funkcí

Aktuální rozsah API je definován v [`features.registry.json`](../features.registry.json). Anglická verze registru je automaticky ověřovaná v CI.

| Funkce | Stav | Kategorie | Zavedeno | Stránky | API | Shrnutí |
| --- | --- | --- | --- | --- | --- | --- |
| ACARS/VDL2 Communications (RXW Hub) | optional | aircraft / communications | Před registrem | `/aircraft/:hex` | `/api/aircraft/:hex/communications` | Volitelná integrace RXW Hub ACARS/VDL2; historické záznamy zůstávají čitelné. |
| Aircraft & Flight Detail | production | history | Před registrem | `/aircraft/:hex` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/photo`<br>`/api/history/:hex` | Detail letadla, aktuální telemetrie a zachovaná historie pozorování. |
| Airport Intelligence | production | airports | Před registrem | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao` | Katalog letišť a detail s dráhami, mapou, okolním provozem a METAR/TAF. |
| ATC & ATS Intelligence | production | atc | Před registrem | `/navigation` | `/api/atc/sectors`<br>`/api/ats/routes`<br>`/api/navigation/data` | Zachovaná geometrie ATC na mapě a referenční navigační data ATS. |
| FlightAware Usage Administration | internal | operations | Před registrem | — | `/api/admin/flightaware/usage` | Administrace spotřeby volitelné integrace FlightAware. |
| Investigation Links | production | productivity | Před registrem | `/navigation-integrity`<br>`/navigation` | — | Odkazy se stavem vybraných navigačních a analytických obrazovek. |
| Live Radar | production | radar | Před registrem | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/search`<br>`/api/stream` | Živý radar ADS-B z lokálního i síťového zdroje, SSE, mapa a vyhledávání bez prediktivních dashboardů. |
| Map Context & Weather | production | weather | Před registrem | `/weather` | `/api/map-context/at`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/pirep`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Zachované meteorologické vrstvy, radar, METAR/TAF, SIGMET a pozorovaná data letadel. |
| Mobile / PWA mode | production | platform | Před registrem | `/`<br>`/airports/:icao` | `/api/push/vapid-public-key`<br>`/api/push/subscribe` | Instalovatelná PWA, oblíbená letiště a zachovaný Web Push transport; stará pravidla už nevytvářejí nové notifikace. |
| Navigation Integrity | production | navigation / safety / intelligence | Před registrem | `/navigation-integrity` | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Pozorování integrity navigace, regionální diagnostika a mapová vrstva. |
| Notification Delivery (L11/L12) | internal | alerts | Před registrem | — | `/api/watchlist/session`<br>`/api/admin/alerts/delivery-health` | Web Push, Pushover, fronta doručování a zdravotní diagnostika. Stará pravidla a Watchlist/Fleet API jsou odstraněné; nové alerty se samy negenerují. |
| OGN / FLARM | optional | traffic | Před registrem | — | `/api/ogn/state`<br>`/api/ogn/stream` | Volitelný provoz OGN/FLARM a samostatný SSE tok. |
| Receiver Coverage | production | receiver | Před registrem | `/receiver/coverage` | `/api/receiver/coverage` | Analýza dosahu přijímače a samostatný přehled pokrytí. |
| Statistics & Recaps | production | analytics | Před registrem | — | `/api/logbook/summary`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic`<br>`/api/statistics/heatmap`<br>`/api/statistics/traffic-profile` | Zachovaná API statistik přijímače a historie; samostatné rekapitulační stránky jsou odstraněné. |
| System Observability | production | operations | Před registrem | `/system` | `/api/admin/altitude/:hex`<br>`/api/health`<br>`/api/system/runtime-history`<br>`/api/system/runtime-performance`<br>`/api/system/integrations`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version` | Provozní diagnostika, stav zdrojů a historické metriky aplikace. |
<!-- feature-registry:end -->

## Zachované stránky

| Routa | Účel |
| --- | --- |
| `/` | Živý radar ADS-B, mapa a zobrazení letadel |
| `/aircraft/:hex` | Detail letadla a uložená historie |
| `/airports` | Katalog letišť |
| `/airports/:icao` | Detail letiště, dráhy, okolní provoz, METAR/TAF |
| `/navigation` | Navigační a ATC/ATS referenční data |
| `/navigation-integrity` | Pozorování integrity navigace |
| `/receiver/coverage` | Pokrytí přijímače |
| `/system` | Stav systému, diagnostika a výkon |
| `/weather` | Počasí a meteorologické vrstvy |

## Odstraněné funkce

Ze současné pracovní větve byly odstraněny Digital Twin, Predictive Intelligence, Flight Intelligence, staré AlertEngine a administrace pravidel Watchlist/Fleet/Geofence, centrum notifikací, samostatné statistické rekapitulace a vyřazené specializované analytické obrazovky.

**L11/L12 zůstávají:** Web Push (VAPID a registrace), Pushover worker, trvalá doručovací fronta a diagnostické API. Dočasný endpoint `/api/watchlist/session` nadále chrání systémovou a doručovací diagnostiku. Živý receiver už nevyhodnocuje stará pravidla, takže zachované transporty samy nevytvářejí nové alerty. Historické databázové záznamy se nemažou.

## Omezení

- **Nesmazat historická data:** záznamy Flight, FlightPosition, FlightEvent ani dřívější uložená upozornění nejsou součástí destruktivních migrací. Historické tabulky AlertOccurrence, AlertDelivery a AlertRule zůstávají zachované pro bezpečnou kompatibilitu.
- **Neporušit hlavní smyčku ADS-B:** zpracování nových zpráv nesmí znovu aktivovat staré vyhodnocování watchlistu, geofence, predikcí nebo Digital Twin. Příjem, ukládání historie, integrita navigace a metriky přijímače musí fungovat samostatně.
- **Neodstraňovat potřebná navigační data:** zachovat aktuální ATC geometrii používanou mapou, ATS trasy, navigační body a vybrané meteorologické vrstvy.
- **Oddělit transport od událostí:** Web Push a Pushover zůstávají technicky dostupné, ale bez aktivního producenta starých alertů nezaručují nová upozornění. Doručovací worker pouze zpracovává zachovanou frontu.
- **Chránit provoz:** veškeré změny probíhají ve stále rozpracovaném PR. Slučování do main, migrace databáze a nasazení na produkci vyžadují dokončené CI, CodeQL a regresní testy. Redukce řádků sama o sobě není měřením úspory CPU nebo RAM.

Dokumentace popisuje draft PR #1096, nikoli již nasazenou produkci.
