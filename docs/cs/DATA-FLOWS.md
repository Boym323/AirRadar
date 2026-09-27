Datové toky

## Live ingest do prohlížeče

Vzorkování pokrytí přijímače pravidelně vyhodnocuje aktivní snímek sítě
proti lokální mapě pomocí stejné čerstvé polohy, poloměru, normalizovaného-ICAO
sémantika způsobilosti jako poměr živého zachycení. „DOSTUPNÉ“ počty jsou způsobilé
síťová pozorování a „ZACHYCENÉ“ počty čerstvých místních shod stejného snímku.
Výpadky přeskočí vzorek. Agregáty jsou splachovány deltami hodinových kbelíků; syrové
síťová pozorování nejsou trvalá.

## Kontext mapy V1/V2

Mapový kontext je samostatná volitelná cesta pro čtení. Požadavky na katalog/rámec radaru,
dávkové aktivity METAR, ICON-EU Wind a AUP/UUP jsou nezávisle ukládány do mezipaměti a
serializováno do ohraničených mapových DTO. Jejich stav prohlížeče je izolován od
`/api/stream`; selhání poskytovatele opustí živá letadla a další vrstvy mapy
použitelné. Radar používá pozorované snímky, vítr používá platné časy modelu, METAR používá
nejnovějších pozorování a AUP/UUP používá intervaly platnosti.

V2 publikuje jeden globální mapový čas od Time Machine do kontextu
resolver. Jednoprocesová archivní služba vzorkuje radar, METAR, vítr a
AUP/UUP do vázaných trvalých souborů. Manifest zůstává malý; užitečné zatížení vrstvy
používat nezávislá rozhraní API a nezávisle selhávat.

1. `LocalReadsbProvider` fetches `<READSB_BASE_URL>/data/aircraft.json` na
   interval hlasování a obnovuje `/data/receiver.json` méně často. Chybějící
   `READSB_BASE_URL` používá `MockReadsbProvider` pro demo režim.
2. `normalizeAircraftResponse()` ověřuje šestimístné letadlo
   identifikátor (včetně ne-ICAO formuláře readsb), převádí pole, uchovává
   barometrické a geometrické hodnoty, odvozuje nadmořskou výšku/vertikální rychlost a
   vypočítává vzdálenost a ložisko.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Výstrahy a historie výstrah

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

NOVÝ přechod je vydán pouze `recordAircraftSnapshot()` po
úspěšná transakce vytvoří první trvanlivou instanci „Let“ letadla.
Restartování v paměti nebo řádek „Letadlo“ bez letu nemůže vytvořit NOVÝ
upozornění. Přechody mezi příjmem a záznamem jsou vyhodnocovány až po denním
statistický agregát je připraven a porovnává aktuální denní maximum s
naložené denní/celoživotní základní linie. Stabilní ID událostí zabraňují stejnému záznamu
jsou emitovány dvakrát v jednom procesu.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## OGN / FLARM živý tok

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Rychlost APRS „CSE/SPD“ je již v uzlech a je uložena přímo v
`groundSpeedKt`, bez ohledu na zdroj TOCALL. Soukromí je uzavřeno selháním podle
zařízení, zatímco jeho rozlišení není vyřešeno, s paketem bez sledování a DDB
sledované/identifikované volby použité před veřejnou serializací. Existující
položky mezipaměti platné pro ochranu soukromí zůstávají viditelné prostřednictvím maximálního zastaralého okna
i když jiné zařízení nebo předcházející DDB není k dispozici.

`/api/ogn/state` vrací aktuální omezený snímek a `/api/ogn/stream`
poskytuje počáteční snímek plus propojené aktualizace a tlukot srdce. OGN nemá žádné
vliv na `/api/stream`, místní filtry letadel, místní historii, statistiky,
výstrah nebo stavu hlavního přijímače. Zastaralé cíle jsou označeny po 15 sekundách
a odstraněn po 60 sekundách; cílová mapa je omezena na 5 000 záznamů.

## Letecké počasí

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Odpovědi počasí odhalují `cacheSource` (`live`, `memory-cache` nebo
`persistent-cache`), `fetchedAt`, 'snapshotAgeMs` a `stale`. Trvalý
záznam je explicitně označen jako zastaralý, dokud se živé obnovení nezdaří. Vývoj a
testovací procesy nepovolí zapisovač `/var/lib`, pokud není vytrvalost
explicitně nakonfigurováno.

## Vytrvalost historie

Airport Intelligence čte blízké letadlo ze stávajícího místního letadla
SSE na klientovi a filtry umístěné, nedávná pozorování ADS-B v rámci
Poloměr 30 km. SSE nespustí žádný dotaz na počasí, letiště nebo historii
aktualizace. Řádky pohybu na letišti opakovaně používají omezené dotazy na trasu „Let“;
vyžadují důkazy o blízkosti přijímače a zůstávají výslovně dodržovány, nikoli
oficiální pohyby na letišti. OGN není zahrnuto v žádném letištním prvku.

Každá úspěšná obnova poskytovatele nahrazuje čekající snímek historie. A
jeden historik vypouští vodu, která spojila frontu. Pro každé letadlo s
platná pozice, `persistHistory()` zapíše pouze pokud je jeho poslední vzorek starší
než `HISTORY_SAMPLE_INTERVAL_MS` (minimum vynucené konfigurací). Zápisy běží s
ohraničená souběžnost a každé selhání letadla je izolováno.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Údržba pravidelně uzavírá zastaralé otevřené lety a odstraňuje řádky polohy
starší než `HISTORY_RETENTION_DAYS`. Databázi nikdy neresetuje. Seznam letů
a podrobné koncové body dotazují PostgreSQL s omezenými limity; detaily letu
zkrácení pozic a zpráv.

## Shrnutí provozu na letišti

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Podrobné statistické údaje o životnosti letadla přečtou pouze řádky „Let“ letadla prostřednictvím
stávající index „(aircraftId, startTime)“. Počítají zadržený let
instancí, místních aktivních dnů, volacích značek, vyřešených počátků/destinací a
trasy. Záměrně neskenují „FlightPosition“; vzorkované pozice
zůstávají ve vlastnictví omezeného koncového bodu přehrávání za let.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Statistiky a pokrytí

`ReceiverStatistics.observe()` běží po každém použitém snímku. Počítá se
jedinečné identity ICAO pro místní den vybrané pomocí `APP_TIMEZONE`, stopy
maximální souběžná letadla, maximální vzdálenost a poruchy typu/letecké společnosti.
Platné polohy vytvářejí maximální hodnotu vzdálenosti v jednom z 36 pevných 10 stupňů
azimutové lžíce. Neplatné pozice „(0, 0)“ a neplatné souřadnice přijímače
jsou vyloučeny z krytí.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Pozorování maximální vzdálenosti si také zachovává normalizovaný šestihran ICAO, ložisko,
časové razítko a registrace, pokud je k dispozici. `/api/reception-records` read up
na deset trvalých denních řádků s platným ložiskem V1 a sloučí aktuální RAM
den. Vrací nejlepší denní záznamy a maximální životnost bez skenování
`FlightPosition`; starší denní řádky, které předcházely poli ložiska, jsou vyloučeny
ze seznamu kompletních záznamů a vyvolán v uživatelském rozhraní.

## Rozšířené krytí

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Průtok ATC

`GET /api/atc/sectors` vrací dataset aktivního sektoru/vysílače. V ukázce
režim, nebo když `ATC_SAMPLE_ENABLED=true`, použije explicitně označený vzorek
konstanty. S nakonfigurovaným skutečným přijímačem a zakázaným vzorkem se čte
importované pouze řádky PostgreSQL; prázdné/nedostupné tabulky produkují prázdné
vrstvy.

Pro každé letadlo s polohou státní služba omezuje opakované vyhledávání
a zeptá se AtcSectorService na nejlepší polygon, nadmořskou výšku a
časová shoda platnosti. Sektorová metadata a frekvence jsou zkopírovány do
pravděpodobné přiřazení. Souhrny relevantních frekvencí agregují již vyřešené
přiřazení podle frekvence/služby/volací značky a zahrnují počty spolehlivosti. Ne
dráha hlásí aktuální naladěnou frekvenci letadla.

## Pomocné průtoky

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Shrnutí lodního deníku na domovské stránce je samostatné, s rozsahem stránek „ZÍSKAT
/api/logbook/summary` fetch. Používá aktuální stavový snímek služby pro
živé a sledované seznamy počítají, pak dávkují dnešní přetrvávající identity letu a
jejich celoživotní letové řádky pro klasifikaci NOVÝCH/VZÁCNÝCH/VRACEJÍCÍCH SE letadel. Není
volá pro každou událost SSE a zobrazuje nulové trvanlivé štítky, když je PostgreSQL
není k dispozici, spíše než aby považoval restart procesu za nové pozorování.

## Rekapitulace přijímače

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Historický tok Time Machine

`GET /api/time-machine/range` načte aktuální první/poslední
Hodnoty `FlightPosition.recordedAt`. `GET /api/time-machine/window` validuje
maximálně pětiminutové UTC okno, přečte maximálně 40 000 pozic a 500 letů
identit, pak se připojí k trvalým metadatům a značkám „FlightEvent“ pouze pro čtení.
Prohlížeč udržuje jedno ohraničené okno a rekonstruuje vybraný okamžik
lokálně. Historická čtení nikdy nevyvolávají detekci zpravodajských informací, výstrahy,
oznámení nebo živé hlasování.
# Flight Story

`/flights/[id]` čte ohraničený letový příběh obsahující identitu letu,
vzorkovaných pozic v plném rozsahu, přetrvávajících FlightEvents a kontextu trasy. Jeden
časová značka přehrávání pohony mapa, časová osa, profil, výběr události a mapa
Kontext V2. Během přehrávání neprobíhá žádná cesta pro zápis detektoru, výstrahy nebo oznámení.
## Tok provenience nadmořské výšky

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS
