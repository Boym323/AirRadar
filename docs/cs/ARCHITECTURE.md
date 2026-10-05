# Architektura

Tento dokument popisuje implementaci aktuálně přítomnou v repozitáři. Hlavní
zdrojové soubory jsou odkazovány přímo v textu; vygenerované Prisma artefakty
jsou výstupy, nikoli zdroje schématu.

## Tvar runtime

Read boundary Flight Story (`lib/server/flight-story.ts`) je samostatná
read-only kompozice nad historickými tabulkami a není napojena na live polling
ani na write větve intelligence. Flight Story V2 skládá svůj souhrn a narativ
na klientovi ze stejného omezeného payloadu; nevytváří další history dotaz,
aircraft stream, EventSource ani druhý playback clock.

```text
RTL-SDR / web root readsb
        │  /data/aircraft.json, /data/receiver.json
        ▼
LocalReadsbProvider (nebo MockReadsbProvider, když je READSB_BASE_URL prázdná)
        ▼
jedna globální AircraftStateService
  ├─ RAM mapa letadel, stale cleanup, vzdálenost/bearing, omezené živé stopy
  ├─ volitelný NetworkFailoverProvider: ADSBHub SBS/30003 + ADSB.lol raw + HTTP
  │    └─ omezená síťová RAM mapa (deduplikované sjednocení zdrojů)
  ├─ asynchronní enrichment a ATC resolution
  ├─ asynchronní persistence vzorkované historie
  ├─ denní agregace ReceiverStatistics
  ├─ page-scoped čtení souhrnu logbooku
  ├─ AlertEngine
  │   └─ append-only ledger alert událostí (`/var/lib/airradar/alert-events.jsonl` v produkci)
  └─ listeners
        ├─ GET /api/aircraft
        ├─ GET /api/stream (SSE)
        └─ health, statistiky, vyhledávání, watchlist a UI konzumenti
```

Analytika pokrytí přijímače je samostatná omezená odvozená větev. Její sampler
čte lokální a aktivní síťovou RAM mapu, persistuje pouze hodinové agregační
čítače a nikdy nezapisuje síťová letadla do historie, lokálních statistik,
`FlightPosition`, alertů ani stop.

`getAircraftStateService()` ukládá jednu službu do `globalThis`. `start()`
je idempotentní: načte statistiky a spustí první lokální a síťový refresh;
obě větve plánují další refreshe nezávisle. `subscribe()` a `waitForReady()`
jsou vstupní body používané routami. Produkční architektura je záměrně
jednoprocesová: více Node workerů by duplikovalo polling, vyhodnocování alertů,
pozorování statistik a vzorkování historie.

Server-side provider boundary je `AircraftProvider`. Nakonfigurovaný lokální
provider načítá web root readsb/tar1090; prázdná base URL vybírá deterministický
demo provider. Frontend provider nikdy nevybírá.

Command Search V2 zůstává jednou mountnutý z root layoutu. Search control v
topbaru je pouze trigger; root-level palette vlastní jedinou debounce větev
`GET /api/search?q=`, klávesový stav a omezené browser-local recents.
Serverová search hranice může pro běžné dotazy navíc provést omezené dotazy nad
nedávnými Flight řádky; nikdy nečte FlightPosition. Přesné smart actions se
parsují ještě před čekáním na live stav nebo přístupem do databáze a vracejí
pouze existující interní cíle. Action `lety do <ICAO>` používá existující
history list s přesným destination filtrem. Command Search nevytváří
EventSource, aircraft subscription, LLM větev ani server-side persistenci.

`NetworkAircraftProvider` je
samostatná volitelná hranice pro pouze živé pokrytí. `AdsbHubProvider`
konzumuje obecný agregovaný stream SBS/30003 z `data.adsbhub.org:5002`; tyto
řádky se neklasifikují jako MLAT. Všechny zapnuté síťové větve běží souběžně a
deduplikují se podle normalizovaného ICAO hexu se zachováním provenience
síťového zdroje. `AdsbLolRawProvider` konzumuje dva autorizované odchozí
streamy ADSB.lol, dekóduje global CPR a slučuje BEAST a SBS/MLAT podle ICAO.
`AdsbLolProvider` drží svůj validovaný snapshot v RAM. Žádná z těchto větví
nevstupuje do lokální historie, statistik, alertů, enrichmentu ani ATC vstupů.

`OgnProvider` a `OgnStateService` tvoří druhou volitelnou live-only hranici.
Jsou to server-side singletony ve stejném Node procesu, ale nejsou potomky
`AircraftStateService`. `OgnProvider` vlastní jeden omezený TCP stream
APRS-IS, receive-only login a comment-only `#keepalive`; `OgnStateService`
vlastní OGN RAM mapu, znovuaplikování DDB pravidel soukromí, stale/capacity
cleanup a nezávislou sadu listenerů pro `/api/ogn/stream`. OGN nikdy nevolá
Prisma ani žádnou ADS-B větev historie/statistik, enrichmentu, alertů nebo
health přijímače.

`OgnDdb` smí persistovat pouze validovaná DDB rozlišení do verzovaného
lokálního stavového souboru `/var/lib/airradar/ogn-ddb-cache-v1.json`
(konfigurovatelného na serveru). Soubor je last-known-good cache, nikoli
autorita: je přísně omezený a při načtení validovaný, zachovává původní
timestamp každého rozlišení a zapisuje se přes jediný debounced atomický
writer. Neobsahuje žádné OGN pakety, souřadnice, pozice ani historii. Produkční
systemd už vytváří výchozí adresář pomocí `StateDirectory=airradar`; selhání
persistence je best-effort a nemůže zastavit živé OGN ani ADS-B zpracování.
Při zapnutí stejný resolver také načte lokální read-only snapshot SoftRF
`ogn.db` do omezeného whitelistu v paměti. SoftRF se konzultuje až po live
OGN DDB a oficiální cache a jeho neplatné/expirované záznamy nikdy
nezpřístupní unresolved zařízení.

## Vlastnictví na serveru

`AircraftStateService` vlastní živý životní cyklus a koordinuje následující
nezávislé větve:

- `LocalReadsbProvider` normalizuje surová pozorování readsb do sdíleného
  tvaru `Aircraft`. Preferuje barometrickou výšku/rychlost, zachovává
  geometrické hodnoty a počítá vzdálenost/bearing z interní polohy přijímače.
- ADSB.lol raw/HTTP síťové větve jsou opt-in a omezené. State service je
  spouští nezávisle na lokální retry smyčce; raw validuje BEAST/SBS vstup a
  HTTP fallback validuje veřejnou odpověď, používá timeout/rate-limit/backoff,
  drží stale-if-error síťový snapshot a zveřejňuje sanitizovanou diagnostiku.
  Jejich letadla se slučují s lokálními pozorováními pouze při požadavku na
  extended live snapshot. State service přiřadí každému ICAO stabilní
  local/network source affinity. Poslední membership providerů sleduje
  odděleně od retencovaných pozorování, takže dočasný výpadek drží poslední
  dobrou pozici, zatímco běží omezený handoff časovač; živá alternativa pak
  převezme marker bez mezilehlého stavu bez pozice. Pokud preferované pozorování
  chybí nebo nemá použitelnou polohu, může se okamžitě použít použitelná
  alternativní pozice při zachování explicitní provenience identity/metadat.
  Vedle tohoto vlastníka stavu běží `AircraftContinuityGuard`: drží omezené
  process-local čítače kontinuity a při velkém propadu počtu v úspěšném
  snapshotu vloží před destruktivní pruning jeden potvrzovací cyklus. Nemění
  SSE framing, persistenci ani retry sémantiku providerů; diagnostika se
  zveřejňuje přes system status.
- `EnrichmentService` volá nakonfigurované providery metadat, tras a flight
  planů asynchronně. Používá normalizované klíče, pozitivní/negativní TTL,
  slučování in-flight požadavků a omezenou concurrency.
- `AtcSectorService` načítá jednu cacheovanou datovou sadu sektorů a porovnává
  bod, výšku a čas platnosti. Výsledky se připojují asynchronně a jsou
  explicitně odhady.
- `ReceiverStatistics` udržuje agregaci aktuálního lokálního dne v RAM a
  persistuje pouze změněné agregační, aircraft a coverage řádky.
- `logbook-summary.ts` sestavuje jednu omezenou dashboard odpověď z Flight
  identit aktuálního dne plus jednoho dávkového celoživotního čtení. Domovská
  stránka jej vyžádá jednou a není součástí SSE serializace ani poll smyčky.
- `history.ts` převádí snapshoty na záznamy `Aircraft`, `Flight` a
  `FlightPosition` v nakonfigurovaném intervalu vzorkování. Není to log
  každé ADS-B zprávy.
- `altitude-provenance.ts` vlastní pozorování výšky na úrovni polí, prioritu
  zdrojů, freshness, disagreement/temporal guards, omezenou diagnostiku a
  in-memory Beast forensic ring buffer. Viz
  [ALTITUDE-PROVENANCE.md](ALTITUDE-PROVENANCE.md).
- `AlertEngine` vyhodnocuje serverová pravidla při přechodech snapshotů a
  odesílá omezené asynchronní notifikace. Detekované události a výsledky
  notifikací také ukládá odděleně do bezpečného append-only JSONL ledgeru.
  Trvalé NEW události se přijímají pouze z úspěšného prvního zápisu Flight do
  historie; události příjmových rekordů se porovnávají až po startupu
  persistovaných statistik.

Živý snapshot se sestavuje z RAM mapy a řadí podle vzdálenosti. Selhání
providera zneplatní dostupnost message-rate, odstraní stale letadla a použije
omezený retry backoff; nezahodí stále čerstvá letadla ani nezastaví proces.
Lokální a síťová mapa zůstávají oddělené až do serializace požadovaného režimu
pokrytí. Extended coverage je pouze zobrazovací/read cesta a představuje
skutečné sjednocení lokálních/síťových identit; lokální letadla se zachovávají
i bez čerstvé použitelné pozice. Network-only letadla neovlivňují lokální
denní agregace, vzorkovanou historii, alerty, enrichment, ATC resolution ani
health lokálního přijímače.

## Hranice persistence

PostgreSQL je pro živý provoz volitelný. Je-li nakonfigurován, ukládá:

- trvalé identitní/katalogové řádky `Aircraft` a instance `Flight`;
- vzorkované řádky `FlightPosition` s retenčním cleanupem;
- importovaná referenční data `Airport`, `AirportRunway`,
  `AirportFrequency`, `Navaid`, `AtcSector` a `AtcTransmitter`;
- volitelný tar1090 `AircraftMetadataCache` a stav synchronizace; a
- agregace `ReceiverDailyStats`, `ReceiverDailyAircraft` a
  `ReceiverDailyCoverage`. `ReceiverDailyStats` také ukládá kompletní
  metadata V1 rekordu maximální vzdálenosti (bearing a registraci, jsou-li
  dostupné); legacy řádky bez bearingu zůstávají platnými agregovanými
  statistikami, nikoli kompletními příjmovými rekordy.

Paměť procesu drží živá letadla, stopy, omezené enrichment cache, ATC resolver
cache, hot weather cache, cache metadat fotografií, baseline příjmových rekordů
a deduplikaci alertů. Metadata tar1090 jsou indexována v PostgreSQL a v RAM se
drží pouze omezená hot LRU; synchronizace katalog streamuje a zapisuje po
dávkách bez materializace celé datové sady v paměti aplikace. Lokální fallback
prefix-blocků tar1090 je také omezen na 4 096 položek, 64 MiB a 15minutové
LRU/TTL okno, takže opakované lookupy zdroje nemohou růst v paměti procesu bez
praktického bajtového limitu. Browser watchlist je uložen v `localStorage`
daného prohlížeče; trvalé V1 flotily, typované matchery, kruhové geofence,
pravidla, výskyty a delivery řádky jsou uloženy v PostgreSQL. Zapnutá konfigurace
se načítá do jedné vyměnitelné cache v paměti; mutace se nejprve zapíše a potom
cache invaliduje. Legacy JSON úložiště zůstává pouze pro starší watchlist.
adresáři (`/var/lib/airradar/alerts.json` v produkci), nikoli v PostgreSQL.
Historie alertů je v produkci uložena jako append-only bezpečné event/status
řádky v `/var/lib/airradar/alert-events.jsonl` a čte se z omezeného tailu s
omezeným stránkováním. Lokální vývoj drží ekvivalentní soubory v `data/`;
trackovaný `data/alerts.json` je pouze legacy migrační zdroj, pokud produkční
state soubor ještě neexistuje. Pozitivní metadata/trasy ADSBDB navíc používají
volitelný omezený verzovaný snapshot
`/var/lib/airradar/adsbdb/adsbdb-cache-v1.json`; je to last-known-good
fallback providera, nikoli zdroj pravdy. Negativní záznamy a in-flight
požadavky se nikdy nepersistují. Metadata a route mapy zůstávají v omezené
RAM; mutace pouze zvýší generation a označí cache jako dirty, bez serializace
nebo zápisu. Výchozí checkpoint proběhne hodinu po první mutaci v dirty období
a při chybě používá omezený backoff od pěti minut. `ADSBDB_CACHE_CHECKPOINT_MS=0`
znamená pouze flush při ukončení nebo na explicitní žádost. Graceful shutdown
zapíše aktuální RAM přes centrální shutdown coordinator; hard crash nebo
SIGKILL může ztratit až jeden interval znovu načitatelného enrichmentu.

## Hranice prohlížeče a API

### Map Context V1/V2

Map Context je volitelná enrichment hranice s nezávislými providery pro radar
ČHMÚ (`lib/server/weather-radar`), dávkový AWC METAR, vítr DWD ICON-EU a
existující český provider aktivity AUP/UUP. Tyto providery zásobují omezená
HTTP API a MapLibre sources; žádný není napojen na `AircraftStateService` ani
na serializer aircraft SSE. V2 přidává `lib/map-time/` a omezený archiv a
resolver v `lib/server/map-context.ts`. Viz
[MAP-CONTEXT.md](MAP-CONTEXT.md) a [MAP-TIME.md](MAP-TIME.md).

Prohlížeč používá pouze API AirRadaru. `toPublicStateSnapshot()` je hranice
úplného snapshotu pro `/api/aircraft`; `toPublicLiveStateSnapshot()` je
kompaktní SSE hranice. Přesné interní souřadnice přijímače se zaokrouhlují,
skrývají nebo publikují přesně pouze podle
`PUBLIC_RECEIVER_POSITION_MODE`; surové chyby providerů se nahrazují
bezpečnými zprávami. Request/response routy mají omezený per-client
fixed-window limiting. SSE má samostatný omezený guard kapacity aktivních
klientů a pro pomalé spojení drží jen nejnovější čekající snapshot. Vybraná
letadla používají explicitní quick/full hranici: drawer živého radaru volá
`/api/aircraft/[hex]?mode=quick`, který vrací pouze trvalou identitu a lokálně
dostupná metadata/route context a nikdy nevolá placeného providera FlightAware
plánů. Samostatná stránka `/aircraft/[hex]` zachovává full detail cestu a její
on-demand FlightAware enrichment. Kontext trasy potřebný pro mapu zůstává v
kompaktním live snapshotu.
`coverage=local|extended` přijímají endpointy živých letadel, vybraného
letadla i SSE. Výchozí je `local`; `extended` zahrnuje validovaná čerstvá
pozorování ADSB.lol a publikuje stav providera, provenienci zdroje a ODbL
atribuci bez zveřejnění surových chyb providera nebo přesných souřadnic
přijímače.

Živá mapa je MapLibre mapa s DOM markery klíčovanými ICAO hexem a GeoJSON
overlayi. Vizualizace trasy je samostatný namespace Route V2. Vysokofrekvenční
SSE aircraft delty aktualizují live aircraft refs a plánují práci MapLibre
markerů přímo, nezávisle na hlavní frekvenci React renderování. Konzumenti
snapshotu na straně Reactu dostávají nejnovější sloučený snapshot v omezeném
200ms UI intervalu; úplné SSE snapshoty se commitují okamžitě. Toto rozdělení
nemění SSE protokol, sémantiku pohybu potvrzené pozice ani vlastnictví markerů
MapLibre.

`AirRadarApp` zůstává vlastníkem instance MapLibre, animation jobs, dat vrstev
a orchestrace napříč funkcemi. Zaměřené radarové hranice jsou v
`components/radar/`: `useRadarLiveAircraft` vlastní jediné browser
subscription aircraft streamu plus live refs a slučování React snapshotů;
`RadarMapLayerMenu` vlastní prezentaci menu vrstev; `RadarTrafficBrowser`
vlastní prezentaci provozu/filtrů/watchlistu a drawer-local state;
`RadarDrawerDetails` vlastní renderování vybraného cíle; a
`useRadarDrawerInteractions` vlastní focus/keyboard efekty draweru. Live
controller dostává map-sync scheduler z `AirRadarApp`; MapLibre nevlastní.
Tyto hranice nesmějí vytvořit druhou mapu, aircraft stream ani serverového
vlastníka live state.
Kompletní seznam vlastnictví a cleanup kontrakt je v
[Runtime invariantech](RUNTIME-INVARIANTS.md#maplibre-namespaces-and-cleanup).

Letištní infrastruktura je offline maintenance cesta. Identita zdroje
OurAirports (`ourAirportsId` a `ourAirportsIdent`) se drží odděleně od
kanonického AirRadar `Airport.icao`. Dráhy a komunikační frekvence se
propojují přes zdrojové `ident` a ukládají se pouze pro vybraná lokální
letiště; celosvětová navaid si zachovávají volitelnou asociaci přes stejný
source key. Stránka letiště načítá core metadata a tři omezené kolekce
infrastruktury server-side; prohlížeč nikdy nestahuje upstream CSV soubory.

Predictive prospective validation zůstává samostatnou volitelnou persistence
větví downstream od shadow `PredictiveStateStore`. Predictive Graduation
Readiness nad ní přidává pouze read-only hranici nad immutable
`PredictiveObservation` a persistovaným LANDING terminal evidence. Runtime
collector používá 30denní okno, limity 15 000 predictive observations a 2 500
landing events, pětiminutovou cache a nikdy nečte `FlightPosition`.

Čistý evaluator `predictive-readiness-v1` vrací pro každou capability
PASS/WAIT/FAIL. Neúplný bounded výsledek je vždy WAIT. Aircraft prediction API
readiness vůbec nečte, dokud všechny capability zůstávají SHADOW. Pokud
operátor explicitně nastaví některou capability na PUBLIC, API readiness gate
ověří; bez PASS ji efektivně stáhne zpět do SHADOW. Readiness smí public
graduation zablokovat, ale nikdy capability automaticky nepovyšuje.

Predictive ETA Advisory V1 je prezentační hranice nad existujícím aircraft
prediction API. Veřejná ETA vyžaduje efektivní ETA=PUBLIC, readiness PASS,
čerstvou neexpirovanou ETA a kalibrovanou p90 ETA chybu z readiness reportu;
právě p90 se používá jako zobrazené pásmo nejistoty. Platná admin session může
dostat SHADOW preview s readiness a stale/expired stavem. Anonymní odpověď tento
preview nikdy neobsahuje. Detail letadla provádí jeden request při mountu a
nepřidává EventSource, polling loop, model, persistence lane ani write path.

Predictive Runway Advisory V1 sdílí stejný request i prezentační boundary.
Veřejná dráha vyžaduje efektivní RUNWAY=PUBLIC, readiness PASS, čerstvou
predikci, nenulovou dráhu a známou confidence. Platná admin session může dostat
samostatný SHADOW runway preview s readiness evidence. Browser již zobrazenou
dráhu po stejné 45sekundové freshness hranici skryje. Nepřidává se druhý fetch,
EventSource, persistence lane, migrace ani model.

Predictive Runway Change Advisory V1 je samostatná graduation capability nad
stejným prediction stavem v RAM. Engine ukládá skutečnou předchozí predikovanou
dráhu jako `changedFrom` a čas `changedAt`; `alternative` dál znamená pouze
druhého aktuálního kandidáta. Skutečný přechod se drží v RAM maximálně pět
minut, aby byl advisory pozorovatelný bez změny prospective-validation write
semantiky. Veřejná serializace navíc vyžaduje fresh prediction snapshot do 45 s,
RUNWAY_CHANGE=PUBLIC, readiness PASS, neexpirovanou provenance změny a
MEDIUM/HIGH confidence. Ověřený admin může dostat SHADOW/WAIT/FAIL diagnostiku.
Nevzniká nový DB field, migrace, stream ani další aircraft-detail request.

Predictive Trajectory Advisory V1 znovu používá stejný trajectory stav v RAM a
readiness boundary. Veřejná serializace vyžaduje TRAJECTORY=PUBLIC, readiness
PASS, snapshot do 45 sekund, stav odlišný od UNKNOWN a MEDIUM/HIGH confidence.
Prospective lane ukládá `trajectoryState` do omezeného `evidenceJson` pouze
při změně state/confidence, takže readiness rozpozná instrumentované řádky bez
změny DB schématu. Predictive Outcome Truth V1 dodává oddělený verzovaný zdroj
validace outcome; graduation capability dál závisí na readiness thresholdech a
nikdy nevznikne jen díky existenci outcome dat.

Predictive Outcome Truth V1 je záměrně mimo prediction graph. Čte omezené
persistované Flight Intelligence eventy po jednotlivých typech, páruje je pouze
podle prospective lifecycle/ICAO/flight identity a časových oken a předává
scoreable RUNWAY_CHANGE/TRAJECTORY evidence readiness evaluatoru. Nečte
FlightPosition a nepřidává write path, DB migraci, SSE lane ani vstup do
predictive enginu. Každý event-type dotaz má limit 2 500 řádků; dosažení
kteréhokoli limitu označí collection jako incomplete a gate zůstane fail-closed.

Predictive Graduation Calibration V1 leží až za runtime readiness evaluací a
záměrně není součástí prediction ani graduation decision graphu. Server předá
stejný bounded evidence objekt, stejné PASS/WAIT/FAIL vyhodnocení a bit úplnosti
collection do čisté funkce `buildPredictiveGraduationCalibration()`. Výstup
pouze odvozuje fázi, přesné evidence deficity, truth požadavky, threshold
marginy a manual-review eligibility. Nemůže měnit policy ani převést WAIT/FAIL
na PASS.

Predictive Operations Center V1 je omezený read-only agregační boundary nad
radarovým panelem NOW. Browser odvodí maximálně šest ICAO kandidátů z existující
prioritizované timeline a živých highlightů a pouze při otevřeném panelu volá
`/api/operations/predictive`. Server čte existující predictive stav v RAM a
před serializací ETA/runway/runway-change/trajectory advisories vyhodnotí jeden společný readiness
report. Anonymní výstup obsahuje pouze PUBLIC + PASS + fresh hodnoty; ověřený
admin může navíc dostat SHADOW preview a rozhodnutí ETA/RUNWAY/RUNWAY_CHANGE/TRAJECTORY readiness.
Endpoint se obnovuje omezeně po 30 sekundách a je záměrně oddělený od hlavního
radar SSE, prediction enginu, persistence i prospective-validation write path.

Airport Intelligence V3 přidává jeden page-scoped klientský controller pro
24hodinový operations snapshot a počasí letiště. Operations Board, sjednocená
časová osa pohybů, runway comparison i detailní weather panel znovu používají
tato dvě čtení. Původní duplicitní 24h movement request a duplicitní weather
request se na stránce nespouštějí. Airport Live Board V5 přesouvá existující live provoz okolních letadel do
jediného page-scoped read-only SSE controlleru. Live Board i Nearby Aircraft
znovu používají stejnou `/api/stream` subscription, takže letištní stránka má
stále právě jeden aircraft stream a žádný nový write lane.

Airport Live Board V5 zůstává uvnitř stejného boundary. Controller obnovuje
obě sdílená čtení jedním 30sekundovým one-shot timerem, který při unmountu nebo
ručním refreshi zruší a abortuje in-flight práci. UI v paměti odvozuje omezené lane recent příletů, recent odletů, provozních
událostí a využití drah z operations odpovědi a pro kompaktní weather strip
znovu používá stejný METAR. Sdílený SSE snapshot navíc krmí nearest-first NOW inbound/outbound lane přes
existující konzervativní airport-traffic classifier. V3 pak tato aktivní
pozorování koreluje v paměti s už načteným omezeným operations snapshotem.
Match je ICAO-first, callsign-safe, směrově kompatibilní a omezený na 20minutové
okno eventu s dvouminutovou tolerancí budoucího clock skew. Úspěšný match
zpřístupní existující Flight ID/Flight Story a metadata movement/runway/
confidence; nejistý match zůstane pouze live. V4 nad tímto matchem přidává čistě in-memory journey composer: korelovaný movement a live geometrie určují journey stage, zatímco route origin/destination přidává pouze samostatný consistency flag. LANDED vznikne jen z čerstvého korelovaného LANDING, když live letadlo stále hlásí on-ground; obecný ground traffic je z airborne lane vyloučen. V5 skládá omezený flow summary a attention projekci z už odvozených aktivních journey pouze v paměti; LANDED zůstává normálním journey stavem a do exception seznamu se nepovyšuje. V6 nad tímto sdíleným flow a `operations.recentMovements` přidává další čistou projekci: dvě navazující 15minutová okna příletů/odletů, omezené počty výjimek, deterministický pressure level a 30minutovou konzistenci dráhy. V7 nad stejným omezeným seznamem pohybů přidává další runway projekci: nejnovější runway-bearing movement pro každý Flight, aktuální a předchozí dominantní dráhu, zvláštní příletovou/odletovou evidenci, provenienci reported/inferred vzorků, konzervativní klasifikaci stability/přechodu a volitelné porovnání s už odvozenou dráhou zvýhodněnou větrem. Tato runway projekce nevytváří další I/O. V7 Arrival Sequence přidává jedno omezené predictive batch čtení pro nejvýše šest approaching ICAO na existujícím 30s airport refresh tokenu, bez druhého timeru nebo EventSource. V8 Arrival Flow a Approach Queue jsou následně čisté in-memory projekce nad tímto omezeným pořadím a už odvozenou flow/runway evidencí; nepřidávají čtvrtý request, migraci, tabulku ani write path.

### Aviation Weather

`AviationWeatherProvider` je volitelný nezávislý server-side subsystém. Čte
pouze oficiální endpointy Aviation Weather Center pro METAR, TAF a SIGMET.
Provider má vlastní omezenou hot cache v procesu plus volitelný verzovaný
last-known-good soubor
`/var/lib/airradar/weather/weather-cache-v1.json`. Soubor se při načtení
validuje a omezuje velikostí/počtem záznamů, zapisuje jej jeden lazy atomický
checkpoint 30 minut po první změně (nebo při graceful shutdown) a je best-effort:
poškození nebo disk failure nesmí zastavit
providera ani aplikaci. Cache má také request timeout, negativní záznamy,
slučování in-flight požadavků, stale-if-error policy a rate-limit backoff.
Persistované METAR záznamy se ve výchozím stavu drží nejvýše 2 hodiny; TAF a
SIGMET nejvýše 24 hodin. SIGMET features se při každé odpovědi filtrují podle
vlastních `validFrom`/`validTo` nezávisle na stáří datové sady. Počasí není
součástí `AircraftStateService`, readsb pollingu, aircraft serializace, SSE,
historie, statistik ani PostgreSQL persistence.

Weather API přijímá pouze kanonické airport ICAO kódy. Prohlížeč vykresluje
normalizovaná METAR/TAF data v detailu letiště a letu, zatímco volitelný SIGMET
GeoJSON se on-demand načítá do MapLibre source `aviation-sigmet`. SIGMET
vrstva je zpočátku vypnutá a její DOM popupy používají pouze bezpečné textové
vlastnosti. Weather diagnostika je read-only a je zahrnuta v `/system` bez
sondování upstream providera.

Systémová diagnostika zachovává legacy čtyřstavové `status` pro API konzumenty
a navíc zveřejňuje omezený `operationalState`: `on_demand`, `loading`,
`ok`, `degraded`, `offline` nebo `disabled`. Radar, vítr, počasí a ADSBDB
používají pevné hodnoty `reasonCode` pro nezdravé stavy. Cold-start lazy
provideři se proto nehlásí jako offline/disabled a zotavení provideři
nezůstávají degraded kvůli celoživotním čítačům selhání.

`/api/system/status` zveřejňuje sanitizované metriky process
RSS/heap/external/ArrayBuffer, kernel RSS rozdělení, aktivní počet a limit SSE,
počty metadata cache, bajtově omezenou tar1090 fallback cache a cgroup memory
hodnoty pro aktuální process cgroup, pokud je hostitel poskytuje.
`/api/system/stream` publikuje stejnou projekci diagnostiky přes sdílený
slučovaný SSE refresh každých pět sekund, takže stránka `/system` odráží
runtime změny bez ručního reloadu.

Recap stránky jsou page-scoped čtení. Slučují existující denní agregace
přijímače s database-side agregacemi `Flight` a omezenými first/latest
celoživotními lookupy pro každé letadlo; denní recap navíc čte omezené řádky
`Flight.startTime`/`airline`, database-side agregace `FlightEvent` a
omezenou sadu posledních událostí pro deterministické Daily Intelligence.
Nikdy nečte `FlightPosition`, nespouští poller ani neotevírá SSE spojení.
Daily Intelligence omezuje page-scoped čtení a označí sadu highlightů jako
neúplnou, pokud je dosažen limit. Recap indexy jsou aditivní a zůstávají
pending, dokud je neaplikuje explicitně autorizované nasazení.

## Životní cyklus procesu

Produkční systemd spouští přímo `scripts/start-production.mjs`. Wrapper čeká
na production build lock, ověří `.next/BUILD_ID`, zaregistruje AirRadar
shutdown coordinator, vypne konkurenční signal handler Nextu a potom spustí
Next. Shutdown zastaví state service a vypustí historii před uzavřením
statistik, providera a PostgreSQL v omezeném deadline coordinatoru. Release
postup je definován pouze v [RELEASE.md](RELEASE.md).

## Time Machine

`/time-machine` je samostatný read-only historický kontext. Historický
repository v `lib/server/time-machine.ts` čte omezená okna z
`FlightPosition`, připojuje metadata `Flight`/`Aircraft` a markery
`FlightEvent` a vystavuje bezpečná DTO. Prohlížeč rekonstruuje aircraft state
přes `lib/time-machine/playback.ts` a používá namespaced MapLibre sources
`time-machine-aircraft` a `time-machine-selected-trail`; nikdy nepoužívá
live state service, SSE ani live trail store.

Flight Intelligence načte importovaný PostgreSQL katalog letišť jednou do
omezeného runtime indexu; při každém aircraft pollu neskenuje sample/world
seznam. Track memory je omezená na 120 vzorků a pětiminutové holding okno a
stale aircraft tracky se odstraňují spolu s cleanupem live state. Persistence
událostí ukládá Flight, jehož persistovaný časový rozsah pokrývá čas pozorování
události, pokud je dostupný; database failures zůstávají best-effort.

Source awareness je centralizováno v
`lib/aircraft/source-awareness.ts`. `LOCAL` a `NETWORK` jsou členství
provenience, nikoli dominantní pole `origin`: overlap je
`seenLocal=true` a `seenNetwork=true`. Stejný helper řídí klasifikaci,
countery a client-side filtry. Live LOCAL capture ratio používá
`RECEIVER_COMPARISON_RADIUS_NM` (výchozí 175 NM) a neukládá se.

Prezentační vrstva provozu je záměrně oddělená od backendových modelů:

```text
AircraftView ─┐
              ├─> lib/radar/traffic-presentation.ts → sdílená vizuální sémantika
OgnTargetView ┘
```

Adaptery sdílejí rodiny ikon, source badge, význam labelů, stale stav,
accessibility texty a hero hlavičku draweru. Oba backendové kontrakty zůstávají
oddělené; OGN privacy/public serializace ani ADS-B provenance hranice se
prezentační vrstvou neobcházejí.

## Integrita navigace

Integrita navigace je omezená read-only odvozená větev napájená existujícími
lokálními a síťovými ADS-B snapshoty. Zachovává provenienci jednotlivých polí,
používá deterministické buňky 0,2° a výšková pásma a odděluje regionální stav
anomálie od health přijímače/databáze. V1 kontrakt, retence, omezení a API jsou
v [NAVIGATION-INTEGRITY.md](NAVIGATION-INTEGRITY.md).


## Operational Digital Twin V1

Digital Twin je on-demand composition layer, nikoli další vlastník live stavu.
`/api/aircraft/:hex/situation` čte už běžící RAM stav letadla a vytváří
omezený 30minutový corridor. Route Intelligence V2 dodává
publikovanou/interpretovanou geometrii, pokud je použitelná; jinak je projekce
kinematická. Stejný corridor se vyhodnocuje proti existujícímu připravenému
ATC/ATS datasetu, plan-only AUP/UUP cache, bounded SIGMET provideru a
readiness-gated PUBLIC predictive advisories.

Vrstva nemá persistence, background poller, EventSource, FlightPosition scan
ani placený enrichment call. Výpadek provideru odstraní pouze danou třídu
kontextu a nesmí ovlivnit readsb → RAM → SSE.


## Track Fusion Shadow V1

Track Fusion Shadow je připojen až za existující LOCAL/NETWORK snapshoty po
jejich source-specific normalizaci, plausibility, continuity a retention
kontrolách. Engine vidí retained mapy, ale žádnou z nich nevlastní.

```text
LOCAL provider ──→ local map ──┐
                               ├─→ current canonical merge ─→ radar/SSE/history boundaries
NETWORK provider → network map ┘
                 │             │
                 └─────────────┴─→ Track Fusion Shadow
                                      ├─ per-field quality selection
                                      ├─ overlap residuals
                                      ├─ handover validation
                                      ├─ <=6 s estimated gap
                                      └─ pouze diagnostics
```

Shadow output se nevrací do `localAircraft`, `networkAircraft`,
`mergeAircraftMaps`, history persistence, receiver statistik, Navigation
Integrity, alerts ani predictive input. Tato jednosměrná hranice je ve V1
povinná.


## Track Fusion Readiness / Graduation V1

Shadow estimator nově napájí omezený process-local readiness monitor. Monitor
čte pouze kumulativní shadow diagnostiku, převádí ji na pětiminutové delta
buckety a drží nejvýše 24 hodin v RAM. Nemá vlastní timer ani databázové I/O.
Restart procesu resetuje evidence a readiness se vrátí na WAIT.

Operational Digital Twin je první připravený consumer. Fused state smí číst jen
při explicitně zapnutém Digital Twin fusion flagu, readiness PASS a GOOD
observed fused position konkrétního letadla. Veřejný radar, canonical Aircraft,
history, receiver statistics i FlightPosition zůstávají beze změny.


## Track Fusion Outcome Validation V1

Outcome Validation je shadow consumer čerstvě přepočítaných Track Fusion
tracků. Ve stejném čase zachytí existující canonical merge i fused stav,
naplánuje omezené prospektivní sample +5/+15/+30 s a později obě větve
vyhodnotí proti čerstvé LOCAL receiver observation.

Nevlastní ingest, scheduling, persistence ani druhý fusion pass. Pending samples
i pětiminutové aggregate buckety jsou pouze v RAM a bounded. Validator nemůže
měnit source affinity, canonical Aircraft state, radar SSE, receiver history ani
Track Fusion selection.

## Operational Digital Twin Outcome Validation V1

On-demand Digital Twin response nově napájí samostatný jednosměrný
prospektivní validator. Úspěšný situation výpočet přidá pouze tři omezené cíle
(+5/+15/+30 minut). Následující refresh LOCAL provideru tyto cíle vyhodnotí
proti receiver truth, která už je v local aircraft mapě.

Validator je pouze v RAM, nemá vlastní timer ani databázovou cestu a Digital
Twin znovu nepřepočítává. Jeho výstup je pouze diagnostický a nemůže ovlivnit
canonical aircraft state, Track Fusion selection, radar/SSE, historii,
Navigation Integrity, predictive inputs ani alerts.

## Operational Digital Twin × Navigation Integrity Corridor V1

Integrace je jednosměrné čtení z existujícího process-local Navigation
Integrity service do on-demand Operational Digital Twin assembleru. Digital
Twin nevolá veřejné Navigation Integrity API a nespouští detector evaluation,
persistence ani databázové čtení.

`NavigationIntegrityService.getCurrent("15m")`
→ aktivní regionální anomaly regions
→ sampled body Digital Twin corridoru
→ přesná shoda grid cell + altitude band
→ odvozený budoucí průnik s regionální evidencí
→ existující situation response a Digital Twin map source.

Výsledek je pouze popisná evidence a nemůže měnit Navigation Integrity
klasifikaci, canonical aircraft state, Track Fusion, predikce, historii ani
alerts.
