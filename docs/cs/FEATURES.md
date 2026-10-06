# Funkce a routy

<!-- feature-registry:start -->
## Registr funkcí

Tato tabulka je generována z [`features.registry.json`](../features.registry.json).
CI ověřuje, že každá Next.js page a API route má alespoň jednoho vlastníka v
registru a že registr neobsahuje zastaralé routy. „Pre-registry“ znamená, že
funkce existovala už před zavedením registru a její původní release zatím není
historicky přiřazený.

| Funkce | Stav | Kategorie | Zavedeno | Stránky | API | Shrnutí |
| --- | --- | --- | --- | --- | --- | --- |
| Aircraft & Flight Detail | production | history | Pre-registry | `/aircraft/:hex`<br>`/flights/:id`<br>`/history`<br>`/flights` | `/api/aircraft/:hex/context`<br>`/api/aircraft/:hex/prediction`<br>`/api/aircraft/:hex/photo`<br>`/api/aircraft/:hex/route-weather`<br>`/api/history/:hex`<br>`/api/history/flights`<br>`/api/history/flights/:id` | Aircraft identity, context, photos, route weather, captured flights, sampled history, and readiness-gated predictive ETA, runway, runway-change, and trajectory advisories. |
| Airport Intelligence | production | airports | Pre-registry | `/airports`<br>`/airports/:icao` | `/api/airports`<br>`/api/airports/:icao`<br>`/api/airports/:icao/movements`<br>`/api/airports/:icao/operations`<br>`/api/airports/:icao/traffic` | Airport catalog, runway context, observed traffic, inferred Airport Operations intelligence, and a shared-stream Airport Live Board with correlated journeys, arrival sequencing, V8 arrival flow and approach-queue state, runway-flow stability, bounded operational exceptions, and LANDED completion. |
| ATC & ATS Intelligence | production | atc | Pre-registry | — | `/api/airspace/activity`<br>`/api/atc/sectors`<br>`/api/atc/sectors/:id/history`<br>`/api/atc/sectors/:id/traffic`<br>`/api/atc/sectors/history`<br>`/api/atc/sectors/traffic`<br>`/api/atc/sectors/transitions`<br>`/api/atc/validation`<br>`/api/ats/routes`<br>`/api/navigation/data`<br>`/api/procedures` | ATC sectors, transitions, validation, ATS routes, procedures, planned airspace activity, and bounded global NAVAID/FIX reference data. |
| Flight Intelligence | production | intelligence | Pre-registry | `/intelligence` | `/api/intelligence/events`<br>`/api/intelligence/stream` | Lifecycle and transition intelligence event timeline and streaming. |
| FlightAware Usage Administration | internal | operations | Pre-registry | — | `/api/admin/flightaware/usage` | Administrative usage diagnostics for the optional FlightAware integration. |
| Live Radar | production | radar | Pre-registry | `/` | `/api/aircraft`<br>`/api/aircraft/:hex`<br>`/api/operations/predictive`<br>`/api/search`<br>`/api/stream` | Local and extended live ADS-B radar, search, aircraft snapshots, SSE streaming, selected-aircraft Route Corridor Intelligence, and a bounded readiness-gated Predictive Operations Center for ETA, runway, runway changes, and trajectory state. |
| Map Context & Weather | production | weather | Pre-registry | — | `/api/aircraft/:hex/weather-fusion`<br>`/api/map-context/at`<br>`/api/map-context/aup`<br>`/api/map-context/metar`<br>`/api/map-context/radar`<br>`/api/map-context/radar/frame/:id`<br>`/api/map-context/range`<br>`/api/map-context/wind`<br>`/api/weather/airport`<br>`/api/weather/airport/:icao`<br>`/api/weather/metar-map`<br>`/api/weather/pirep`<br>`/api/weather/radar/frame/:id`<br>`/api/weather/radar/frames`<br>`/api/weather/sigmet`<br>`/api/weather/wind`<br>`/api/weather/aircraft/observations`<br>`/api/weather/aircraft/profile`<br>`/api/admin/weather/diagnostics` | Current and historical radar, METAR, wind, SIGMET, AUP/UUP map context, aircraft-observed weather, bounded PIREP/AIREP enrichment, and explainable multi-source Weather Fusion. |
| Mobile / PWA mode | production | platform | Pre-registry | `/`<br>`/airports/:icao` | `/api/push/vapid-public-key`<br>`/api/push/subscribe` | Instalovatelná mobilní PWA s offline posledním stavem, browser-local oblíbenými letišti a volitelnými Web Push upozorněními pro nouzové squawky, sledovaná letadla a geofence události. |
| Navigation Integrity | production | navigation / safety / intelligence | Pre-registry | — | `/api/navigation-integrity/current`<br>`/api/navigation-integrity/aircraft/:hex`<br>`/api/navigation-integrity/history`<br>`/api/admin/navigation-integrity/diagnostics`<br>`/api/admin/navigation-integrity/candidates` | Conservative ADS-B navigation-integrity observations, bounded regional anomaly candidates, APIs, diagnostics and radar overlay. |
| OGN / FLARM | optional | traffic | Pre-registry | — | `/api/ogn/state`<br>`/api/ogn/stream` | Privacy-aware optional OGN/FLARM state and independent SSE stream. |
| Operations Dashboard | production | operations | Pre-registry | `/operations` | — | Živý operační dashboard skládající canonical lokální provoz, tok letišť, omezený kontext příletů na příštích 30 minut, Regional Attention a Flight Intelligence bez vytváření paralelního intelligence enginu. |
| Operational Digital Twin | production | intelligence | Pre-registry | `/aircraft/:hex`<br>`/` | `/api/aircraft/:hex/situation`<br>`/api/admin/operational-twin/outcome`<br>`/api/admin/operational-twin/event-outcome` | Bounded 30-minute aircraft situation projection with route, weather, Navigation Integrity and PUBLIC predictive context, live map uncertainty rendering, prospective corridor/event outcome validation, plus paired canonical-vs-wind timing graduation evidence. |
| Receiver Coverage | production | receiver | Pre-registry | `/receiver/coverage` | `/api/receiver/coverage` | Receiver coverage analysis and dedicated coverage detail. |
| Statistics & Recaps | production | analytics | Pre-registry | `/statistics`<br>`/recap/daily`<br>`/recap/weekly` | `/api/logbook/summary`<br>`/api/recap`<br>`/api/reception-records`<br>`/api/statistics`<br>`/api/statistics/coverage-intelligence`<br>`/api/statistics/traffic` | Receiver statistics, traffic intelligence, reception records and daily/weekly recaps. |
| System Observability | production | operations | Pre-registry | `/system` | `/api/admin/altitude/:hex`<br>`/api/admin/predictive/readiness`<br>`/api/health`<br>`/api/system/runtime-history`<br>`/api/system/status`<br>`/api/system/stream`<br>`/api/version` | Sanitized health, runtime history, provider status, build identity, ADS-B continuity diagnostics and mass-drop guard state, bounded predictive readiness, independent outcome truth, and admin-only graduation calibration. |
| Time Machine | production | history | Pre-registry | `/time-machine` | `/api/time-machine/range`<br>`/api/time-machine/window` | Bounded historical all-aircraft playback and historical context windows. |
| Track Fusion Shadow | internal | receiver / intelligence | Pre-registry | `/system` | `/api/admin/track-fusion/:hex` | Shadow-only per-field multi-source state estimator with source-quality scoring, position residuals, bounded handover validation, short gap estimation and admin diagnostics; never alters canonical live state or local receiver persistence. |
| Trajectory Conformance | production | navigation / intelligence | Pre-registry | `/` | — | Selected-aircraft route-conformance state machine with persistent deviation, confirmed rejoin and conservative probable-direct inference over Route Corridor Intelligence. |
| Watchlist, Alerts & Fleet | production | alerts | Pre-registry | `/watchlist`<br>`/alerts`<br>`/fleet`<br>`/admin/alerts` | `/api/alerts`<br>`/api/watchlist`<br>`/api/watchlist/:id`<br>`/api/watchlist/activity`<br>`/api/watchlist/session`<br>`/api/admin/alerts/delivery`<br>`/api/admin/alerts/fleets`<br>`/api/admin/alerts/fleets/:id`<br>`/api/admin/alerts/fleets/:id/matchers`<br>`/api/admin/alerts/fleets/:id/matchers/:matcherId`<br>`/api/admin/alerts/geofences`<br>`/api/admin/alerts/geofences/:id`<br>`/api/admin/alerts/history`<br>`/api/admin/alerts/rules`<br>`/api/admin/alerts/rules/:id` | Server watchlists, integrated rule-scoped activity, alert history, rule mutations and fleet views. |
<!-- feature-registry:end -->

## Proaktivní monitoring receiveru V1

Odpověď systémového statusu nyní obsahuje omezenou projekci
`receiver.readsb.monitoring`, odvozenou z existující kvality živého receiveru.
Rozlišuje `HEALTHY`, `DEGRADED`, `OFFLINE` a `INSUFFICIENT_DATA`, uvádí
bezpečné pravděpodobné příčiny jako neaktuální readsb snapshot, nízkou
rychlost zpráv, žádná letadla nebo staré pozice a doporučí první kontrolu.
Demo režim je výslovně označen jako nedostatek dat, nikoli jako zdravý receiver.

Jde o read-only evaluator bez nového polleru, databázové tabulky, persistence,
SSE streamu nebo upstream požadavku. Výsledek je dostupný přes existující
`/api/system/status` a `/api/system/stream` a zobrazuje se na `/system`.
Příčiny jsou omezené kódy s úrovní confidence; jde o diagnostické hypotézy,
nikoli o důkaz poruchy antény nebo RF části.

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
| `/airports/:icao` | Airport Live Board V2 nad Airport Intelligence V3: jeden sdílený 24h operations/weather controller s omezeným 30s refreshem, poslední receiver-inferred přílety/odlety, provozní události, využití drah + receiver-vs-wind intelligence, kompaktní aktuální počasí, sjednocená Flight Story timeline a dále katalogová metadata, geometrie drah, METAR/TAF, živý okolní ADS-B provoz, navaid, okolní letiště a 7/30denní souhrn. | Produkce; pohyby a dráhy jsou omezené inference lokálního přijímače, nikoli letištní FIDS nebo autoritativní ATC data. |
| `/operations` | Operations Dashboard V1 spojující canonical LOCAL provoz, origin/destination toky letišť, existující Airport Operations, readiness-gated public ETA s explicitně označeným inferred terminal-demand fallbackem, Regional Attention a významné události Flight Intelligence. | Produkční read-only agregace; bez nového polleru, prediction enginu, persistence cesty nebo ATC/separation sémantiky. |
| `/history` | Omezené vyhledávání/seznam instancí letu, detail vzorkovaných pozic a playback mapa. | Produkce; funkce PostgreSQL bez závislosti na živém pollingu. |
| `/time-machine` | Omezené historické přehrávání radaru všech letadel s výběrem UTC, časovou osou, markery událostí, výběrem letadla, stopou vybraného letadla a volitelným historickým kontextem radar/METAR/vítr/AUP-UUP. | Produkce s historií PostgreSQL `FlightPosition`; dostupnost kontextu se řídí aktivací a retencí omezeného archivu. |
| `/statistics` | Agregace přijímače dnes/7 dní/30 dní, porovnání aktuálního a předchozího období, trendy, vizualizace pokrytí, příjmové rekordy, omezený CSV export, receiver-observed traffic intelligence a 7/30denní analytika spolehlivosti pokrytí/přijímače. | Produkční jádro; traffic a range analytika používá omezená čtení PostgreSQL, aktuální čítače přijímače zůstávají v RAM. |
| `/watchlist` | Editor serverových pravidel alertů s presety vzdálenosti 10/25/50/100 km, aktuálním stavem shody, ovládáním zapnutí/vypnutí a posledním uloženým časem triggeru každého pravidla. | Produkce; sdílená pravidla `/var/lib/airradar/alerts.json` plus omezený stav deduplikace/triggerů `/var/lib/airradar/alert-engine-state.json`. Read-only stav je veřejný a mutace vyžadují server-side admin session. |
| `/alerts` | Omezená historie přechodů výskytu/vzdálenosti watchlistu, jednotlivých nouzových přechodů 7500/7600/7700, událostí nového letadla/příjmového rekordu a výsledků notifikací, se server-side filtrováním událostí před stránkováním. | Produkce; bezpečný append-only ledger `/var/lib/airradar/alert-events.jsonl`, payloady notifieru jsou vyloučeny. |
| `/recap/daily` | Denní přehled přijímače s hranicemi podle pražského lokálního času a označením neúplného dne. | Produkce, pokud jsou dostupné historie/agregace PostgreSQL. |
| `/recap/weekly` | Sedmidenní přehled přijímače s omezeným porovnáním proti předchozím sedmi dnům. | Produkce, pokud jsou dostupné historie/agregace PostgreSQL. |
| `/fleet` | Konkrétní letadla z ICAO pravidel watchlistu, live/offline stav, počty nedávných pozorovaných letů, trasy/letiště a lazy fotografie. | Produkce; neidentitní pravidla watchlistu jsou vynechána, historie PostgreSQL je volitelná. |
| `/system` | Sanitizovaný stav runtime, přijímače, persistence, statistik, ATC, počasí, OGN, alertů a letišť plus process-local diagnostika kontinuity ADS-B s čítači omission/recovery, source failover a mass-drop guardu. Lazy providery weather/radar/wind/ADSBDB zobrazují cold-start stavy `ON DEMAND`/`LOADING` a omezené bezpečné důvody stavů degraded/offline. | Produkční read-only diagnostika; nikdy nespouští volitelné upstream požadavky. |

## Event Replay V1

Události Flight Intelligence typu GO_AROUND, HOLDING, DIVERSION, UNUSUAL_TURN a ORBIT nabízejí na `/intelligence` akci `Replay ±10 min`. Odkaz otevře `/time-machine` u času uložené události, přenese identitu letadla přes `hex` a volitelný `flightId` a při dostupné historii automaticky vybere odpovídající stopu.

Běžný Time Machine zachovává původní pětiminutové serverové okno. Event Replay explicitně používá `mode=event-replay`, který povolí omezené 20minutové okno (10 minut před a po události) při zachování stávajících limitů počtu pozic, letadel a událostí. Nevzniká nový ingest, detektor událostí, databázová tabulka ani persistence cesta. Nouzové squawky se do Flight Intelligence uměle nepřidávají, protože patří do alert domény a nejsou `FlightEventType`.

## PIREP / AIREP Intelligence V1

AirRadar může obohatit kontext počasí pozorovaného vlastním ADS-B přijímačem o
omezená pilotní/letadlová hlášení z veřejného Data API Aviation Weather Center.
Integrace běží pouze na serveru a na vyžádání; prohlížeč nikdy nevolá upstream
službu přímo.

`GET /api/weather/pirep?lat=&lon=&radiusNm=&hours=&altitudeFt=` přijímá
omezený geografický dotaz (10–300 NM, 1–24 hodin, volitelně 0–60 000 ft),
používá pětiminutovou paměťovou cache s omezeným stale-if-error oknem,
omezuje počet normalizovaných výsledků a zachovává provenance zdroje Aviation
Weather Center. Nevznikají žádné databázové zápisy, migrace, background poller
ani práce v ADS-B hot path.

Aircraft Weather zobrazuje externí PIREP/AIREP hlášení pouze při známém
konkrétním středu mapy/receiveru. Turbulence, námraza, teplota, vítr, typ
letadla, výška, naléhavost a stáří pozorování jsou zobrazené odděleně od
vlastních Mode-S/BDS 4.4 pozorování AirRadaru. Externí hlášení se automaticky
nepřiřazují ke konkrétním letadlům zachyceným lokálním přijímačem.

## Aviation Weather Fusion V1

Weather Fusion V1 přidává vysvětlitelnou syntézu na vyžádání pro živé letadlo
zachycené lokálním přijímačem. `GET /api/aircraft/:hex/weather-fusion` skládá
existující meteorologické produkty AirRadaru bez nové ingest nebo persistence
cesty: nedávná kvalitativně kontrolovaná pozorování z letadel včetně Mode-S
BDS 4,4, PIREP/AIREP do 120 NM a šesti hodin, aktuální/projektovaný a výškově
relevantní SIGMET kontext, nejbližší dostupný METAR do 120 NM a existující
ICON-EU vítr v odpovídající tlakové hladině.

Výsledek drží samostatné signály TURBULENCE, ICING a CONVECTION. Každý pozitivní
signál zachovává explicitní důkazy se zdrojem, závažností, jistotou, časem
pozorování a podle typu také vzdáleností a rozdílem výšky. Shoda nezávislých
zdrojů může zvýšit jistotu; silnější výškově relevantní SIGMET může převážit
slabší evidenci. Chybějící evidence se nikdy nepřekládá jako automatické
„bez rizika“: celkový stav NONE vznikne jen tehdy, když jsou všechny sledované
typy rizika explicitně bez signálu, jinak zůstává UNKNOWN.

Pozorovaný vítr z letadla lze porovnat s již vybranou nejbližší hodnotou
ICON-EU v tlakové hladině/gridu. Výsledek ukazuje rozdíl směru a rychlosti jako
AGREE, MIXED nebo DIVERGENT, ale samotný rozpor se nepřevádí na meteorologické
riziko. Starší palubní pozorování a stale model snižují jistotu.

METAR-based icing je záměrně pouze LOW-confidence odvozený signál z
vlhkosti/srážek poblíž bodu mrazu; nejde o potvrzení námrazy za letu. Detail
letadla zobrazuje fusion výsledek, pokrytí zdrojů a omezené důkazy odděleně od
původních dat a obsahuje jasné upozornění, že nejde o certifikovaný
meteorologický produkt.

Fusion selhává fail-soft po jednotlivých providerech a při chybějících zdrojích
vrací PARTIAL/INSUFFICIENT. Nepřidává databázovou migraci, background poller,
SSE spojení ani práci v ADS-B hot path. Řízení upstream požadavků zůstává na
existujících provider cache a samotný fusion endpoint je `no-store`.

## Weather Avoidance Intelligence V1

Weather Avoidance Intelligence V1 povyšuje existující SIGMET trajectory
deviation signál na konzervativní vícevrstvou korelaci pro právě vybrané
letadlo. Neurčuje úmysl posádky.

Signál začíná stávající geometrickou podmínkou: starší projekce tracku zhruba
2–10 minut zpět směřovala do aktivního SIGMETu, letadlo provedlo významnou
změnu kurzu a krátká projekce podle současného tracku už do stejné oblasti
nevstupuje. V1 tento stav ověřuje dvěma novějšími intelligence vrstvami:

- Trajectory Conformance musí nezávisle ukazovat OFFSET, DEVIATING, REJOINING
  nebo PROBABLE_DIRECT, než je dovolena silnější klasifikace
  `POSSIBLE_WEATHER_AVOIDANCE`.
- Existující 30minutový Weather Corridor musí mít použitelný SIGMET zdroj a
  nesmí znovu vstupovat do stejného SIGMETu. Pokud aktuální koridor do advisory
  stále vstupuje, výsledek je výslovně `CURRENT_CORRIDOR_EXPOSED`.

HIGH confidence vyžaduje původní medium-confidence SIGMET deviation, aktuální
a dostupná SIGMET corridor data, route-aware 30minutový koridor a Trajectory
Conformance s jistotou vyšší než LOW. Stale SIGMET, kinematický koridor, nízká
conformance confidence nebo chybějící corridor coverage výsledek omezí.
Chybějící evidence fail-closed zůstává ve slabší klasifikaci
`CORRELATED_DEVIATION`.

Radar detail ukazuje původní očekávanou expozici, aktuální 30minutovou expozici,
stav Trajectory Conformance a jistotu korelace. Funkce znovu používá existující
selected-aircraft `/api/aircraft/:hex/situation` s omezeným 60sekundovým
refreshem; nevytváří DB model, persistence cestu, SSE stream, nový weather
provider ani práci v ADS-B hot path.

Výsledek je pouze informativní korelace. Netvrdí, proč posádka změnila kurz,
zda manévr nařídilo ATC ani zda šlo o bezpečnostní rozhodnutí.

## Weather Corridor Intelligence V1

Weather Corridor Intelligence V1 aplikuje stejné konzervativní weather
semantiky na 30minutový 4D corridor Operational Digital Twin. Nepřidává nový
browser request, stream ani periodický polling: rozšířený
`GET /api/aircraft/:hex/situation` vrací `weatherCorridor` vedle stávajících
future events.

Server provede jediný omezený PIREP/AIREP dotaz do 300 NM a šesti hodin bez
filtru na aktuální výšku, aby mohl porovnat reporty s projektovanou výškou
jednotlivých bodů corridoru. Report turbulence nebo námrazy se publikuje pouze
tehdy, když je blízko některému budoucímu vzorku a není výškově mimo nastavenou
relevanci. Confidence zohledňuje vzdálenost od corridoru, rozdíl výšky, stáří
reportu a stale stav upstream snapshotu.

SIGMET se vyhodnocuje proti každému dvouminutovému corridor bodu současně
horizontálně, vertikálně a časově. V1 publikuje první sampled vstup a výstup pro
turbulenci, námrazu nebo konvekci; výsledek je záměrně omezený rozlišením
corridoru a neprohlašuje přesný crossing čas mezi dvěma vzorky.

ICON-EU se načítá pouze pro unikátní tlakové hladiny potřebné projektovanými
výškami. Existující wind provider sdílí cache a in-flight snapshot, takže
nevzniká jeden upstream request pro každý corridor bod. UI ukazuje bounded
vzorky 0/10/20/30 minut a trend podélné složky větru jako rostoucí protivítr,
rostoucí zadní vítr, stabilní nebo proměnlivý.

Weather Corridor vrací explicitní stav AVAILABLE/PARTIAL/INSUFFICIENT a stav
každého zdroje. Chybějící PIREP, SIGMET nebo ICON-EU zdroj nevytváří falešné
„clear“ počasí. Funkce nepřidává databázovou migraci, background poller,
další SSE spojení ani práci v ADS-B hot path a zůstává informačním,
necertifikovaným produktem.

## Aviation Nav Data V1

AirRadar umí načíst omezená globální referenční data NAVAID a pojmenovaných
FIX/waypoint bodů z veřejného Data API Aviation Weather Center.

`GET /api/navigation/data?lat=&lon=&radiusNm=&kinds=NAVAID,FIX` běží pouze na
serveru, je rate-limitovaný a omezený na oblast 10–250 NM kolem přijímače.
Provider používá jen dokumentované parametry `bbox` a `format=json`, omezuje
počet normalizovaných výsledků, slučuje identické souběžné požadavky, úspěšné
odpovědi cachuje šest hodin a při dočasném výpadku upstreamu může vrátit
omezený stale snapshot.

Radar data nabízí jako volitelnou vrstvu NAVAID/FIX. NAVAID a FIX jsou vizuálně
odlišené a popisky se zobrazují až při vyšším zoomu. Globální referenční vrstva
AWC nenahrazuje ani nepřepisuje publikované CZ/SK/AT eAIP ATS tratě, postupy ani
jejich provenance.

Nevzniká databázová migrace, background poller, nový SSE stream ani práce v
ADS-B hot path.

Přesné identifikátory NAVAID/FIX jsou také součástí globálního Command Search.
Vyhledávání používá dokumentovaný parametr AWC `ids`, přijímá pouze
normalizované identifikátory o délce 2–8 znaků, jeden lookup omezuje na osm ID,
slučuje souběžné požadavky a používá stejnou šestihodinovou serverovou cache.
Výpadek AWC neblokuje ostatní části globálního vyhledávání.

Výběr globálního výsledku NAVAID/FIX zapne mapovou vrstvu a vystředí radar na
daný bod. Pokud má vybrané letadlo filed route, body AWC z právě načtené oblasti,
které jsou v této trase, se zvýrazní pomocí existujícího Route Intelligence
tokenizeru. Jde pouze o zobrazení/enrichment: body AWC nikdy nenahrazují eAIP
geometrii ATS/postupů ani nemění autoritu route resolveru.

## Route Corridor Intelligence V1

Route Corridor Intelligence rozšiřuje existující model Route Intelligence V2
pro právě vybrané letadlo. Browser provede jeden omezený same-origin lookup
navigačních referencí při změně sady identifikátorů filed route; nepřidává další
aircraft stream, timer ani background poller.

Publikovaná ATS a procedure geometrie zůstává autoritativní. Omezené AWC
souřadnice NAVAID/FIX mohou vyřešit jinak unresolved endpointy filed/DCT, ale
tento fallback je označen jako schematická `FILED_ROUTE` geometrie a nikdy se
nepovažuje za publikovanou ATS evidenci.

Live radar vykresluje vyřešenou geometrii jako proletěnou, aktuální a zbývající
část a zachovává původní origin-current-destination čáru jako fallback. Drawer
letadla zobrazuje progress, další fix, zbývající vyřešenou vzdálenost, ETA podle
groundspeed, cross-track odchylku, očekávaný track segmentu, rozdíl tracku a
confidence rekonstrukce.

Trvalý stav `DEVIATING` vyžaduje tři různá pozorování s cross-track odchylkou
nad 10 NM během alespoň 10 sekund; návrat vyžaduje dvě pozorování během alespoň
pěti sekund. Jde o informativní zobrazovací thresholdy, nikoli certifikované
navigační limity nebo ATC guidance. V1 deviation eventy nepersistuje a nepřidává
databázovou migraci.

## Trajectory Conformance V1

Trajectory Conformance V1 je selected-aircraft state machine nad existující
Route Corridor Intelligence V1 a Route Intelligence V2. Nevytváří nový
aircraft stream, timer, provider, DB model ani persistence path.

Stavy jsou `ROUTE_UNKNOWN`, `ROUTE_UNCERTAIN`, `ON_ROUTE`, `OFFSET`,
`DEVIATING`, `REJOINING` a `PROBABLE_DIRECT`. V1 používá pouze již
vypočtenou route geometry, cross-track stav, track rozdíl a sekvenci
rekonstruovaných route elementů.

`REJOINING` vzniká pouze po potvrzeném `DEVIATING` a návrat do `ON_ROUTE`
vyžaduje dvě různá pozorování během alespoň pěti sekund. Pravděpodobný direct
se netvrdí z běžného posunu route progress: po potvrzeném deviation musí
letadlo přeskočit alespoň dva vyřešené en-route prvky o souhrnné délce nejméně
10 NM a znovu se stabilně zachytit na pozdějším elementu. Z pouhého `OFFSET`
je podmínka přísnější: alespoň tři prvky a 20 NM.

Pokrytí rekonstrukce pod 50 % nebo nepoužitelný dynamic route stav fail-closed
přechází do `ROUTE_UNCERTAIN`. Detekce udržuje pouze omezený tracker právě
vybraného letadla a shadow countery; V1 nevytváří Flight Intelligence eventy a
nic neukládá do PostgreSQL.

Výsledky v Route Corridor kartě jsou výslovně označené jako odvozená
intelligence. `PROBABLE_DIRECT` není důkaz ATC clearance a `DEVIATING` není
certifikované navigační nebo bezpečnostní varování.

## Airport Live Board V5

V5 zachovává stejnou omezenou sdílenou architekturu letiště a nepřidává žádnou
novou síťovou ani persistence cestu. Aktivní journey snapshot z V4 — včetně
konzervativního stavu LANDED — se skládá do NOW Flow Pulse s počty inbound,
final, holding, outbound, go-around a route conflict. Viditelný zůstává také
poměr korelovaných a live-only řádků.

Omezený attention seznam zobrazuje pouze provozní výjimky: GO_AROUND, HOLDING a
route conflicts. Řazení je deterministické: nejdřív go-around, potom holding,
route conflict a nakonec nejbližší letadlo; seznam má maximálně šest položek.
Normální journey řádky včetně LANDED jsou z attention záměrně vynechané.

Pulse i exception seznam jsou čisté in-memory projekce nad existujícím jediným
airport SSE a omezeným operations snapshotem. Journey stavy, Flight Story linky,
recent movements, runway usage, METAR i runway-vs-wind intelligence zůstávají
beze změny. Board je nadále observational/inferred, nikoli FIDS nebo ATC feed.

## Airport Live Board V6

V6 přidává krátkodobý panel Flow Trend / Pressure bez změny stávající
shared-data architektury. Receiver-inferred přílety a odlety se porovnávají ve
dvou navazujících 15minutových oknech; trend vyžaduje rozdíl alespoň dvou
pohybů. Nedávný holding používá aktuální 15minutové okno, zatímco go-aroundy
30minutové exception okno.

Omezený deterministický pressure level shrnuje existující NOW flow a zřetelné
rostoucí trendy. Konzistence runway flow používá posledních 30 minut pohybů s
runway evidencí a vyžaduje alespoň tři vzorky; dominantní dráha musí mít podíl
alespoň 75 procent, aby dostala stav STABILNÍ. Hodnoty zůstávají
observational/inferred a nepředstavují kapacitu letiště, zpoždění ani ATC
guidance. V6 nepřidává další fetch, EventSource ani persistence path.

## Airport Live Board V7

V7 přidává Runway Flow / Stability nad existujícími sdílenými letištními daty.
Porovnává dvě navazující 15minutová okna runway evidence, každý let deduplikuje
na jeho nejnovější pohyb s runway evidencí, odděluje aktuální příletovou a
odletovou evidenci a ukazuje počty reported versus inferred vzorků.

STABILNÍ vyžaduje nejméně tři vzorky v obou oknech se stejnou dominantní dráhou
a podílem alespoň 75 procent v obou. PŘECHOD vyžaduje nejméně tři vzorky v obou
oknech, změnu dominantní dráhy a podporu nejméně 60 procent pro starou i novou
dominantní dráhu. SMÍŠENÁ EVIDENCE a MÁLO DAT zůstávají explicitní fail-closed
stavy. Aktuální flow se s dráhou zvýhodněnou větrem porovnává pouze při
dostatečně silné runway evidenci. Nevzniká nový fetch, SSE, API ani persistence
path.

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

## Predictive Runway Advisory V1

Stejná page-scoped prediction odpověď nyní přenáší i runway advisory bez
dalšího fetch requestu nebo streamu. Veřejné zobrazení dráhy vyžaduje
`RUNWAY=PUBLIC`, runtime readiness `PASS`, predikci nejvýše 45 sekund starou,
nenulovou predikovanou dráhu a známou confidence. Stavy `WAIT`, `FAIL`,
`SHADOW`, stale, unavailable nebo unknown-confidence veřejnou dráhu
nevyrenderují.

Platná admin session může dostat samostatný runway SHADOW preview s readiness
reasons, přesností konce dráhy, coverage, confidence a freshness stavem. UI
hodnotu jasně označuje jako predikovanou, nikoli pozorovanou nebo potvrzenou ATC
informaci, a již zobrazenou hodnotu po překročení 45sekundové freshness hranice
automaticky skryje. Nepřidává se persistence, migrace, model, poller ani
EventSource.

## Predictive Runway Change Advisory V1

Změna dráhy je samostatná capability od aktuální predikce dráhy. Engine
uchovává skutečnou předchozí predikovanou dráhu jako `changedFrom`; běžné pole
`alternative` nadále znamená druhého aktuálního kandidáta a nikdy se
nepoužívá jako provenance změny. Potvrzený přechod predikce se drží pouze v RAM
v omezeném pětiminutovém advisory okně bez nové persistence.

Veřejné zobrazení vyžaduje `RUNWAY_CHANGE=PUBLIC`, runtime readiness `PASS`,
prediction snapshot nejvýše 45 sekund starý, change event nejvýše pět minut
starý, explicitní `changedFrom` a `changedAt` a minimálně MEDIUM confidence.
WAIT, FAIL, SHADOW, stale, expired, LOW a UNKNOWN stav veřejnou změnu
nevyrenderují. Platná admin session může dostat SHADOW preview s outcome
precision, false-positive rate, stavem nezávislé change truth a readiness
reasons. Predictive Outcome Truth V1 nyní označí change sample jako scoreable
jen tehdy, když nezávislý confident APPROACH před predikcí potvrdí stejnou
předchozí dráhu jako `changedFrom` a pozdější LANDING obsahuje
provider-reported finální dráhu. Samotná dostupnost truth capability
negraduuje; stále musí projít minimální sample i quality thresholdy. Detail
letadla nadále používá jediný page-scoped prediction request.

## Predictive Trajectory Advisory V1

Trajectory Advisory zpřístupňuje stav trajectory modelu vůči cílovému letišti
přes stejný aircraft prediction request. Veřejný výstup je fail-closed:
vyžaduje `TRAJECTORY=PUBLIC`, runtime readiness `PASS`, prediction snapshot
nejvýše 45 sekund starý, stav odlišný od `UNKNOWN` a MEDIUM/HIGH confidence.
LOW-confidence kandidát `POSSIBLE_DEVIATION` zůstává pouze admin
diagnostikou.

Prospective capture ukládá explicitní `trajectoryState` do omezeného
`evidenceJson` pouze při změně stavu trajectory nebo confidence. Runtime
readiness tak umí bez DB migrace a bez high-frequency write lane rozlišit
stateful trajectory observations a počítat kandidátní odchylky. Predictive
Outcome Truth V1 je nyní může validovat proti pozdějším nezávisle persistovaným
Flight Intelligence outcome; readiness ale stále musí splnit nastavené sample
a precision thresholdy, než může přejít na PASS.

## Predictive Outcome Truth V1

Runtime readiness nyní používá verzovanou nezávislou evidence vrstvu
`predictive-outcome-truth-v1`, oddělenou od thresholdů
`predictive-readiness-v1`. Čte pouze omezené persistované `FlightEvent`
řádky; nečte `FlightPosition`, nemění historické eventy a nepřidává žádný
prediction write lane.

RUNWAY_CHANGE je scoreable pouze tehdy, když confident nezávislý `APPROACH`
nejvýše dvě hodiny před predikcí potvrzuje stejnou předchozí dráhu zachycenou
predikcí a následný `LANDING` do šesti hodin obsahuje provider-reported
finální dráhu. Správný sample trefil pozorovanou novou dráhu; false positive je
případ, kdy se nezávisle pozorovaná dráha mezi approach a landing vůbec
nezměnila.

TRAJECTORY kandidáti (`POSSIBLE_DEVIATION` / `DEVIATING`) dostanou pozitivní
truth pouze z následného confident eventu `DIVERSION`, `GO_AROUND`,
`HOLDING`, `ORBIT` nebo `UNUSUAL_TURN` ve stejném lifecycle. Negativní
truth je záměrně přísnější: vyžaduje ground-confirmed `LANDING` na stejném
prospektivním cíli. Chybějící ground confirmation, jiný cíl, identity mismatch,
nízká confidence nebo event mimo časové okno zůstává UNSCORABLE místo vzniku
falešného negative.

Každý outcome event type má samostatný limit 2 500 řádků. Pokud kterýkoli
outcome dotaz, landing dotaz nebo predictive-observation dotaz dosáhne limitu,
readiness report je incomplete a veřejná graduation zůstává fail-closed ve
stavu `WAIT`. Samotná existence truth capability nikdy nepovyšuje; PASS/WAIT/
FAIL dál určují existující minimální sample a quality thresholdy.

## Predictive Graduation Calibration V1

Admin-only readiness report nyní obsahuje
`predictive-graduation-calibration-v1`, read-only interpretační vrstvu nad
tou samou evidence, readiness evaluací a threshold verzí, kterou používá
veřejný graduation gate. Vrstva nepřepočítává predikce, nemění thresholdy,
nastavenou/efektivní policy ani sama capability nepovyšuje.

Každá capability dostane fázi `READY`, `COLLECTING`,
`TRUTH_BLOCKED`, `QUALITY_BLOCKED`, `HARD_BLOCKED` nebo
`COLLECTION_BLOCKED`. Report ukazuje přesné chybějící počty observations,
scoreable observations, independent truth flights nebo validated candidates,
požadavky na truth/instrumentaci a quality margin vůči aktivním minimum/maximum
thresholdům. Kladný quality margin znamená rezervu, záporný znamená aktuální
nesplnění cíle.

Quality metriky jsou při readiness WAIT kvůli nedostatku evidence nebo truth
pouze preview a nejsou ještě rozhodovacím FAIL gate. Hodnota
`manualReviewEligible=true` vznikne pouze při kompletním bounded collection a
existujícím readiness rozhodnutí PASS. Jde jen o signál pro ruční/configuration
review; veřejné vystavení stále vyžaduje explicitní změnu capability policy a
runtime readiness gate zůstává fail-closed.

## Predictive Operations Center V1

Radarový Operations Center přidává omezený prediktivní výhled pro letadla,
která už vybrala jeho hodinová NOW timeline a živé highlighty. Browser při
otevřeném panelu posílá maximálně šest ICAO identifikátorů na
`GET /api/operations/predictive?hexes=`. Server čte existující prediction stav
v RAM a pro celý request vyhodnotí jeden společný readiness report.

Anonymní odpověď obsahuje jen ETA/runway/runway-change/trajectory advisories, které projdou stejnými
PUBLIC + PASS + freshness gate jako detail letadla. Platná admin session může
navíc dostat SHADOW preview a rozhodnutí readiness pro ETA/RUNWAY/RUNWAY_CHANGE/TRAJECTORY. Klient
obnovuje omezený snapshot po 30 sekundách a již zobrazené hodnoty skryje na
45sekundové freshness hranici. Predictive data se nepřidávají do hlavního radar
SSE a nevzniká nová persistence, migrace, model ani stream.

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


### Airport Live Board V7 — Arrival Sequence

V7 airport board obsahuje také pořadí nejvýše šesti aktivních příletů. Znovu
používá existující aircraft stream i 30s refresh cyklus letiště, provádí jeden
omezený predictive batch request a spotřebovává pouze readiness-gated PUBLIC
ETA/runway advisories. Při nedostupné predikci bezpečně přejde na receiverové
řazení. Route konflikty jsou vynechány a UNKNOWN route vyžaduje shodu PUBLIC
destination. UI ukazuje nejistotu ETA, medián rozestupu ETA, stabilitu
predikované dráhy a kontext pozorovaného runway flow.


### Airport Live Board V8 — Arrival Flow Intelligence

V8 převádí omezenou V7 active-arrival sequence na krátkodobou flow intelligence
bez dalšího datového zdroje. Zobrazuje PUBLIC ETA demand do 5/15/30 minut,
porovnává stejně dlouhá okna 0–15 a 15–30 minut pro trend toku, detekuje ETA
compression, odvozuje konzervativní arrival pressure, seskupuje predikované
zatížení drah a při dostatečné evidenci porovnává dominantní predikovanou dráhu
s receiverově pozorovaným runway flow. Evidence je označená PUBLIC_STRONG,
PUBLIC_PARTIAL nebo RECEIVER_ONLY. Stejné omezené pořadí navíc vytváří stav
Approach Queue (EMPTY, LOW_DENSITY, ACTIVE, BUILDING, COMPRESSED nebo
HOLDING_PRESENT) bez dalšího requestu, streamu nebo persistence path.


## Operational Digital Twin V1

Detail letadla obsahuje omezený 30minutový 4D situační výhled z
`/api/aircraft/:hex/situation`. Spojuje route-aware nebo kinematický corridor
s waypoint, ATC-sector, plánovanými AUP/UUP, SIGMET a readiness-gated PUBLIC
prediction událostmi. Stejný response obsahuje Weather Corridor Intelligence
s PIREP/AIREP relevancí podél trasy a ICON-EU wind trendem. Každá událost zachovává provenance a confidence. Funkce
nepřidává history scan, persistence, další SSE stream ani periodický browser
polling loop. Podrobnosti jsou v
[`OPERATIONAL-DIGITAL-TWIN.md`](OPERATIONAL-DIGITAL-TWIN.md).


## Track Fusion Shadow V1

Track Fusion Shadow V1 vyhodnocuje field-level multi-source state estimator
vedle současného local/network canonical merge. Position, altitude, groundspeed,
track a vertical rate skóruje odděleně podle source class, freshness, protocol
provenance a dostupné ADS-B integrity evidence.

Shadow měří LOCAL↔NETWORK position residualy, accepted/rejected source
transitions, bounded šestisekundové dead-reckoning gap fills, per-field source
selections a divergence proti dnešní canonical position. Diagnostika je
admin-only přes `/system` a `GET /api/admin/track-fusion/:hex`.

V1 záměrně nemění veřejný radar state, SSE, trails, alerts, Navigation
Integrity, predictive inputs, receiver statistiky ani PostgreSQL history.
Fused/estimated state nikdy není local receiver evidence. Viz
[`TRACK-FUSION-SHADOW.md`](TRACK-FUSION-SHADOW.md).


## Track Fusion Readiness / Graduation V1

Track Fusion Shadow nově sbírá 24hodinovou process-local readiness evidenci v
pětiminutových bucketech a vrací verzovaný stav PASS / WAIT / FAIL. Admin
readiness je dostupná na `/system` a přes
`GET /api/admin/track-fusion/readiness`.

První fail-closed consumer je Operational Digital Twin. Fused vstup je defaultně
vypnutý a vyžaduje explicitní flag, readiness PASS a GOOD observed fused
position konkrétního letadla. Canonical radar, SSE a receiver persistence se
nemění.


## Track Fusion Outcome Validation V1

Track Fusion nově provozuje bounded prospektivní canonical-vs-fused validation
lane. Pro způsobilý čerstvě vyhodnocený track zachytí oba stavy, promítne je do
horizontů 5/15/30 sekund a později je porovná proti budoucí fresh LOCAL receiver
position.

Výstup obsahuje FUSED / CANONICAL / TIE, mean position a altitude error,
handover outcomes a samostatný PASS / WAIT / FAIL net-benefit gate. Validator
je process-local a pouze v RAM; neprovádí history scan, DB zápis, upstream
request, timer ani druhý fusion pass. Podrobnosti jsou v
[`TRACK-FUSION-OUTCOME.md`](TRACK-FUSION-OUTCOME.md).

## Operational Digital Twin V2 — Map Corridor Visualization

Radar nad existujícím situation response vybraného letadla vykresluje 30minutový budoucí corridor, uncertainty envelope, časové markery +5/+10/+15/+20/+30 minut a situační/weather event markery. Route-aware projekce je plná, kinematický fallback přerušovaný. V2 znovu používá existující 60s selected-aircraft situation refresh a nepřidává request, timer, SSE, API ani persistence.

## Operational Digital Twin Outcome Validation V1

Úspěšný existující situation výpočet zachytí bez dalšího pollingu projekci +5/+15/+30 minut. Pending sample se později vyhodnotí pouze proti budoucí LOCAL receiver truth v RAM. Report sleduje poziční a výškovou chybu, coverage deklarovaného uncertainty envelope, error/uncertainty ratio, expired truth a slice podle horizontu, corridor režimu a vstupního state source. Evidence je process-local, 24h bounded a začíná ve WAIT; PASS/FAIL se vyhodnotí až po minimálně 2 hodinách a dostatečném počtu truth sample.

## Operational Digital Twin Wind-adjusted Timing Shadow V1

Digital Twin nyní vedle canonical timing počítá samostatný shadow timing nad stejnou geometrií corridoru. Z observed groundspeed a aktuální podélné složky ICON-EU větru odvodí pouze diagnostický still-air proxy a podél existujících wind sample přepočítá čas dosažení stejných bodů. Výstup obsahuje +5/+15/+30min checkpointy a waypoint timing delta. Canonical corridor, eventy ani ETA se shadow výsledkem nemění.

## Operational Digital Twin Event Outcome Validation V2

Predikované waypoint, ATC sector entry, SIGMET intersection, arrival ETA a runway expectation eventy se nyní prospectively porovnávají s budoucí LOCAL receiver truth a nezávislými Flight Intelligence LANDING eventy. Report měří precision, timing error, missing truth a lead-time slice bez tvrzení o recall. Větev je process-local, bounded a nepřidává polling, persistence ani druhý Digital Twin výpočet.

## Navigation Integrity Corridor V1

The Operational Digital Twin intersects its existing sampled 30-minute corridor with the already-computed process-local Navigation Integrity active anomaly regions. A match requires both grid-cell and altitude-band compatibility; the result preserves severity, confidence, affected-aircraft counts, LOCAL/NETWORK evidence, baseline maturity and audit categories. Zero intersections are not an all-clear, and the feature never claims GNSS jamming, spoofing, or an aircraft navigation fault. No new HTTP request, timer, detector pass, database access or persistence path is added.

## Wind Timing Graduation V1

Event Outcome V2 nyní párově porovnává canonical a wind-adjusted čas stejného waypointu proti jediné LOCAL truth observation. Graduation gate je process-local a fail-closed: vyžaduje dostatečný span, paired sample volume, meaningful wind adjustments a truth coverage; PASS dále vyžaduje alespoň 5% zlepšení MAE a 55% shadow win rate. PASS pouze označí model jako způsobilý k ruční graduaci — canonical timing zůstává aktivní a automatická promotion neexistuje.
