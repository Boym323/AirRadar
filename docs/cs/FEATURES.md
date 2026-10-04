# Funkce a routy

<!-- feature-registry:start -->
## Registr funkcí

Tato tabulka je generována z [`features.registry.json`](../features.registry.json).
CI ověřuje, že každou stránku Next.js a API routu vlastní alespoň jedna
registrovaná funkce a že registr neobsahuje zastaralé routy. „Pre-registry“
znamená, že funkce existovala už před zavedením registru a její původní vydání
zatím nebylo historicky přiřazeno.

| Funkce | Stav | Kategorie | Zavedeno | Stránky | API | Shrnutí |
| --- | --- | --- | --- | --- | --- | --- |
| Detail letadla a letu | production | history | Pre-registry | `/aircraft/:hex`<br>`/flights/:id`<br>`/history` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/photo`<br>`/api/aircraft/:hex/route-weather`<br>`/api/history/:hex`<br>`/api/history/flights`<br>`/api/history/flights/:id` | Identita letadla, kontext, fotografie, počasí na trase, zachycené lety a vzorkovaná historie. |
| Informace o letištích | production | airports | Pre-registry | `/airports/:icao` | `/api/airports`<br>`/api/airports/:icao`<br>`/api/airports/:icao/movements`<br>`/api/airports/:icao/traffic` | Katalog letišť, kontext drah, pozorovaný provoz a odvozené informace o pohybech. |
| ATC a ATS informace | production | atc | Pre-registry | — | `/api/airspace/activity`<br>`/api/atc/sectors`<br>`/api/atc/sectors/:id/history`<br>`/api/atc/sectors/:id/traffic`<br>`/api/atc/sectors/history`<br>`/api/atc/sectors/traffic`<br>`/api/atc/sectors/transitions`<br>`/api/atc/validation`<br>`/api/ats/routes`<br>`/api/procedures` | ATC sektory, přechody, validace, ATS tratě, postupy a plánovaná aktivita vzdušného prostoru. |
| Letové informace | production | intelligence | Pre-registry | `/intelligence` | `/api/intelligence/events`<br>`/api/intelligence/stream` | Časová osa a stream událostí životního cyklu a přechodů letu. |
| Správa využití FlightAware | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrativní diagnostika využití volitelné integrace FlightAware. |
| Živý radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/search`<br>`/api/stream` | Lokální a rozšířený živý ADS-B radar, vyhledávání, snapshoty letadel a SSE streamování. |
| Kontext mapy a počasí | production | weather | Pre-registry | — | `/api/map-context/at`<br>`/api/map-context/aup`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/map-context/wind`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/wind` | Aktuální a historický radar, METAR, vítr, SIGMET a mapový kontext AUP/UUP. |
| Integrita navigace | production | navigation / safety / intelligence | Pre-registry | — | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics` | Konzervativní ADS-B pozorování integrity navigace, omezené regionální kandidáty anomálií, API, diagnostika a radarová vrstva. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Volitelný OGN/FLARM stav respektující soukromí a nezávislý SSE stream. |
| Pokrytí přijímače | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Analýza pokrytí přijímače a samostatný detail pokrytí. |
| Statistiky a přehledy | production | analytics | Pre-registry | `/statistics`<br>`/recap/daily`<br>`/recap/weekly` | `/api/logbook/summary`<br>`/api/recap`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic` | Statistiky přijímače, informace o provozu, příjmové rekordy a denní/týdenní přehledy. |
| Pozorovatelnost systému | production | operations | Pre-registry | `/system` | `/api/health`<br>`/api/system/runtime-history`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version`<br>`/api/admin/altitude/:hex` | Sanitizovaný health, runtime historie, stav providerů a identita buildu. |
| Time Machine | production | history | Pre-registry | `/time-machine` | `/api/time-machine/range`<br>`/api/time-machine/window` | Omezené historické přehrávání všech letadel a okna historického kontextu. |
| Watchlist, alerty a flotila | production | alerts | Pre-registry | `/watchlist`<br>`/alerts`<br>`/fleet` | `/api/alerts`<br>`/api/watchlist`<br>`/api/watchlist/:id`<br>`/api/watchlist/session` | Serverové watchlisty, historie alertů, změny pravidel a pohledy na flotilu. |
<!-- feature-registry:end -->
## Map Context V1/V2

Domovský radar obsahuje volitelné vrstvy, které jsou ve výchozím stavu
vypnuté a tento stav se ukládá: meteorologický radar ČHMÚ s dvouhodinovou
časovou osou snímků, dávkové AWC METAR markery, cacheovaný výškový vítr DWD
ICON-EU na hladinách 850/700/500/300/200 hPa a samostatný pohled plánovaného
vzdušného prostoru AUP/UUP. Veřejné endpointy jsou
`/api/weather/radar/frames`, `/api/weather/radar/frame/:id`,
`/api/weather/metar-map` a `/api/weather/wind`. Podrobná sémantika providerů
a atribuce jsou v [MAP-CONTEXT.md](MAP-CONTEXT.md). Time Machine přidává
Global Map Time V2 s omezeným historickým radarem, METAR, větrem ICON-EU a
kontextem AUP/UUP.

Stav popisuje aktuální cestu v kódu, nikoli přechodný runtime počet nebo to,
zda operátor nakonfiguroval volitelného providera.

## Stránky

| Routa | Účel | Produkční stav |
| --- | --- | --- |
| `/` | Živý MapLibre radar, seznam/filtrování letadel, detail vybraného letadla, labely letadel podle zoomu, živá stopa, překryvy tras/letišť/ATC, volitelné kruhy dosahu přijímače a barevné režimy letadel, klávesové zkratky, stav SSE spojení, kompaktní souhrn ADS-B logbooku, volitelný SIGMET, česká ATS route intelligence a kontext plánovaného vzdušného prostoru AUP/UUP. Volitelný přepínač pokrytí LOCAL/EXTENDED kombinuje lokální readsb s RAM-only síťovými pozorováními ADSB.lol. Volitelná samostatná vrstva, seznam a detail OGN/FLARM používají vyhrazený RAM-only SSE tok. | Produkční jádro; readsb nebo demo provider. OGN, počasí, ATS route intelligence a překryvy aktivity vzdušného prostoru jsou nezávislé/fail-soft. |
| `/aircraft/:hex` | Detail ve stylu flight card s hlavičkou callsign/registrace/typ/provozovatel, živým pohybem a proveniencí, kontextem trasy/flight planu, časovou osou first/last seen, omezeným 30minutovým grafem výšky z nejnovější historie FlightPosition, akcí pro úplnou stopu, trvalými metadaty letadla, nedávnými instancemi letu, 7/30denním souhrnem, celoživotní statistikou instancí Flight, stavem logbooku NEW/RARE/RETURNING, volitelnou fotografií a kompaktním počasím nejprve pro cíl a potom pro odlet. | Produkce; PostgreSQL je nutné pro trvalý detail, počasí/foto jsou volitelné. |
| `/flights/:id` | Flight Story V2 se souhrnem pozorovaného letu, jasně označeným kontextem letišť, badge výrazných událostí, narativní osou first-seen → odvozená událost → last-seen, omezeným playbackem a profily výšky/rychlosti/vertikální rychlosti synchronizovanými s jediným playback clockem. | Produkce s historií PostgreSQL. |
| `/airports/:icao` | Airport Intelligence V3 s Operations Boardem napojeným na jeden sdílený 24h operations/weather controller, receiver-inferred aktivitou, sjednocenou časovou osou pohybů s odkazy na Flight Story, porovnáním runway evidence s větrem a dále s katalogovými metadaty, geometrií drah, METAR/TAF, živým okolním ADS-B provozem, navaid, okolními letišti a 7/30denním souhrnem provozu přijímače. | Produkce; výsledky pohybů/drah jsou omezené inference z lokální vzorkované historie a nejsou autoritativními ATC daty. |
| `/history` | Omezené vyhledávání/seznam instancí letu, detail vzorkovaných pozic a playback mapa. | Produkce; funkce PostgreSQL bez závislosti na živém pollingu. |
| `/time-machine` | Omezené historické přehrávání radaru všech letadel s výběrem UTC, časovou osou, markery událostí, výběrem letadla, stopou vybraného letadla a volitelným historickým kontextem radar/METAR/vítr/AUP-UUP. | Produkce s historií PostgreSQL `FlightPosition`; dostupnost kontextu se řídí aktivací a retencí omezeného archivu. |
| `/statistics` | Agregace přijímače dnes/7 dní/30 dní, porovnání aktuálního a předchozího období, trendy, vizualizace pokrytí, příjmové rekordy, omezený CSV export, receiver-observed traffic intelligence a 7/30denní analytika spolehlivosti pokrytí/přijímače. | Produkční jádro; traffic a range analytika používá omezená čtení PostgreSQL, aktuální čítače přijímače zůstávají v RAM. |
| `/watchlist` | Editor serverových pravidel alertů s presety vzdálenosti 10/25/50/100 km, aktuálním stavem shody, ovládáním zapnutí/vypnutí a posledním uloženým časem triggeru každého pravidla. | Produkce; sdílená pravidla `/var/lib/airradar/alerts.json` plus omezený stav deduplikace/triggerů `/var/lib/airradar/alert-engine-state.json`. Read-only stav je veřejný a mutace vyžadují server-side admin session. |
| `/alerts` | Omezená historie přechodů výskytu/vzdálenosti watchlistu, jednotlivých nouzových přechodů 7500/7600/7700, událostí nového letadla/příjmového rekordu a výsledků notifikací, se server-side filtrováním událostí před stránkováním. | Produkce; bezpečný append-only ledger `/var/lib/airradar/alert-events.jsonl`, payloady notifieru jsou vyloučeny. |
| `/recap/daily` | Denní přehled přijímače s hranicemi podle pražského lokálního času a označením neúplného dne. | Produkce, pokud jsou dostupné historie/agregace PostgreSQL. |
| `/recap/weekly` | Sedmidenní přehled přijímače s omezeným porovnáním proti předchozím sedmi dnům. | Produkce, pokud jsou dostupné historie/agregace PostgreSQL. |
| `/fleet` | Konkrétní letadla z ICAO pravidel watchlistu, live/offline stav, počty nedávných pozorovaných letů, trasy/letiště a lazy fotografie. | Produkce; neidentitní pravidla watchlistu jsou vynechána, historie PostgreSQL je volitelná. |
| `/system` | Sanitizovaný stav runtime, přijímače, persistence, statistik, ATC, počasí, OGN, alertů a letišť. Lazy providery weather/radar/wind/ADSBDB zobrazují cold-start stavy `ON DEMAND`/`LOADING` a omezené bezpečné důvody stavů degraded/offline. | Produkční read-only diagnostika; nikdy nespouští volitelné upstream požadavky. |

## Command Search V2

Root-level Command Search palette zůstává dostupná ze všech rout přes
`⌘K` / `Ctrl+K` a trigger v topbaru. `GET /api/search?q=` nově slučuje
dosavadní výsledky živých letadel, letišť a ATS bodů s omezenými historickými
Flight výsledky z posledních sedmi dnů. Flight search se zapíná od tří znaků,
čte pouze Flight řádky, nikdy neskenuje FlightPosition a při nedostupném
PostgreSQL selže fail-soft.

Deterministické smart actions rozpoznávají záměrně malou sadu přesných intentů:
dnešní go-aroundy, dnešní vzácná letadla, `<ICAO> operations` a
`lety do <ICAO>`. Přesná smart action se vrátí ještě před prací s live stavem
nebo databází a naviguje pouze na existující AirRadar plochy. Destination action
používá přesný filtr `destination=` na `GET /api/history/flights`.
Klávesové ovládání i pětipoložkový interní browser-local seznam recent zůstává
beze změny; nepoužívá se LLM ani další live stream.
## Predictive Graduation Readiness V1

Veřejné predictive capability zůstávají explicitně opt-in a ve výchozím stavu
`SHADOW`. Graduation Readiness přidává verzovaný fail-closed evidence gate
pro ETA, runway, runway-change a trajectory advisory. Runtime report za 30 dní
je pouze pro admina na `/system` a `GET /api/admin/predictive/readiness`;
čte omezené řádky `PredictiveObservation` a nezávisle zachycené persistované
terminal evidence událostí `LANDING` a nikdy neskenuje `FlightPosition`.

Každá capability dostane `PASS`, `WAIT` nebo `FAIL` se stabilními reason
codes a zmrazenými thresholdy `predictive-readiness-v1`. Chybějící ground
truth, chybějící instrumentation nebo zkrácený bounded výsledek znamená
`WAIT`; lifecycle integrity konflikt nebo dostatečně podložené nesplnění
quality thresholdu znamená `FAIL`. Samotné nastavení
`AIRRADAR_PREDICTIVE_*_STATUS=PUBLIC` nestačí: aircraft prediction API aplikuje
readiness gate a capability bez PASS stáhne zpět do `SHADOW`. Žádná capability
se automaticky nepovyšuje na `PUBLIC`.

## Predictive ETA Advisory V1

Detail živého letadla používá existující
`GET /api/aircraft/:hex/prediction` a zobrazuje ETA pouze tehdy, když je ETA
explicitně nakonfigurována jako `PUBLIC`, aktuální readiness rozhodnutí je
`PASS`, predikce je čerstvá, čas příletu leží v budoucnosti a readiness report
obsahuje kalibrovanou p90 ETA chybu. Tato p90 chyba se zobrazí jako `±`
uncertainty; AirRadar nevytváří heuristickou nejistotu.

Při platné admin session může stejný endpoint připojit SHADOW preview s
readiness/stale/expired stavem. Tento preview blok není součástí anonymní
odpovědi. Detail letadla provede jeden page-scoped prediction fetch a
nevytváří nový poller, EventSource ani persistence path.

## API

| Metoda a routa | Účel | Produkční stav |
| --- | --- | --- |
| `GET /api/aircraft?coverage=local\|extended` | Aktuální bezpečný snapshot; výchozí je local kvůli zpětné kompatibilitě. | Produkční jádro. |
| `GET /api/aircraft/:hex?coverage=local\|extended` | Bezpečná trvalá metadata, nedávné lety a 7d/30d souhrn historie; vybraný live enrichment respektuje požadovaný pohled pokrytí. | Produkce při nakonfigurovaném PostgreSQL. |
| `GET /api/aircraft/:hex/photo` | Volitelná metadata fotografie Planespotters; při vypnutí bezpečně vrací disabled/empty. | Volitelné, ve výchozím stavu vypnuté. |
| `GET /api/stream?coverage=local\|extended[&v=2]` | Slučované Server-Sent Events; pojmenované V1 události `snapshot` zůstávají výchozí, explicitní `v=2` odešle jeden úplný veřejný snapshot a poté sekvenčně řízené `delta` události pro změněná/odebraná letadla. Každý klient dostává z jednoho sdíleného state service zvolený pohled pokrytí. | Produkční jádro; není WebSocket. |
| `GET /api/ogn/state` | Aktuální omezený OGN/FLARM snapshot; vypnutý režim vrací prázdný snapshot a nespouští providera. | Volitelné; ve výchozím stavu vypnuté. |
| `GET /api/ogn/stream` | Nezávislé slučované OGN/FLARM `snapshot` události s heartbeat a omezeným backpressure. | Volitelné; není WebSocket a nikdy není součástí `/api/stream`. |
| `GET /api/history/:hex` | Nejnovější historie PostgreSQL nebo omezený fallback stopy v RAM. | Produkce; bez DB graceful degradation. |
| `GET /api/history/flights` | Omezený seznam letů podle lokálního rozsahu, hledání nebo přesného hexu. | Produkce s PostgreSQL. |
| `GET /api/history/flights/:id` | Jedna instance letu a omezený počet vzorkovaných pozic. | Produkce s PostgreSQL. |
| `GET /api/time-machine/range` | Skutečné min/max časové značky uložených `FlightPosition`. | Produkce s PostgreSQL; omezené čtení. |
| `GET /api/time-machine/window?from=&to=` | Maximálně pětiminutová pozorování všech letadel plus trvalé markery událostí. | Produkce s PostgreSQL; 40 000 pozic/500 letadel/200 událostí na odpověď. |
| `GET /api/map-context/at?at=` | Malý časový manifest historického kontextu mapy. | Produkce; fail-soft pro každou vrstvu. |
| `GET /api/map-context/range` | Omezené rozsahy dostupnosti provozu a archivu kontextu. | Produkce; levná diagnostika archivu. |
| `GET /api/map-context/radar?at=` | Metadata historického radarového snímku vyřešeného v nebo před vybraným okamžikem. | Produkce, když archiv obsahuje odpovídající snímek. |
| `GET /api/map-context/radar/frame/:id` | Archivovaný validovaný PNG snímek CHMI. | Produkce, když je snímek zachován. |
| `GET /api/map-context/metar?at=` | Dávková normalizovaná historická METAR pozorování. | Produkce, pokud existují archivovaná pozorování. |
| `GET /api/map-context/wind?at=&level=` | Historický snapshot ICON-EU s proveniencí běhu modelu a času platnosti. | Produkce, pokud existují archivované snapshoty. |
| `GET /api/map-context/aup?at=` | Historická plánovaná revize AUP/UUP a kontext platnosti. | Produkce, pokud existuje revize známá k danému okamžiku. |
| `GET /api/airports` | Katalog letišť PostgreSQL nebo zabalený fallback katalog. | Produkce s importem/fallbackem. |
| `GET /api/airports/:icao` | Kanonický detail letiště plus lokálně uložené dráhy, komunikační frekvence a přidružené navaid. | Produkce po `airports:sync`; prázdná infrastruktura je platná odpověď. |
| `GET /api/airports/:icao/traffic?range=7d\|30d` | Omezený souhrn letištního provozu z uložených Flights zachycených tímto přijímačem, včetně žebříčků tras, letadel, callsignů a nedávného provozu. Odpověď se označí jako neúplná při překročení bezpečného limitu dotazu místo tichého prezentování částečných součtů jako úplných. | Produkce s nakonfigurovanou historií PostgreSQL; výchozí rozsah je 30 dní. |
| `GET /api/airports/:icao/movements?period=today\|24h\|7d` | Omezené on-demand klasifikace pohybů (přiblížení, pravděpodobné přistání, pravděpodobný vzlet, odlet, přelet) z prostorově/časově předvybraných kandidátů `FlightPosition` a geometrie drah. Výsledky obsahují důkazy, confidence, pravděpodobnou dráhu jen pro runway-related třídy, souhrnné počty runway-relevant/unknown a explicitní metadata `complete`/`truncated`. | Produkce s nakonfigurovanou historií PostgreSQL; výchozí UI okno je 24 hodin; všechny klasifikace jsou odvozené důkazy přijímače a přelet nikdy nedostává dráhu. |
| `GET /api/search?q=` | Omezené globální vyhledávání živých letadel a letišť. | Produkce. |
| `GET /api/weather/airport/:icao` | METAR/TAF z AviationWeather.gov pro kanonické letiště. | Volitelná externí data; on-demand a cacheovaná. |
| `GET /api/weather/airport?icao=ICAO1,ICAO2` | Omezená dávková odpověď METAR/TAF pro kanonická letiště a počasí na trase. | Volitelná externí data; max. 8 ICAO kódů. |
| `GET /api/weather/sigmet` | Aktuální validované mezinárodní a CONUS SIGMET GeoJSON. | Volitelná externí data; načítají se jen při zapnuté vrstvě mapy. |
| `GET /api/atc/sectors` | ATC sektory/vysílače plus metadata provenience. | Produkce s importovanými daty; demo vzorek jen v demo režimu nebo při explicitním opt-in. |
| `GET /api/ats/routes` | Publikovaná geometrie českých ATS tratí a provenience používaná route intelligence. DCT a nerozřešené/mezinárodní pokračování zůstávají explicitní a nikdy se neprezentují jako ATC povolení. | Produkce s validovanou datovou sadou českého eAIP; klientské načítání je fail-soft a po přechodném selhání opakovatelné. |
| `GET /api/airspace/activity` | Kontext plánovaných českých alokací AUP/UUP plus samostatně označená zpožděná historická actual data, pokud jsou dostupná. Plánovaná alokace se nikdy nevydává za potvrzenou provozní aktivaci. | Volitelné/fail-soft obohacení z autoritativního zdroje; načítání v prohlížeči lze po přechodném selhání opakovat. |
| `GET /api/statistics` | Dnešní nebo omezená 7d/30d agregační/trendová/coverage odpověď. | Produkce; rozsahy vyžadují denní DB data. |
| `GET /api/statistics/traffic?range=today\|7d\|30d` | Receiver-observed součty instancí Flight a omezené žebříčky typů letadel, aerolinek/provozovatelů, tras, odletů/cílů a zemí registrace. | Produkce s historií PostgreSQL; nikdy nečte `FlightPosition`. |
| `GET /api/statistics/coverage-intelligence?range=7d\|30d` | Spolehlivost pokrytí z denních maxim v 10° sektorech, rozdělení startů Flight podle lokální hodiny a omezených rekordů přijímače. P95/P99 jsou percentily denních maxim, nikoli raw vzorků pozic. | Produkce při nakonfigurovaných agregacích/historii přijímače PostgreSQL; nikdy nečte `FlightPosition`. |
| `GET /api/reception-records` | Dnešní, celoživotní a nejvyšší úplné denní rekordy maximální vzdálenosti s letadlem, registrací, bearingem a časem. | Produkce; historické rekordy vyžadují V1 pole bearing, živá paměť zůstává dostupná bez PostgreSQL. |
| `GET /api/logbook/summary` | Jedno kompaktní dashboard čtení pro live count, dnešní trvalé počty NEW/RARE/RETURNING, živá letadla na watchlistu, zajímavá letadla a příjmové rekordy. | Produkce; trvalé logbook labely vyžadují PostgreSQL, živý radar zůstává nezávislý. |
| `GET /api/watchlist` | Serverová pravidla alertů, cooldown, bezpečné aktuální shody a uložené časy posledních triggerů. | Produkce; read-only a `no-store`. |
| `GET /api/watchlist/session` | Bezpečný stav admin session watchlistu. | Produkce; nikdy nevrací přihlašovací údaj. |
| `GET /api/alerts?filter=all\|watchlist\|emergency\|records` | Bezpečná omezená historie alert událostí s explicitními metadaty, server-side filtrováním kategorií a stránkovaným stavem notifikací. | Produkce; bez tajných údajů, provider payloadů a raw delivery chyb. |
| `GET /api/recap?range=daily\|weekly` | Denní nebo sedmidenní přehled přijímače z agregačních tabulek a omezených čtení Flight. | Produkce při nakonfigurovaném PostgreSQL; chybějící data zůstávají unavailable/null. |
| `POST /api/watchlist` | Validuje a atomicky vytvoří serverové pravidlo alertu. | Produkce; autentizovaná same-origin admin mutace. |
| `PATCH /api/watchlist/:id` | Aktualizuje nebo zapne/vypne jedno pravidlo. | Produkce; autentizovaná same-origin admin mutace. |
| `DELETE /api/watchlist/:id` | Smaže jedno serverové pravidlo. | Produkce; autentizovaná same-origin admin mutace. |
| `GET /api/health` | Sanitizovaný health aplikace/databáze/readsb/ATC/alertů. | Produkční health kontrakt. |
| `GET /api/admin/predictive/readiness` | Admin-only 30denní bounded Predictive Graduation Readiness report z `PredictiveObservation` a nezávislého LANDING terminal evidence; nikdy nečte `FlightPosition`. | Read-only readiness gate; bez automatické PUBLIC promotion. |
| `GET /api/system/status` | Sanitizovaný omezený systémový přehled pro `/system`, včetně serverem známých počtů vrstev letiště/ATC/ATS a čerstvosti zdrojů. | Produkční diagnostika. |
| `GET /api/version` | Bezpečná metadata release/buildu. | Produkční endpoint metadat release. |

Serverový alert engine se vyhodnocuje pouze z lokálního ADS-B stavu letadel.
Jeho omezený cooldown a trvalý stav událostí se atomicky ukládá mimo PostgreSQL,
takže restart procesu neresetuje nedávnou deduplikaci. Browser-only lokální
watchlist filtr na `/` zůstává oddělený od serverových pravidel alertů.
Selhání volitelného enrichmentu a PostgreSQL se reprezentují jako prázdná,
zastaralá, nedostupná nebo degradovaná data funkce místo odstavení živého
radaru.
# Flight Story V2

Detail letu zachovává jediný omezený playback clock a přidává deterministický
souhrn a narativní časovou osu. Persistované časy start/end Flight jsou
označeny jako pozorované hranice; persistované Flight Intelligence události
jsou označeny jako odvozené s confidence a nejbližší vzorkovanou telemetrií.
Badge výrazných událostí shrnují GO_AROUND, DIVERSION, HOLDING a související
high-attention události bez domýšlení faktů. Mapa, playback cursor, kurzor
profilu, vybraná událost i historický Map Context nadále sdílejí stejný
timestamp. Částečná data zůstávají použitelná a metadata trasy letišť zůstávají
kontextem, nikoli důkazem skutečně proletěné trasy.
