# Runtime invarianty

Toto jsou kontrakty chování a bezpečnosti pro změny aktuálního systému.

## Sémantika systémové diagnostiky

- `DISABLED` znamená pouze explicitní vypnutí konfigurací; prázdná cache ani
  provider, který dosud nebyl vyžádán, není vypnutý.
- Lazy volitelní provideři vystavují `operationalState` jako `on_demand`
  před prvním požadavkem a `loading` během prvního probíhajícího požadavku.
- `OFFLINE` znamená, že skutečný pokus o upstream selhal a neexistuje žádná
  použitelná datová sada. `DEGRADED` znamená, že jsou stále použitelná
  zastaralá, částečná nebo fallback data a nesou omezený `reasonCode` /
  bezpečný důvod.
- Diagnostika radaru a větru rozlišuje celoživotní selhání od po sobě jdoucích
  selhání; úspěšné obnovení vynuluje po sobě jdoucí selhání a při čerstvé
  datové sadě obnoví stav `ok`.
- Čtení `/api/system/status` nebo `/api/system/stream` je read-only a nesmí
  zahřívat volitelné cache ani spouštět požadavky na počasí, radar, vítr nebo
  enrichment.

## Time Machine

- Time Machine je read-only a nikdy neřídí `AircraftStateService`.
- Historické přehrávání nikdy nespouští intelligence detekci, vyhodnocování
  alertů ani odesílání notifikací.
- Historická API okna i vracené řádky jsou omezené; přehrávání v prohlížeči
  drží omezený stav okna a používá UTC okamžiky.
- Selhání historické databáze je fail-soft vůči živému radaru, SSE a ingestu.

## Sémantika identity a letu

- ICAO hex je identita letadla. Normalizujte jej před lookupem živé mapy,
  persistencí historie, alerty a veřejnými odkazy. Šestimístný non-ICAO
  identifikátor readsb s prefixem `~` zůstává platným stabilním
  identifikátorem tam, kde jej existující routa přijímá.
- Callsign je pozorování a může se změnit. `Flight` je instance letu, nikoli
  callsign.
- Pokud jsou přítomna stará i nová pozorování callsignu a liší se, uzavřete
  starý otevřený let v aktuálním `recordedAt` a otevřete novou instanci.
- Při přerušení kontinuity uzavřete starý let v jeho původním `lastSeenAt`;
  neposouvejte tento čas dopředu na okamžik cleanupu. Novou instanci otevřete
  v aktuálním `recordedAt`.
- Detail/historie letadla nesmí připojit pomalou odpověď enrichmentu k novějšímu
  pozorování stejného hexu.

## Hodnoty pozorování

- Odvozená výška a vertikální rychlost preferují barometrické hodnoty a
  fallbackují na geometrické. V normalizovaném tvaru letadla zachovávejte
  surové barometrické i geometrické hodnoty.
- Neplatné souřadnice jsou nullable. `(0, 0)` nejsou použitelná data
  pokrytí přijímače/letadla. Interní výpočty vzdálenosti a bearingu používají
  přesné souřadnice přijímače; veřejná DTO používají nakonfigurovaný bezpečný
  režim polohy.
- Čára trasy je schematická vizualizace mezi rozlišenými body letišť a
  aktuální polohou, nikoli důkaz podaného flight planu. Pozorovaná ADS-B stopa
  zůstává samostatným overlayem.

## Jeden vlastník stavu

- `getAircraftStateService()` vrací jednu `globalThis` službu na Node proces.
  Její lokální a volitelné síťové polling smyčky sdílejí tohoto jediného
  vlastníka stavu; lokální smyčka vlastní cleanup zastaralých lokálních
  záznamů, stopy, pozorování statistik, přechody alertů, ATC požadavky a
  vzorkování historie.
- Polling nesmí být duplikován druhou API routou, browser timerem, workerem ani
  externí integrací. Volitelný enrichment je asynchronní a jeho chyby jsou
  izolované.
- Selhání PostgreSQL, katalogu, počasí, fotografií a notifieru musí degradovat
  příslušnou funkci bez zastavení živého refreshe readsb.
- Aviation Weather je nezávislé na live state: nesmí přidávat práci do readsb
  polleru, měnit `/api/stream`, zařazovat zápisy historie/statistik ani
  persistovat svou RAM cache. Do jeho airport endpointů se smějí dostat pouze
  kanonické čtyřpísmenné ICAO kódy; IATA se nikdy nesmí odhadnout do weather
  requestu.
- Cache International SIGMET a AirSIGMET jsou nezávislé. Neúspěšný refresh
  může použít stale-if-error snapshot dané datové sady, ale odpověď znovu
  kontroluje platnost advisory, takže expirované nebo budoucí záznamy se nikdy
  neoživí. Dva odlišné AWC product namespaces se nededuplikují podle textu ani
  geometrie.

## SSE

- `/api/stream` jsou Server-Sent Events s pojmenovanými událostmi `snapshot`.
  Nejde o WebSocket endpoint a musí zachovat hlavičky
  `Content-Type: text/event-stream`, zákaz cache/transformace, keep-alive a
  `X-Accel-Buffering: no`.
- Každý klient má jedno subscription, 15sekundový keep-alive heartbeat a
  cleanup při abort/cancel. Pomalý klient drží jen svůj nejnovější čekající
  snapshot; nikdy nesmí vytvářet neomezenou frontu.
- Odpojený listener je odebrán bez vlivu na ostatní listenery nebo provider
  loop. Na tuto dlouho žijící routu neaplikujte request rate limiting.
- Počet aktivních SSE klientů je omezen na Node proces; odmítnutí kvůli
  kapacitě je bezpečné omezené `503` s `Retry-After` a každé přijaté spojení
  uvolní svůj slot při abort/cancel/close.
- Živé SSE DTO vynechává úplná metadata a enrichment flight planu. Detail
  vybraného letadla tato data načítá lazy; kontext trasy potřebný pro mapu
  zůstává v live DTO dostupný.
- Veřejná serializace musí odstranit surové chyby providerů a nesmí zveřejnit
  přesné souřadnice přijímače, pokud není záměrně nastaveno
  `PUBLIC_RECEIVER_POSITION_MODE=exact`.

## Historie

- Live state patří do RAM; PostgreSQL ukládá vzorkované pozice a trvalá
  referenční data, nikoli každou ADS-B aktualizaci.
- Serverové živé stopy se drží v RAM po celou dobu, kdy letadlo zůstává v live
  state, a odstraní se při cleanupu zastaralého letadla; nejsou omezené časovým
  oknem ani počtem bodů. Browser SSE cache stop jsou omezené nezávisle, aby
  dlouho otevřené záložky nemohly hromadit neomezená pole pro každé letadlo.
  Fronta historie je slučovaná a její writer je jednoproudový. Zápisy pro
  jednotlivá letadla mají omezenou concurrency; selhání jednoho letadla
  neodmítne ostatní vzorky ani neoznačí přijímač jako offline.
- `FlightPosition` se vzorkuje pouze pro platné pozice a při vracení je
  omezeno API. Retenční cleanup je periodický a nedestruktivní vůči aplikačnímu
  schématu.
- Výpadek historie/databáze musí ponechat živý radar dostupný. History endpoint
  pro konkrétní hex může jako fallback použít aktuální stopu v paměti.

## Statistiky a pokrytí

- Denní hranice používají `APP_TIMEZONE`, nikoli omylem UTC. RAM agregace se
  překlápí na hranici lokálního dne a startup sloučí uložený aktuální den bez
  nahrazení živých pozorování.
- Pokrytí má přesně 36 pevných bucketů po 10 stupních. Každý bucket ukládá
  maximální platnou vzdálenost přijímač–letadlo; nulové/neobsazené buckety
  nesnižují průměr obsazených bucketů.
- Persistence statistik je throttled, zapisuje pouze změněné řádky, je
  best-effort a flushuje při řádném shutdownu. Aktuální počet živých letadel a
  messages/second zůstávají procesní/live hodnoty.

## Rozšířené síťové pokrytí

- ADSBHub je obecný agregovaný síťový zdroj SBS/30003 s
  `origin: "adsbhub"`; nikdy se neoznačuje jako MLAT ani local. Zapnuté větve
  ADSBHub, ADSB.lol raw a ADSB.lol HTTP běží souběžně a deduplikují se podle
  ICAO se zachováním provenience zdroje. Krátké platné SBS HexIdent hodnoty se
  normalizují převodem na uppercase a doplněním nul zleva na šest hex znaků.
- Čerstvost network SBS používá čas přijetí a pole MSG se slučují po polích,
  takže řádek pouze s callsignem nemůže vymazat pozici a řádek s pozicí nemůže
  vymazat callsign. Omezená globální mapa tracků publikuje pouze čerstvé pozice
  uvnitř nakonfigurovaného radiusu.
- ADSB.lol raw output je volitelný, pouze outbound a vždy má
  `origin: "adsblol"`. Nikdy se neposílá na `192.168.1.50` ani žádný feeder.
  Veřejné API je další omezený zdroj síťových pozorování; duplicitní letadla se
  slučují podle ICAO a network-only pozorování zůstávají pouze v RAM.
- Provider má jeden in-flight request, omezený timeout/retry/backoff, validaci
  odpovědí, omezený stav letadel/stop, stale-if-error chování a bezpečnou
  diagnostiku. U HTTP 429 se respektuje `Retry-After`.
- Lokální a síťová pozorování jsou držena v oddělených mapách. Výchozí live
  coverage je local; extended coverage explicitně slučuje podle normalizované
  ICAO identity a nikdy nemutuje lokální mapu ani lokální health stav. Extended
  je skutečná množina sjednocení pozorování: každé lokální ID letadla je v
  extended přítomno, včetně pozorování bez čerstvé použitelné pozice.
- Merge arbitration je explicitní: kandidát pozice musí mít platné `lat` a
  `lon` plus čerstvé `seen_pos`. State service přiřadí každému ICAO source
  affinity (`local` nebo `network`). Dočasné zmizení z preferovaného feedu
  drží poslední dobré pozorování po omezené stale/affinity grace okno a současně
  běží časovač výpadku. Pokud existuje živá alternativní pozice, affinity se po
  grace period přepne přímo bez mezilehlého snapshotu bez pozice. Alternativní
  pozice se může použít i okamžitě, pokud preferované pozorování chybí nebo
  neumí dodat použitelnou polohu. Pokud zmizí obě pozorování, affinity se
  uvolní. V rámci zvoleného originu se preferuje čerstvá pozice a pokud je
  použitelná, zachová se poslední známá lokální pozice. Letadlo bez pozice
  zůstává zachováno s nullable souřadnicemi. Lokální popisná pole a lokální
  RSSI/message čítače přijímače zůstávají autoritativní pro letadlo s local
  affinity. Network-only letadla mají lokální měření null.
- Continuity Guard V2 považuje velký propad počtu v jinak úspěšném snapshotu
  providera za podezřelý, pokud předchozí baseline dosahuje alespoň
  `AIRCRAFT_MASS_DROP_MIN_BASELINE` a je dosažen nakonfigurovaný poměr
  propadu. První podezřelý snapshot může posunout stav source affinity, ale
  destruktivní stale pruning odloží přesně o jeden potvrzovací cyklus. Druhý
  podobně nízký snapshot propad potvrdí a běžný pruning pokračuje; zotavený
  snapshot pending guard zruší. Chyba providera se nikdy nepřeklasifikuje na
  úspěšný snapshot.
- Diagnostika kontinuity obsahuje pouze omezené process-local čítače:
  omission/recovery události, stale expirace, rychlé návraty, source failovery,
  mass-drop kandidáty/odklady/potvrzení/zotavení, počet retencovaných a právě
  pozorovaných letadel a pending affinity stav. Po restartu procesu se resetuje
  a nezapisuje se do PostgreSQL historie.
- Network-only pozorování jsou vyloučena z historie PostgreSQL, denních
  statistik/pokrytí, alertů, enrichmentu metadat a ATC rozlišení. Veřejný výstup
  obsahuje bezpečný source/provenience údaj a ADSB.lol ODbL atribuci, ale ve
  výchozím stavu žádné surové chyby providerů ani přesné souřadnice přijímače.
- Source countery se odvozují z jednoho sloučeného snapshotu:
  `LOCAL = localOnly + overlap`, `NETWORK = networkOnly + overlap` a
  `TOTAL = localOnly + networkOnly + overlap`. Filtrování zdrojů používá
  provenienci a nikdy nenahrazuje membership hodnotou `origin`. LOCAL capture
  ratio je omezeno na `RECEIVER_COMPARISON_RADIUS_NM`, počítá se z raw
  síťových pozorování spárovaných s raw lokálními pozorováními a nepersistuje se.

## Integrace OGN / FLARM

- `OgnProvider` a `OgnStateService` jsou volitelné serverové singletony
  oddělené od `AircraftStateService`. `OGN_ENABLED=false` je výchozí stav;
  vypnutý režim nevytváří TCP, DDB refresh, cleanup ani OGN SSE práci.
- OGN identita je `addressType + address`; callsign je metadata pozorování.
  Novější pozorování nahrazuje kanonický target, stejný timestamp může přidat
  provenienci přijímače a starší paket nikdy nevrací pozici ani identitu zpět.
- APRS-IS je receive-only s CRLF loginem, server-side radius filtrem a
  periodickým comment-only `#keepalive`; neposílá se žádná telemetrie letadel.
  Omezený line reader nepřijme žádný řádek delší než 512 bajtů včetně zakončení.
  `OGADSB` lokální classifier zahodí, i když jej serverový filtr doručí;
  neznámé a nepodporované TOCALL jsou fail-closed.
- OGN targety jsou pouze v RAM a nesmějí se dostat do Prisma,
  `AircraftStateService`, ADS-B historie/statistik/příjmových rekordů, alertů,
  enrichmentu, ATC ani health přijímače. Mapa používá vyhrazené DOM markery a
  UI má samostatný seznam/detail výběru OGN.
- Runtime rozlišení OGN DDB je cílené a omezené: startup neprovádí žádný
  full-table request, ID se deduplikují a dávkují a smí běžet jen jeden request.
  Platná cílená prázdná odpověď je `MISSING`; network, HTTP, `429` a schema
  selhání zůstávají `UNRESOLVED` a nikdy se nepřevádějí na miss. Privacy-valid
  cache záznamy pro jednotlivá zařízení zůstávají použitelné do svého
  maximálního stale stáří nezávisle na ostatních unresolved zařízeních. Paket
  no-tracking a DDB `tracked=N` se zahazují; DDB miss, `identified=N` a
  packet stealth jsou anonymní. Veřejný serializer nikdy neposílá anonymní
  adresu, sender, registraci, competition number, model, receiver signal ani
  receiver history.
- Sémantika APRS course/speed `CCC/SSS` je stupně/uzly. `SSS` se kopíruje
  do `groundSpeedKt` bez převodu z km/h nebo specifického převodu podle
  TOCALL. Cílený DDB request používá oficiální
  `?j=1&t=1&device_id=...` a může pro stejnou dávku ID fallbacknout na
  oficiální `?j=1`; fallback nesmí obejít validaci `device_type`,
  `device_id`, `tracked` ani `identified`. Selhání DDB zachovají pozitivní
  rozlišení zařízení jen v nakonfigurovaném stale limitu a diagnostika
  zveřejňuje strategii, queue/cache countery, attempt/status, fallback,
  backoff a enrichment stav.
- Volitelný SoftRF SQLite snapshot je read-only emergency whitelist pod live
  OGN DDB a oficiální persistentní cache. Aktivuje se pouze tehdy, když jsou
  tyto zdroje unresolved, validuje schéma `devices`, počet řádků, stáří
  sidecar `generatedAt`, vazbu databáze přes SHA-256, identitu a typy privacy
  flags a indexuje pouze řádky `track=1` plus `ident=1`. Neposkytuje žádná
  metadata a nikdy se nedotazuje pro každý APRS paket. Neplatné nebo expirované
  snapshoty i chybějící ID zůstávají unresolved, a tedy skryté; neplatná
  náhrada nemůže zrušit aktivní platnou.
- Volitelná persistentní DDB cache ukládá pouze validovaná rozlišení
  `FOUND`/`MISSING` ve version 1 JSON. Načítání je fail-safe a omezené;
  malformed záznamy a duplicitní klíče se odmítají, zatímco strukturální/file
  chyby nenačtou nic bez zastavení AirRadaru. `resolvedAt` se při startupu
  nikdy neresetuje, takže persistence nemůže prodloužit pozitivní max-stale ani
  negativní TTL privacy okna. Zápisy jsou debounced, single-writer, atomické,
  s režimem `0600` a best-effort; shutdown provede jeden omezený finální
  flush. Soubor nikdy neobsahuje pakety, pozice, souřadnice ani historii
  přijímače.
- OGN targety jsou stale po 15 sekundách, odstraněny po 60 sekundách a omezeny
  na 5 000. `/api/ogn/stream` má vlastní initial snapshot, heartbeat, abort
  cleanup, SSE capacity slot a newest-only pending update.

## ATC

- ATC assignment je pravděpodobný kandidát založený na poloze letadla,
  porovnatelné výšce a času pozorování. Nikdy netvrdí skutečně naladěnou
  frekvenci letadla.
- Shody bodu na hranici jsou explicitní. AGL limity nelze porovnat s MSL
  výškou letadla bez terénních dat, takže altitude confidence přejde na
  `unknown`; nesmí se tiše prezentovat jako odpovídající výška.
- Importované řádky zachovávají zdroj, referenci, platnost, reference výšek a
  metadata posledního ověření. Pokud český eAIP sync neumí poskytnout
  autoritativní polohy vysílačů, žádné se nevymýšlejí.
- Sample ATC je automatické pouze bez nakonfigurovaného skutečného přijímače.
  Skutečný přijímač se musí explicitně přihlásit přes
  `ATC_SAMPLE_ENABLED=true`; produkční výchozí stav jsou importovaná data
  PostgreSQL nebo prázdná vrstva.
- Řádky českého eAIP bez trvalého autoritativního ID jsou ve výchozím stavu
  blokující. Pouze explicitně auditované source-limited řádky mohou být
  klasifikovány jako `source_limitation`; zůstávají blokující, pokud je
  historie neznámá nebo byl stejný objekt dříve importován. Anotační hodnoty
  jsou provenience, nikoli ID.
- Rekonstrukce českých hranic používá ČÚZK Data50 pro státní hranice a BKG VG25
  pro mezinárodní hranici Německo–Polsko. Endpoint snapping je produkčně
  bezpečný pouze do 0,5 km včetně; unresolved, ambiguous, disconnected nebo
  invalid geometrie selže před import transaction. Žádný odhad přímou čarou
  není povolen.

## Global Map Time

- Global Map Time nikdy nevlastní live aircraft state.
- Time Machine je master clock v historickém režimu; neexistuje druhý playback
  timer.
- Historický kontext nikdy tiše nenahrazuje aktuální data.
- Rozlišení radaru používá pozorovaný snímek `<= T`; rozlišení METAR nikdy
  nepoužije pozorování `> T`.
- Vítr zachovává model run a valid time a pro as-known playback odmítá budoucí
  běhy modelu.
- AUP/UUP zachovává plánovanou a revizní provenienci; planned data se nikdy
  nevydávají za actual.
- Selhání vrstvy kontextu nikdy nezastaví historické přehrávání letadel.
- Historické archivy jsou omezené a writery nikdy neblokují
  `AircraftStateService`.
- Historické přehrávání je read-only a nikdy nevytváří FlightEvents ani alerty.

## Flight Story

- Flight Story je read-only konzument persistovaných dat Flight,
  FlightPosition a FlightEvent; nikdy znovu nespouští Flight Intelligence ani
  nevytváří alerty.
- Mapa, časová osa, profil, výběr události a historický kontext používají jeden
  playback timestamp a znovu používají Global Map Time / Map Context V2.
- Payloady pozic jsou omezené při zachování celého uloženého rozsahu letu;
  persistované propojení událostí a provenience trasy se zachovávají.

## MapLibre namespaces a cleanup

Vrstvy Map Context jsou volitelný enrichment a nikdy nevlastní aircraft state.
Radarové snímky jsou pozorovaná data, vítr je modelová předpověď a plánovaná
alokace AUP/UUP není důkaz skutečné aktivace. Radar, METAR, vítr a AUP/UUP mají
nezávislé failure states a omezené cache/prefetch. Jejich MapLibre
sources/layers musí podporovat opakovaný cleanup ON → OFF → ON bez chyb
duplicitního source nebo layer a žádný payload Map Context se nesmí dostat do
aircraft SSE.

Mapa `AirRadarApp` vlastní svou map instance, controls, DOM markery, animation
frames, event listenery a dynamická source data. Její obecná ID jsou:

- sources `range-rings`, `selected-trail`, `atc-sectors`,
  `atc-transmitters`, `route-airports`, `aviation-sigmet`; layers
  `range-rings-line`, `selected-trail-line`, `atc-sectors-fill`,
  `atc-sectors-line`, `atc-sectors-label`, `atc-transmitters-circle`,
  `route-airports-circle`, `route-airports-label`, `aviation-sigmet-fill`,
  `aviation-sigmet-line`;
- OGN targety používají vyhrazené MapLibre DOM markery nezávislé na ADS-B
  GeoJSON vrstvách a jsou skryté, dokud operátor nezapne samostatný OGN map
  toggle.
- Konstanty Route V2 v `lib/route-visualization.ts`: sources
  `selected-route-v2` a `selected-route-airports-v2`; layers
  `selected-route-completed`, `selected-route-remaining`,
  `selected-route-airports-v2-circle` a
  `selected-route-airports-v2-label`.

Route V2 musí zůstat oddělené od `selected-trail`; přepnutí/odznačení živého
letadla vyčistí oba overlaye bez křížení identit. DOM markery jsou klíčovány
ICAO hexem a MapLibre si ponechává vlastnictví pozicování markeru; aplikační CSS
aplikuje vizuální efekty na child elements.

Animace letadel drží sémantiku ADS-B tracku a predikci odděleně od presentation
heading. Během interpolace potvrzené pozice animation job ukládá bearing z
vykreslené výchozí pozice markeru k potvrzenému cíli (pokud je posun alespoň
25 m), takže opakované framy nemohou způsobit oscilaci ikony během pohybu
markeru. Heading odvozený z pozice, reportovaný track a last known track jsou
pouze fallbacky prezentace.

Cleanup `AirRadarApp` ruší animation frames, odstraňuje receiver a aircraft
markery, čistí trail/animation mapy a volá `map.remove()`. `AirportMap`
vlastní a odstraňuje svou mapu a airport marker. `HistoryMap` vlastní a
odstraňuje svou history map, playback marker a dynamické history layers přes
`map.remove()`. Nový mapový resource musí být přidán a uklizen komponentou,
která jej vytvořila.

## Graceful shutdown a koordinace build/start

- Coordinator vlastní SIGTERM/SIGINT právě jednou, odstraní exit-based
  handlery Nextu, provede cleanup s omezeným časovým rozpočtem a poté znovu
  doručí signál, aby proces skončil s původní sémantikou signálu.
- Pořadí cleanupu je state stop/history drain, statistics close, provider close
  a poté database close. Opakovaná volání shutdownu se připojí k jednomu
  promise. Práce stále běžící po timeoutu fáze se sleduje/loguje bez
  nekonečného blokování pozdějších fází.
- Produkce spouští přímý Node entrypoint pod systemd jako `MainPID`.
  `NEXT_MANUAL_SIG_HANDLE=1` ponechává jednoho vlastníka signálu a
  `KillMode=control-group` umožní systemd uklidit process group.
- Produkční buildy drží `/var/lib/airradar/build.lock`. Start wrapper čeká na
  tento lock a před importem Next vyžaduje `.next/BUILD_ID`. Změna
  build/start locku musí zachovat tento kontrakt prevence race condition.

## Invarianty integrity navigace

- Integrita navigace nikdy nevymýšlí chybějící hodnoty NIC, NACp, NACv, SIL,
  SDA, GVA ani verze ADS-B a chybějící pole nepovažuje za normální kvalitu.
- Do odvozené větve vstupují jen čerstvá, polohovaná pozorování s platnou
  proveniencí jednotlivých polí; confidence je oddělena od severity.
- Větev je omezená a best-effort: nesmí blokovat aircraft state, SSE, historii
  ani statistiky a nikdy nemění živou pravdu o letadle.
# Invarianty pokrytí přijímače

- `AVAILABLE` je čerstvé, polohované, validní-ICAO síťové pozorování uvnitř
  nakonfigurovaného comparison radiusu.
- `CAPTURED` vyžaduje čerstvé lokální pozorování stejného normalizovaného ICAO;
  historie provenience, stopy ani zastaralé lokální řádky se nepočítají.
- Nezdravý stav sítě nebo lokálu přeskočí sampling; nikdy nezapíše nulový
  capture sample.
- Zápisy pokrytí jsou omezené hodinové agregace a nesmějí vstoupit do lokálních
  větví historie/statistik.


## Operational Digital Twin invariants

- Digital Twin nikdy nevlastní ani nespouští receiver polling lifecycle.
- Čte pouze aktuální RAM stav; pro live corridor nesmí dotazovat
  `FlightPosition` ani durable flight history.
- Horizont je omezený na 30 minut a intersection sampling na dvě minuty.
- AUP/UUP zůstává PLANNED evidence a nikdy se nesmí serializovat jako potvrzená
  real-time aktivace.
- Predikční ETA/runway/trajectory vstupy musí projít existujícím PUBLIC
  graduation/readiness gate; admin/SHADOW preview je zakázáno.
- Chybějící externí kontext je fail-soft a nesmí způsobit degraded stav live
  radaru.


## Track Fusion Shadow invariants

- Shadow fusion nesmí měnit `localAircraft` ani `networkAircraft`.
- Shadow fusion nesmí vstoupit do `recordAircraftSnapshot`, receiver statistik,
  reception records ani `FlightPosition` persistence.
- NETWORK nebo ESTIMATED state se nikdy nesmí přejmenovat na LOCAL evidence.
- V1 nevlastní timer, socket, EventSource, upstream request ani DB handle.
- Odmítnutí source transition smí ovlivnit pouze shadow state.
- Estimated position je omezená na šest sekund a musí zůstat explicitně
  označená ESTIMATED.
- Veřejná radar/SSE serializace je ve V1 beze změny.


## Track Fusion graduation invariants

- Readiness evidence je process-local, omezená na 24 hodin a po restartu se
  vrací na WAIT.
- Readiness nemá vlastní timer, network request, databázovou cestu ani
  persistence.
- PASS nikdy nemění canonical Aircraft, radar SSE, receiver history,
  FlightPosition ani receiver statistics.
- Digital Twin fusion je defaultně vypnutá a vyžaduje explicitní konfiguraci i
  readiness PASS.
- První Digital Twin rollout zakazuje dead-reckoned fused position a estimated
  nebo LOW-confidence fused numerická pole.
- Pokud per-aircraft fusion gate není splněn, Digital Twin zůstává
  local-canonical a nesmí se tiše rozšířit na network-only canonical provoz.


## Track Fusion outcome validation invariants

- Outcome validation je prospektivní: žádný sample nemá výsledek před příchodem
  pozdější LOCAL position observation v cílovém horizontu.
- Ground truth V1 je pouze current-RAM LOCAL receiver position; NETWORK, fused,
  estimated ani historické FlightPosition rows se nesmí stát truth.
- Baseline horizonty jsou omezené na 5/15/30 sekund a pending state je omezený
  na 6 000 samples s retention 45 sekund.
- Outcome agregace jsou process-local, omezené na 24 hodin v pětiminutových
  bucketech a po restartu se resetují.
- Validator nemá vlastní timer, socket, EventSource, upstream request, Prisma
  handle ani persistence path.
- Validation nemůže měnit canonical Aircraft, source affinity, Track Fusion
  arbitration, public radar/SSE, receiver statistics ani FlightPosition.
- Outcome PASS je pouze evidence a sám o sobě nemůže Track Fusion povýšit.

## Invarianty truth-first validace

- Truth-first observation se vyhodnotí před zachycením nových budoucích
  predikcí stejného požadavku; predikce nemůže splnit truth ze stejného
  okamžiku.
- Waypoint truth vzniká z pozorovaného postupu Route Intelligence, sector truth
  z debounced boundary událostí Flight Intelligence a SIGMET truth z pozdější
  skutečné polohy uvnitř právě platného advisory.
- Truth-first V2 nepřidává receiver poller, provider loop, databázový handle ani
  změnu veřejného radaru. Waypoint/SIGMET truth zůstává request-driven a
  process-local.

