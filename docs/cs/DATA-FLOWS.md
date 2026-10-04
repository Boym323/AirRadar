# Datové toky

## Živý ingest do prohlížeče

Vzorkování pokrytí přijímače periodicky vyhodnocuje aktivní síťový snapshot
proti lokální mapě se stejnou sémantikou čerstvé pozice, radiusu a
normalizovaného ICAO jako živý capture ratio. `AVAILABLE` počítá způsobilá
síťová pozorování a `CAPTURED` čerstvé lokální shody ve stejném snapshotu.
Při výpadku se vzorek přeskočí. Agregace se flushují jako delty hodinových
bucketů; surová síťová pozorování se nepersistují.

## Map Context V1/V2

Map Context je samostatná volitelná read cesta. Požadavky na katalog/snímky
radaru, dávkový METAR, vítr ICON-EU a aktivitu AUP/UUP se cacheují nezávisle a
serializují do omezených mapových DTO. Jejich browser stav je izolovaný od
`/api/stream`; selhání providera ponechá živá letadla i ostatní mapové vrstvy
použitelné. Radar používá pozorované snímky, vítr časy platnosti modelu, METAR
nejnovější pozorování a AUP/UUP intervaly platnosti.

V2 publikuje jeden okamžik Global Map Time z Time Machine do context resolveru.
Jednoprocesová archivní služba vzorkuje radar, METAR, vítr a AUP/UUP do
omezených persistentních souborů. Změny rekonstruovatelných archivů METAR a
větru se slučují v RAM a zapisují atomickou náhradou snapshotu podle omezeného
časového/početního prahu; při ukončení se čekající buffery archivů vyprázdní.
Manifesty zůstávají malé; payloady vrstev
používají nezávislá API a selhávají nezávisle.

1. `LocalReadsbProvider` načítá `<READSB_BASE_URL>/data/aircraft.json` v
   polling intervalu a méně často obnovuje `/data/receiver.json`. Chybějící
   `READSB_BASE_URL` použije `MockReadsbProvider` pro demo režim.
2. `normalizeAircraftResponse()` validuje šestimístný hex identifikátor
   letadla (včetně readsb non-ICAO formy s `~`), převádí pole, zachovává
   barometrické a geometrické hodnoty, odvozuje výšku/vertikální rychlost a
   počítá vzdálenost a bearing.

Volitelná lokální Beast větev přijímá krátké i dlouhé Mode-S framy a po
zpracování parity dispatchuje DF0/4/5/11/16/17/18/20/21. Comm-B MB payloady
DF20/21 procházejí omezenou inferenční vrstvou BDS pro BDS 4,0, 4,4, 5,0 a
6,0; nejednoznační kandidáti se jako telemetrie odmítají. Timestampy Beast
přijímače se používají jako monotónní observation clock, jsou-li platné
(včetně 48bit wrapu), s bezpečným fallbackem na receive time po
restartu/diskontinuitě. Surový Beast signal byte se zachovává jako lokální
`beastSignal` přijímače a nikdy se nepovažuje za síťové RSSI. Čerstvá lokální
pole vyhrávají nad `aircraft.json` po jednotlivých polích; JSON doplňuje jen
chybějící, neplatné nebo starší hodnoty.
3. `AircraftStateService.applySnapshot()` ignoruje pozorování starší než stale
   threshold, aktualizuje RAM mapu podle ICAO identity, přidá změněnou pozici
   do omezené stopy a odstraní letadla nepřítomná v aktuálním snapshotu.
   Neúspěšný poll odstraní pouze záznamy, které už zestárly.
4. Je-li zapnuto, služba nejprve konzumuje ADSBHub SBS/30003:
   `data.adsbhub.org:5002` → AirRadar. Nezávislý feeder příspěvek je
   `192.168.1.50:30002` → `data.adsbhub.org:5001`; AirRadar jej nespravuje.
   Konzument používá freshness podle času přijetí, omezené tracky, slučování
   MSG s ohledem na jednotlivá pole a publikuje pouze letadla s pozicí uvnitř
   nakonfigurovaného radiusu. Jeho origin je `adsbhub`, nikdy `local` ani
   MLAT. Zapnutý ADSBHub, odchozí ADSB.lol raw (`out.adsb.lol:1365` BEAST
   plus `:1366` SBS/MLAT) a geografický HTTP provider běží souběžně. Jejich
   snapshoty se deduplikují podle ICAO do jedné omezené síťové mapy se
   zachováním provenience zdroje. Tato selhání nikdy neoznačí lokální přijímač
   jako offline.
5. Služba notifikuje listenery snapshotem. `GET /api/aircraft` čeká na první
   refresh a vrací bezpečné veřejné DTO. `GET /api/stream` zůstává ve výchozím
   stavu V1 full-snapshot SSE feedem; `?v=2` volí jeden úplný veřejný snapshot
   následovaný sekvenčně řízenými deltami changed/removed. V2 baseline je pro
   každé spojení samostatná, omezená SSE kapacitou a při odpojení se zahodí.
   `coverage=extended` explicitně slučuje lokální a síťové RAM mapy;
   `coverage=local` zůstává výchozí. Viz [SSE Delta V2](SSE-DELTA-V2.md).
   Extended snapshoty také nesou kompaktní source countery a nepersistentní
   LOCAL capture ratio. Jeho jmenovatelem je čerstvý NETWORK provoz s pozicí
   uvnitř `RECEIVER_COMPARISON_RADIUS_NM`, nikoli celý network radius.
6. Metadata/trasy/flight plany, ATC assignmenty, statistiky a alerty běží ze
   stejného snapshot flow, ale asynchronně a izolovaně od refreshe lokálního
   providera. Výsledek enrichmentu se aplikuje pouze tehdy, pokud stále patří
   ke stejnému lokálnímu pozorování letadla. Network-only pozorování se
   nepersistují, neobohacují, nepřiřazuje se jim ATC ani se nevyhodnocují alerty.

## Alerty a historie alertů

Serverové přechody watchlistu, emergency, nového letadla a příjmového rekordu
vyhodnocuje sdílený `AlertEngine`. Detekovaná událost se nejprve zapíše jako
bezpečná metadata do append-only ledgeru runtime stavu
(`/var/lib/airradar/alert-events.jsonl` v produkci). Doručení notifieru je
samostatná asynchronní větev a připisuje stavové řádky `attempted`,
`delivered`, `failed` nebo `disabled`; surové provider payloady,
přihlašovací údaje ani delivery errors se nepersistují. `GET /api/alerts`
složí stavové řádky do omezeného stránkovaného DTO.

Přechod NEW emituje pouze `recordAircraftSnapshot()` poté, co úspěšná
transakce vytvoří první trvalou instanci `Flight` daného letadla. Restart v
paměti ani řádek `Aircraft` bez Flight nemůže vytvořit NEW alert. Přechody
příjmových rekordů se vyhodnocují až po připravení denní statistické agregace a
porovnávají aktuální denní maximum s načtenými denními/celoživotními baseline.
Stabilní event ID brání dvojímu emitování stejného rekordu v jednom procesu.

Stránka živého radaru vytváří jeden `EventSource`, udržuje omezenou
client-side živou stopu, animuje MapLibre DOM markery a po přerušení sítě se
znovu připojuje standardním chováním browser `EventSource`. Interpolace
potvrzené pozice vlastní na každém animation jobu presentation-only vizuální
heading: sleduje vykreslený pohyb markeru A → B, pokud je posun alespoň 25 m,
a poté fallbackuje na heading potvrzené pozice, reportovaný track a last known
track. Reportovaný ADS-B track zůstává zdrojem pro predikci a datovou
sémantiku. Původní chyba headingu vznikla použitím tohoto reportovaného tracku
během interpolace i tehdy, když se marker viditelně korigoval po jiné dráze
potvrzené pozice. Stránka statistik má vlastní page-scoped stream pro živé
countery.

## Živý tok OGN / FLARM

Když `OGN_ENABLED=true`, `OgnProvider` se připojí k oficiálnímu OGN APRS-IS
endpointu s kanonickou latitude/longitude přijímače a nakonfigurovaným radiusem.
Server-side filtr APRS-IS požaduje `r/.../.../... -u/OGADSB`, ale lokální
classifier přesto zahazuje každý paket `OGADSB`. Omezený 512bajtový line
reader zpracovává CRLF framing, komentáře, TNC2 obálky a reconnecty; provider
odesílá jen periodický komentář `#keepalive` a žádnou telemetrii letadel.
Prohlížeč ani Prisma do této cesty nevstupují.

Přijaté pozice letadel procházejí validací timestampu podle nejbližšího UTC dne,
tolerancí budoucnosti, limitem stáří 120 sekund, klasifikací TOCALL podle
zdroje a identitním klíčem `addressType + address`. Novější pozorování
nahrazují kanonickou pozici; stejné timestampy mohou přidat provenienci
přijímače; starší pozorování target nikdy nevrátí zpět. OGN DDB resolver používá
omezenou RAM cache přesných rozlišení `device_type:device_id`.
Při startu procesu `OgnDdb` nejprve načte validovanou lokální last-known-good
cache verze 1 z `OGN_DDB_CACHE_FILE`, pokud je persistence zapnutá; jde pouze
o lokální operaci bez síťového requestu. Úspěšné cílené dávky
`FOUND`/`MISSING` označí omezený RAM snapshot jako dirty a později jej
persistují jediným debounced atomickým writerem. Původní `resolvedAt` se
zachovává, takže existující pravidla positive refresh/max-stale a negative TTL
platí i přes restarty. Persistentní soubor neobsahuje APRS pakety ani pozice a
nemůže unresolved zařízení zpřístupnit.
`OgnDdb.start()` nestahuje celou tabulku: přijatý paket zařadí identitu zařízení
do fronty a resolver debounceuje unikátní ID do omezených cílených requestů
`?j=1&t=1&device_id=...`. Povoluje pouze jednu in-flight dávku, vynucuje
minimální interval requestů a po `429` aplikuje globální bránu
`Retry-After`. Oficiální základní reprezentace `?j=1` je fallback pro
stejnou dávku při povolených rich-representation/server failures; network/schema
failure znovu zařadí požadované identity jako unresolved. Platná cílená prázdná
odpověď vytvoří krátce žijící negative/missing resolution. DDB odpovědi se
indexují jen podle přesného device type a ID, takže záznam se stejným ID pod
jiným typem se nepoužije. Starý full-table loader zůstává pouze jako explicitní
compatibility/debug cesta `refresh()`.

Není-li oficiální resolution dostupné, resolver může konzultovat explicitně
zapnutý lokální SQLite snapshot SoftRF `ogn.db`. Povinný sidecar
`ogn.db.meta.json` poskytuje důvěryhodný UTC timestamp `generatedAt` a
lowercase SHA-256 hash přesné databáze; mtime slouží pouze k detekci náhrady.
AirRadar jednou validuje read-only schéma `devices`, stáří metadat, počet
řádků a typy privacy flags a poté v paměti drží jen řádky `type + id` s
`track=1` a `ident=1`. Datová sada SoftRF je whitelist pod live OGN DDB a
oficiální persistentní cache; neposkytuje metadata, nikdy se nedotazuje pro
každý APRS paket a expiruje po nakonfigurovaném TTL. Špatný refresh ponechá
předchozí platný snapshot v paměti nedotčený.

Rychlost APRS `CSE/SPD` je už v uzlech a ukládá se přímo do `groundSpeedKt`
bez ohledu na zdrojový TOCALL. Privacy je fail-closed pro každé zařízení,
dokud jeho resolution zůstává unresolved; packet no-tracking a DDB
tracked/identified volby se aplikují před veřejnou serializací. Existující
privacy-valid cache záznamy zůstávají viditelné během svého maximálního stale
okna, i když jiné zařízení nebo upstream DDB nejsou dostupné.

`/api/ogn/state` vrací aktuální omezený snapshot a `/api/ogn/stream`
doručuje initial snapshot plus slučované aktualizace a heartbeat. OGN nemá
žádný vliv na `/api/stream`, lokální filtry letadel, lokální historii,
statistiky, alerty ani hlavní stav přijímače. Stale targety se označí po
15 sekundách a odstraní po 60 sekundách; mapa targetů je omezená na
5 000 položek.

## Letecké počasí

`AviationWeatherProvider` načte omezenou validovanou cache v procesu a potom
obsluhuje on-demand požadavky METAR, TAF, International SIGMET a AirSIGMET.
Úspěšné normalizované hodnoty aktualizují paměť a označí omezenou cache jako
změněnou. Lazy recovery checkpoint zapisuje
`/var/lib/airradar/weather/weather-cache-v1.json` standardně 30 minut po první
změně (`AVIATION_WEATHER_CACHE_CHECKPOINT_MS`; `0` znamená pouze při ukončení).
Úplný snapshot vzniká až při checkpointu a generace zachovávají změny vzniklé
během asynchronního zápisu. Selhání nikdy nezapisují chyby providera ani
nezastaví live počasí. Verzovaný soubor se zapisuje přes dočasný soubor, `fsync`
a atomický rename. Chybějící, příliš velký, malformed, s chybnou verzí nebo
částečně neplatný soubor se ignoruje po jednotlivých záznamech a nemůže zabránit
startu.

Při startu procesu se platné persistentní záznamy stanou stale-capable fallbacky
a po vypršení product TTL se stále pokusí o live request. Persistentní fallback
je omezen product-specific maximálním stářím (2 hodiny pro METAR, 24 hodin pro
TAF a SIGMET), odděleně od běžného in-memory stale-if-error okna. Prázdné
úspěšné METAR/TAF odpovědi se zachovávají jako negative entries a prázdná
SIGMET datová sada vyčistí předchozí dataset. SIGMET odpovědi vždy znovu
kontrolují `validFrom` a `validTo` každého feature; stale dataset proto může
správně vrátit nula aktivních features poté, co všechna advisory expirují.

Weather odpovědi zveřejňují `cacheSource` (`live`, `memory-cache` nebo
`persistent-cache`), `fetchedAt`, `snapshotAgeMs` a `stale`.
Persistentní záznam je explicitně označen stale, dokud neuspěje live refresh.
Vývojové a testovací procesy nezapínají writer do `/var/lib`, pokud není
persistence explicitně nakonfigurována.

RAM zůstává při běžném běhu autoritativní, takže checkpoint nemění TTL produktů,
kadenci provideru ani stale-if-error. Kanonický shutdown coordinator zapíše
aktuální stav. Hard crash může ztratit nejvýše jeden checkpoint interval nově
získaných recovery dat, která se po restartu znovu načtou.

## Persistence historie

Airport Intelligence čte okolní letadla z existujícího lokálního aircraft SSE
na klientovi a filtruje nedávná ADS-B pozorování s pozicí v radiusu 30 km.
Aktualizace SSE nespouští žádný dotaz na počasí, letiště ani historii. Airport
Intelligence V3 odděleně provede jeden page-scoped
`GET /api/airports/:icao/operations?period=24h` a jedno čtení počasí letiště;
Operations Board, sjednocená časová osa pohybů, runway comparison a detailní
weather panel znovu použijí tyto dva výsledky místo dalšího 24h movement
requestu nebo duplicitního weather requestu. Operations odpověď propaguje
`complete`/`truncated` stav omezeného movement dotazu. Použití dráhy zůstává
receiver-inferred; klient jej porovnává se složkami větru z pozorovaného METAR
bez odvozování důvodu případného rozdílu. Řádky timeline odkazují na existující
Flight Story detail. OGN není zahrnuto v těchto letištních funkcích.

Airport Live Board V2 obnovuje pouze operations/weather čtení každých 30
sekund pomocí one-shot timeru. Jedna page-scoped aircraft SSE subscription je
sdílená mezi Live Boardem a Nearby Aircraft, takže se druhý airport stream
neotevírá. Klient řadí platné movement timestampy newest-first, deduplikuje
recent arrival/departure lane podle Flight ID, každý lane omezuje na šest
položek, GO_AROUND/HOLDING drží v samostatném omezeném lane provozních událostí
a zobrazuje nejvýše čtyři runway-usage řádky. Sdílený SSE snapshot navíc krmí
NOW inbound/outbound lane přes existující konzervativní airport-traffic
classifier; stale nebo neplatné pozice jsou vyřazené. SSE update nespouští
databázový, weather ani operations request.

Každý úspěšný refresh providera nahrazuje čekající history snapshot. Jediný
history writer vypouští tuto slučovanou frontu. Pro každé letadlo s platnou
pozicí `persistHistory()` zapisuje pouze tehdy, když je poslední vzorek starší
než `HISTORY_SAMPLE_INTERVAL_MS` (minimum vynucuje konfigurace). Zápisy běží
s omezenou concurrency a selhání každého letadla je izolované.

Transakce upsertuje řádek `Aircraft` podle ICAO hexu, najde aktuální otevřený
`Flight`, aktualizuje nebo vytvoří instanci letu a vloží jeden
`FlightPosition`. Pokud jsou přítomna obě pozorování callsignu a liší se,
vytvoří se nová instance; continuity gap uzavře starou instanci v jejím
last-seen čase. Chybějící PostgreSQL vrací memory-backed úspěšný výsledek pro
bookkeeping vzorkování, zatímco `GET /api/history/:hex` fallbackuje na
aktuální omezenou RAM stopu, pokud databáze nemá použitelný výsledek.

Maintenance periodicky uzavírá stale otevřené lety a maže position řádky starší
než `HISTORY_RETENTION_DAYS`. Databázi nikdy neresetuje. Endpointy seznamu a
detailu letu dotazují PostgreSQL s omezenými limity; detail letu omezuje počet
pozic a hlásí truncation.

## Souhrn provozu letiště

`GET /api/airports/:icao/traffic` vyřeší kanonické letiště a poté čte pouze
persistované instance `Flight`, jejichž `startTime` leží ve vybraném
7denním nebo 30denním kalendářním okně v `APP_TIMEZONE` (výchozí je 30 dní).
Dva omezené route predikáty pokrývají origin a destination; řádky se deduplikují
podle `Flight.id`, takže let nemůže navýšit total, když obě pole odkazují na
stejné letiště. Odpověď agreguje departures, arrivals, unikátní letadla podle
ICAO identity, aktivní lokální dny, first/last capture, top callsigny a omezené
seznamy routes/aircraft/recent flights.

Metadata route letišť se načítají dávkovými ICAO/IATA dotazy s bundled
katalogem jako fallbackem. Chybějící route metadata se vynechají z route
rankingu, neodvozují se z `FlightPosition`; souhrn nikdy nečte
`FlightPosition` ani nevolá externího providera. Recent odkazy používají
kanonické ICAO letiště, ICAO hex letadla a existující detail flight history.
Jde o provoz pozorovaný přijímačem, nikoli kompletní počet provozu letiště.
Oba route predikáty používají dotaz omezený 500řádkovým sentinelem; pokud je
kterýkoli zkrácen, zachová se `complete: false`, ale totaly, active days,
heatmap a všechny rankingy se stále počítají z deduplikované zkrácené sady
řádků. Jde o známé performance/data-quality omezení pro vytížená letiště,
které má v budoucím batchi řešit database-side agregace.

Celoživotní statistiky detailu letadla čtou pouze `Flight` řádky daného
letadla přes existující index `(aircraftId, startTime)`. Počítají zachované
instance Flight, lokální aktivní dny, callsigny, vyřešené origins/destinations
a routes. Záměrně neskenují `FlightPosition`; vzorkované pozice zůstávají ve
vlastnictví omezeného per-flight playback endpointu.

NEW label detailu letadla vychází z toho, že lokální den první persistované
instance Flight v `APP_TIMEZONE` odpovídá aktuálnímu dni. Přítomnost v RAM se
nepoužívá, takže restart procesu nemůže vytvořit falešné první pozorování.
RARE label se zobrazuje pro nenové letadlo s jednou až třemi zachovanými
instancemi Flight. RETURNING se zobrazuje, když nejnovější persistovaný Flight
začíná alespoň 30 celých dnů po posledním pozorování předchozího Flight. Tyto
thresholdy jsou explicitní V1 pravidla a tooltip detailu vysvětluje uložené
důkazy za každým labelem; žádná provider inference se nepoužívá.

## Statistiky a pokrytí

`ReceiverStatistics.observe()` běží po každém aplikovaném snapshotu. Počítá
unikátní ICAO identity pro lokální den vybraný `APP_TIMEZONE`, sleduje
maximum současných letadel, maximální vzdálenost a rozdělení typů/aerolinek.
Platné pozice produkují maximální vzdálenost v jednom z 36 pevných
10stupňových azimutových bucketů. Neplatné pozice `(0, 0)` a neplatné
souřadnice přijímače jsou z coverage vyloučeny.

Pouze dirty řádky se flushují do PostgreSQL na throttlu a znovu při shutdownu.
Startup načítá agregaci aktuálního lokálního dne. Range odpovědi pro `7d` a
`30d` čtou tři tabulky denních statistik, slučují aktuální RAM den, vytvářejí
denní trendy, period summary, coverage summary obsazených bucketů a porovnání
s bezprostředně předchozím stejně dlouhým lokálním obdobím. Comparison fields
zůstávají unavailable, když daná agregace chybí; statistiky nikdy nepublikují
přesné souřadnice přijímače.

Pozorování maximální vzdálenosti si také zachovává normalizovaný ICAO hex,
bearing, timestamp a registraci, je-li dostupná. `/api/reception-records`
čte až deset persistovaných denních řádků s platným V1 bearingem a slučuje
aktuální RAM den. Vrací nejlepší denní rekordy a celoživotní maximum bez
skenování `FlightPosition`; legacy denní řádky před zavedením bearingu jsou
vyloučeny z kompletního seznamu rekordů a UI na to upozorňuje.

## Rozšířené pokrytí

Volitelný HTTP provider ADSB.lol je pouze zdroj živého zobrazení. S
`ADSBLOL_BASE_URL=https://re-api.adsb.lol` používá feeder-authorized readsb
endpoint `?circle={lat},{lon},{radius}`; varianta veřejného API používá
`/v2/lat/{lat}/lon/{lon}/dist/{radius}`. Obě používají omezený radius/poll
interval, request timeout, maximální počet letadel, stale threshold a
exponenciální retry omezené konfigurací. Odpověď 429 respektuje
`Retry-After`, je-li přítomno. Merger deduplikuje podle normalizovaného ICAO
hexu a považuje pozorování za kandidáta pozice jen tehdy, když jsou obě
souřadnice platné a `seen_pos` čerstvé. Existence letadla je oddělená od
použitelnosti pozice: extended výsledek je úplné sjednocení lokálních/síťových
identit, takže lokální letadla bez čerstvé pozice zůstávají zachována. State
service každému ICAO přiřadí source affinity a drží letadlo na tomto zdroji,
dokud některé z pozorování zůstává v RAM; dočasný výpadek zdroje proto nemůže
přepnout marker local ↔ network. V rámci zvoleného zdroje se preferuje čerstvá
pozice a v případě potřeby se zachová její poslední známá použitelná pozice;
jinak souřadnice zůstávají null. Zobrazená network-only letadla jsou označena
proveniencí zdroje; nevstupují do historie, lokálních denních statistik,
alertů, enrichmentu metadat, ATC resolution ani health lokálního přijímače.
Veřejný UI/API výstup obsahuje atribuci ADSB.lol a ODbL 1.0.

## ATC tok

`GET /api/atc/sectors` vrací aktivní datovou sadu sektorů/vysílačů. V demo
režimu nebo při `ATC_SAMPLE_ENABLED=true` používá explicitně označené sample
konstanty. S nakonfigurovaným reálným přijímačem a vypnutým sample čte pouze
importované PostgreSQL řádky; prázdné/nedostupné tabulky vytvoří prázdnou vrstvu.

Pro každé letadlo s pozicí state service throttluje opakované lookup keys a
žádá `AtcSectorService` o nejlepší shodu point-in-polygon, výšky a času
platnosti. Metadata sektoru a frekvence se kopírují do probable assignmentu.
Souhrny relevantních frekvencí agregují už vyřešené assignmenty podle
frequency/service/callsign a zahrnují confidence counts. Žádná cesta netvrdí
skutečně naladěnou frekvenci letadla.

## Pomocné toky

- Metadata `ADSBDB` jsou klíčována aircraft hexem. Route data ADSBDB jsou
  klíčována aircraft hexem, normalizovaným callsignem a UTC datem, takže reuse
  callsignu nemůže tiše sdílet trasu napříč letadly nebo dny. RAM cache
  zachovává existující 24hodinové TTL metadat a 6hodinové TTL tras; pozitivní
  hodnoty ADSBDB se navíc hydratují z volitelného omezeného snapshotu verze 1
  `/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`. Metadata mají 7denní
  persistentní stale limit a trasy 24 hodin. Persistentní hodnoty se použijí
  pouze po chybě providera; platný provider miss nikdy neoživí stale data.
  Negativní výsledky zůstávají jen v RAM. Data flight planu FlightAware jsou
  klíčována callsignem a časem pozorování. Vše je server-side enrichment s
  cache/concurrency limity.
- Persistence ADSBDB je pouze recovery cache. Autoritativní je RAM: `set` a
  `delete` okamžitě mění omezené mapy a generation countery, zatímco jediný
  checkpoint serializuje mapy v termínu odvozeném od první mutace (výchozí
  interval 60 minut). Úspěšný atomic rename posune persisted generation;
  mutace během zápisu zanechají cache jako dirty. Zachovány zůstávají fsync,
  dočasný soubor, práva `0600`, validace i atomic rename. Běžný provoz tedy
  používá aktuální RAM, graceful shutdown ji uloží a hard crash může vynechat
  až hodinu nového enrichmentu bez dopadu na ADS-B ingest, historii nebo
  `FlightPosition`.
- Airport objekty z ADSBDB route procházejí `AirportResolver`: PostgreSQL
  exact ICAO, poté IATA, pak platné souřadnice providera a nakonec malý bundled
  katalog. Tím se řeší metadata zobrazení; route code providera zůstává
  identitou trasy, pokud není dostupné kanonické ICAO z katalogu.
- Aviation Weather je nezávislý volitelný tok. `GET
  /api/weather/airport/:icao` a omezená forma `?icao=ICAO1,ICAO2` rozliší
  kanonická ICAO letiště před načtením METAR/TAF z AviationWeather.gov.
  `GET /api/weather/sigmet` kombinuje worldwide International SIGMET feed s
  CONUS domestic feedem, validuje Polygon/MultiPolygon GeoJSON, filtruje
  aktuálně platné záznamy a vrací bezpečnou normalizovanou FeatureCollection.
  International a AirSIGMET mají oddělené omezené cache záznamy a slučují se
  až při odpovědi, takže jeden feed se může obnovit nebo selhat bez zahazování
  čerstvých/stale dat druhého. Diagnostika datové sady zveřejňuje stav
  fresh/stale/unavailable. Oddělená product TTL, negative entries, in-flight
  coalescing, omezené RAM cache, stale-if-error, timeout a `Retry-After`
  backoff chrání upstream. Počasí se nikdy nepersistuje ani nezahrnuje do
  aircraft SSE.
- `GET /api/aircraft/:hex/photo` validuje identitu letadla, hledá metadata
  Planespotters podle hexu a pouze při prázdném výsledku podle registrace.
  Prohlížeč načítá povolený HTTPS thumbnail přímo; image bytes neprocházejí
  server cache.
- `/api/airports` poskytuje PostgreSQL katalog letišť, pokud není prázdný,
  jinak bundled fallback šesti letišť. `GET /api/search` prohledává živá
  letadla v RAM, katalog letišť, omezená data ATS bodů a omezenou množinu
  kandidátních Flight řádků z posledních sedmi dnů. Historický Flight search se
  zapíná od tří znaků a nikdy nečte `FlightPosition`. Přesné smart actions
  Command Search V2 se parsují ještě před čekáním na live stav nebo přístupem do
  DB, takže neprovádějí žádné search read dotazy. Root-level klient zachovává
  debounce 220 ms pro běžné search query. Nedávné výběry zůstávají omezenými
  browser-local záznamy v `localStorage` a přijímají pouze interní AirRadar
  cesty; nevstupují do serverové persistence ani žádné live datové větve.
- `GET /api/history/flights` nově přijímá také přesné normalizované ICAO filtry
  `origin=` a `destination=`. Skládají se s existujícími omezenými
  range/query filtry a používají je smart destination actions; endpoint nadále
  čte pouze Flight řádky.
- Prospective predictive validation je downstream od shadow predictive
  evaluace. Capture ukládá immutable prediction a Flight-Intelligence lifecycle
  key. Těžší offline validační tooling může používat omezené Flight/FlightPosition
  terminal evidence; predictive output nikdy není vstupem Ground Truth
  klasifikace.
- Predictive Graduation Readiness je lehčí runtime read cesta. Admin-only
  `GET /api/admin/predictive/readiness` čte nejvýše 15 000
  `PredictiveObservation` a 2 500 persistovaných LANDING FlightEvent z
  posledních 30 dnů. Koreluje primárně lifecycle key, používá factual
  ground-confirmation timestamps a nezávisle reportovaný arrival runway, pokud
  existuje, vrací pouze agregované metriky a nikdy nečte `FlightPosition`.
  Výsledek se cachuje pět minut. Dosažení limitu označí report jako neúplný a
  žádná capability z takového evidence nemůže dostat PASS.
- Veřejný `GET /api/aircraft/:hex/prediction` neprovádí readiness DB čtení,
  dokud je policy čistě SHADOW/DISABLED. Pokud operátor explicitně nastaví
  capability PUBLIC, read-only readiness gate ji bez aktuálního PASS efektivně
  stáhne zpět do SHADOW. Automatická PUBLIC promotion ani readiness write path
  neexistuje.
- Predictive ETA Advisory V1 používá stejnou aircraft prediction odpověď.
  Anonymní klient dostane `etaAdvisory` pouze pokud ETA po readiness enforcement
  zůstává efektivně PUBLIC, readiness je PASS, predikce není starší než 45 s,
  ETA leží v budoucnosti a readiness report obsahuje konečnou p90 absolutní ETA
  chybu. Tato p90 chyba se zaokrouhlí nahoru na minuty a zobrazí se jako ±
  uncertainty; žádná heuristická nejistota se nevymýšlí. Platná admin session
  může navíc dostat `adminPreview` pro SHADOW/PUBLIC diagnostiku; anonymní
  klient tento field nikdy nedostane. Aircraft detail čte endpoint jednou při
  mountu a nevytváří druhý live stream ani polling loop.
- Predictive Runway Advisory V1 přidává do stejné odpovědi `runwayAdvisory`
  pouze pokud RUNWAY po readiness enforcement zůstává efektivně PUBLIC,
  readiness je PASS, predikce není starší než 45 s, dráha není null a confidence
  je známá. Platná admin session může dostat `runwayAdminPreview` s readiness
  reasons, přesností konce dráhy, coverage a freshness stavem; anonymní klient
  tento preview nikdy nedostane. Aircraft detail nadále používá jediný prediction
  fetch bez dalšího streamu nebo pollingu.
- Predictive Runway Change Advisory V1 přidává do stejné odpovědi
  `runwayChangeAdvisory` a pro platnou admin session také
  `runwayChangeAdminPreview`. Při skutečném přechodu se do omezeného RAM
  prediction stavu uloží `changedFrom` a `changedAt`. Další evaluace mohou
  event držet nejvýše pět minut, pokud predikovaná dráha zůstává stejná;
  prospective RUNWAY_CHANGE observation se dál vytváří pouze při skutečném
  přechodu previous-runway != current-runway. Veřejný výstup současně vyžaduje
  prediction snapshot uvnitř 45sekundové freshness hranice.
- Predictive Trajectory Advisory V1 přidává do stejné odpovědi
  `trajectoryAdvisory` a pro ověřeného admina `trajectoryAdminPreview`.
  Prospective trajectory řádek vzniká pouze při změně state nebo confidence a
  nese `trajectoryState` v omezeném `evidenceJson`. Readiness při počítání
  instrumentovaných observations a kandidátních odchylek ignoruje starší
  metadata-only trajectory řádky.
- Predictive Outcome Truth V1 kombinuje neměnné `PredictiveObservation`
  snapshoty s omezenými read-only dotazy na persistované `FlightEvent`
  outcome. RUNWAY_CHANGE používá pre-prediction APPROACH runway a pozdější
  provider-reported LANDING runway. TRAJECTORY používá následné confident
  abnormální Flight Intelligence eventy jako positive truth a pouze
  ground-confirmed landing na stejném prospective cíli jako negative truth.
  Chybějící nebo nejednoznačná evidence zůstává UNSCORABLE. Každý event-type
  dotaz má limit 2 500 řádků; truncation označí celý readiness collection jako
  incomplete. Tento tok nikdy nečte FlightPosition a truth nezapisuje zpět do
  prediction řádků.
- Predictive Graduation Calibration V1 vzniká uvnitř stejného admin readiness
  requestu až po evidence collection a PASS/WAIT/FAIL evaluaci. Nepřidává žádný
  DB dotaz. Calibration builder čte pouze již sestavené
  `PredictiveReadinessEvidence`, evaluation výsledek a complete bit a vrací
  count deficity, truth požadavky a quality marginy. Browser tato data
  vykresluje jen na ověřené System Status stránce; veřejný aircraft ani
  Operations Center serializer calibration výstup nepoužívá.
- Predictive Operations Center V1 znovu používá stejné advisory buildery přes
  `GET /api/operations/predictive?hexes=`. Klient předává maximálně šest již
  relevantních ICAO identifikátorů. Server seznam normalizuje a deduplikuje,
  načte jeden readiness report a z existujícího RAM stavu vytvoří veřejné
  ETA/runway/runway-change/trajectory advisories nebo ověřené admin SHADOW preview. Endpoint žádnou
  predikci znovu nepočítá. Radarový klient tento omezený snapshot při otevřeném
  Operations Center obnovuje po 30 sekundách a zobrazené hodnoty lokálně
  expiruje po 45 sekundách. Tento tok nikdy nevstupuje do hlavního aircraft SSE.
- Konfigurace Alerts & Fleets V1 se ukládá v PostgreSQL přes serverový
  repository (`AlertFleet`, `AlertFleetMatcher`, `AlertGeofence` a `AlertRule`).
  Zapnuté řádky se načítají do vyměnitelné cache v paměti; CRUD zápis nejprve
  uloží data a potom cache invaliduje. Legacy JSON watchlist zůstává oddělený.
  Odděleně je browser watchlist mapy localStorage filtr, nikoli serverové
  notifikační pravidlo.
- `/fleet` odvozuje identity ze stejného serverového watchlistu, ponechává jen
  pravidla `icaoHex` a deduplikuje podle normalizovaného ICAO hexu. Callsign,
  registrace, pattern, typ a airline pravidla jsou filtry pozorování, nikoli
  identity Fleet. Jeden snapshot přijímače poskytuje live/offline stav, zatímco
  jeden sdílený 30denní dotaz `Flight` poskytuje 7/30denní počty a route
  rankingy; nevytváří se žádný druhý live poller.

Souhrn logbooku na domovské stránce je samostatný page-scoped fetch
`GET /api/logbook/summary`. Používá aktuální snapshot state service pro live
a watchlist počty a poté dávkuje dnešní persistované Flight identity a jejich
celoživotní Flight řádky pro klasifikaci NEW/RARE/RETURNING. Nevolá se pro
každou SSE událost a při nedostupném PostgreSQL zobrazuje nula trvalých labelů
místo toho, aby restart procesu považoval za nové pozorování.

## Přehledy přijímače

`GET /api/recap?range=daily|weekly` je page-scoped čtení v lokálním čase
Europe/Prague. Čte vybraný rozsah dat z `ReceiverDailyStats` a
`ReceiverDailyAircraft`, počítá Flight counts/routes/types v databázi a pro
labely načítá nanejvýš first/latest celoživotní řádky pro každé letadlo.
Denní odpověď navíc skládá deterministické Daily Intelligence z omezených
řádků `Flight.startTime`/`airline`, database-side agregací typů
`FlightEvent`, omezené sady posledních `FlightEvent` a již omezené historie
alertů. Z těchto vstupů vzniká nejrušnější hodina, top airlines, počty
operačních událostí a omezená timeline hlavních událostí; při dosažení limitu
vrací odpověď `dailyIntelligence.complete=false`. Týdenní porovnání čte
předchozích sedm agregačních oken bez lifetime enrichmentu a bez Daily
Intelligence. Chybějící agregační řádky zůstávají v odpovědi chybějící místo
převodu na nuly. Recapy neskenují `FlightPosition`, neprovádějí provider
requesty, nevytvářejí další EventSource ani nepřidávají další polling loop.

## Historický tok Time Machine

`GET /api/time-machine/range` čte skutečné první/poslední hodnoty
`FlightPosition.recordedAt`. `GET /api/time-machine/window` validuje
maximálně pětiminutové UTC okno, načte nejvýše 40 000 pozic a 500 flight
identit a poté připojí persistentní metadata a read-only markery
`FlightEvent`. Prohlížeč drží jedno omezené okno a lokálně rekonstruuje
vybraný okamžik. Historická čtení nikdy nevolají intelligence detekci, alerty,
notifikace ani live polling.
## Tok integrity navigace

Aircraft state service předává každý lokální a síťový snapshot do větve
integrity navigace. Čerstvá, polohovaná pozorování s použitelnou proveniencí
jednotlivých polí se deduplikují, drží v omezeném process store a v pomalejší
periodě se vyhodnocují do souhrnů buněk a kandidátů anomálií s hysterezí.
Volitelné zápisy do databáze jsou asynchronní a best-effort; read API vystavují
omezené current, aircraft, history a diagnostic pohledy.

# Flight Story

`/flights/[id]` čte omezený Flight Story obsahující identitu Flight,
vzorkované pozice v celém rozsahu, persistované FlightEvents a route context.
Flight Story V2 skládá souhrn a narativ výhradně z tohoto payloadu: persistované
hodnoty start/end Flight jsou pozorované hranice, vzorkovaná trasa poskytuje
omezenou metriku délky/maximální rychlosti a FlightEvents zůstávají explicitně
odvozené s confidence a nejbližší vzorkovanou telemetrií. Jeden playback
timestamp řídí mapu, seek narativu, profil, výběr události a Map Context V2.
Neotevírá se druhý stream ani history dotaz a během playbacku neběží žádná
write cesta detectoru, alertu ani notifikace.
## Tok provenience výšky

Beast, lokální `aircraft.json` a volitelná síťová pozorování se normalizují
do typovaných field-level pozorování výšky. Centralizovaná altitude policy
používá prioritu zdroje, freshness pozorování, confidence, disagreement a
temporal vertical-rate guard pro vytvoření jednoho `AltitudeDecision`.
Vybraná hodnota a metadata rozhodnutí putují společně do vzorkovaných řádků
`FlightPosition`; pouze významné konflikty vytvářejí omezené řádky
`AltitudeAnomaly`. Úplné rozhodnutí je dostupné chráněné admin diagnostice,
zatímco globální SSE payloady zůstávají beze změny. Historické pozice jsou
záměrně ponechány s NULL proveniencí.
