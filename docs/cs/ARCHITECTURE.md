Architektura

Tento dokument popisuje implementaci aktuálně v úložišti.
hlavní zdrojové soubory jsou propojeny inline; generované artefakty Prisma jsou výstupy,
nejsou zdroji schématu.

## Tvar runtime

Hranice čtení Flight Story (`lib/server/flight-story.ts`) je samostatná
kompozice pouze pro čtení nad tabulkami historie a není připojena k živému hlasování
nebo zpravodajské pruhy pro psaní.

```text
RTL-SDR / readsb web root
        │  /data/aircraft.json, /data/receiver.json
        ▼
LocalReadsbProvider (or MockReadsbProvider when READSB_BASE_URL is empty)
        ▼
one global AircraftStateService
  ├─ RAM aircraft map, stale cleanup, distance/bearing, bounded live trails
  ├─ optional NetworkFailoverProvider: ADSBHub SBS/30003 + ADSB.lol raw + HTTP
  │    └─ bounded network RAM map (deduplicated union across sources)
  ├─ async enrichment and ATC resolution
  ├─ async sampled history persistence
  ├─ daily ReceiverStatistics aggregate
  ├─ page-scoped logbook summary read
  ├─ AlertEngine
  │   └─ append-only alert event ledger (`/var/lib/airradar/alert-events.jsonl` in production)
  └─ listeners
        ├─ GET /api/aircraft
        ├─ GET /api/stream (SSE)
        └─ health, statistics, search, watchlist and UI consumers
```

Analýza pokrytí přijímače je samostatný ohraničený odvozený pruh. Jeho vzorkovač
čte mapy lokální a aktivní sítě RAM, přetrvává pouze hodinový agregát
čítače a nikdy nezapisuje síťová letadla do historie, místních statistik,
FlightPosition, výstrahy nebo stezky.

`getAircraftStateService()` ukládá jednu službu do `globalThis`. `start()` je
idempotentní: načte statistiky a spustí první místní a síťové obnovení;
oba pruhy naplánují své pozdější osvěžení nezávisle na sobě. `subscribe()` a
`waitForReady()` jsou vstupní body používané trasami. Výroba
architektura je záměrně jednoprocesová: více pracovníků uzlů by
duplicitní dotazování, vyhodnocování výstrah, statistické pozorování a historie
vzorkování.

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Vlastnictví serveru

„AircraftStateService“ vlastní živý životní cyklus a koordinuje následující
samostatné jízdní pruhy:

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Hranice vytrvalosti

PostgreSQL je volitelný pro živý provoz. Při konfiguraci ukládá:

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

## Hranice prohlížeče a API

### Kontext mapy V1/V2

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

### Letecké počasí

QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS

Rozhraní API počasí přijímá pouze kanonické kódy ICAO letiště. Prohlížeč vykresluje
normalizovaná data METAR/TAF v detailech letišť a letů, volitelně
SIGMET GeoJSON je na vyžádání přenesen do zdroje MapLibre „Aviation-sigmet“.
Vrstva SIGMET je zpočátku zakázána a její vyskakovací okna DOM používají pouze textový trezor
vlastnosti. Diagnostika počasí je pouze pro čtení a je zahrnuta v `/system`
bez sondování předcházejícího poskytovatele.

Systémová diagnostika zachovává zastaralý čtyřstavový „status“ pro spotřebitele API a
také vystavit ohraničený `operationalState': `on_demand`, `loading`, `ok`,
`degradováno`, `offline` nebo `zakázáno`. Použití radaru, větru, počasí a ADSBDB
pevné hodnoty `reasonCode` pro nezdravé stavy. Cold-start líní poskytovatelé jsou
proto nejsou hlášeni jako offline/deaktivovaní a obnovení poskytovatelé nejsou
která byla degradována čítači poruch po celou dobu životnosti.

`/api/system/status` odhaluje dezinfikovaný proces RSS/halda/externí/ArrayBuffer
metriky, rozdělení RSS jádra, aktivní počet a limit SSE, mezipaměť metadat
počítá, záložní mezipaměť tar1090 s omezením na bajty a hodnoty paměti cgroup
pro aktuální proces cgroup, když je hostitel vystaví. `/api/system/stream`
publikuje stejnou plánovanou diagnostiku přes sdílenou, sloučenou aktualizaci SSE
každých pět sekund, takže stránka „/system“ odráží změny za běhu bez
ruční opětovné načtení.

Rekapitulace stránek jsou čtení s rozsahem stránek. Sloučí stávající denní přijímač
agregáty s agregáty „Let“ na straně databáze a ohraničené první/poslední
vyhledávání podle životnosti letadla; nikdy nečtou „FlightPosition“, spustí
nebo otevřete připojení SSE. Rekapitulační indexy jsou aditivní a zůstávají
čekající, dokud je výslovně autorizované nasazení neuplatní.

## Životní cyklus procesu

Production systemd spustí přímo „scripts/start-production.mjs“. Obal
čeká na zámek sestavení výroby, ověří `.next/BUILD_ID`, zaregistruje
Koordinátor vypnutí AirRadar, deaktivuje konkurenční obsluhu signálu společnosti Next a
poté se spustí Next. Vypnutí zastaví státní službu a vypustí historii před
uzavírání statistik, poskytovatele a PostgreSQL v rámci vymezeného koordinátora
lhůta. Postup uvolnění je definován pouze v [RELEASE.md](RELEASE.md).

Stroj času

`/time-machine` je samostatný historický kontext pouze pro čtení. Historický
repozitář v `lib/server/time-machine.ts` načítá ohraničená okna z
`FlightPosition`, připojí se k metadatům `Flight`/`Aircraft` a značkám 'FlightEvent`,
a vystavuje bezpečné DTO. Prohlížeč rekonstruuje stav letadla pomocí
`lib/time-machine/playback.ts` a používá zdroje MapLibre ve jmenném prostoru
„time-machine-aircraft“ a „time-machine-selected-trail“; nikdy nepoužívá
live State Service, SSE nebo Live Trail Store.

Flight Intelligence načte importovaný katalog letiště PostgreSQL jednou do
omezený index doby provozu; neskenuje seznam vzorků/světů na každém letadle
anketa. Paměť stopy je omezena na 120 vzorků a pětiminutové zadržovací okno,
a zastaralé stopy letadel jsou odstraněny vyčištěním v reálném stavu. Přetrvávání událostí
ukládá Let, jehož trvalý časový rozsah pokrývá pozorování události
čas, pokud je k dispozici; selhání databáze zůstává nejlepším úsilím.

Povědomí o zdroji je centralizováno v „lib/aircraft/source-aw awareness.ts“.
„MÍSTNÍ“ a „SÍŤ“ jsou členství původu, nikoli dominantní „původ“
field: overlap je `seenLocal=true` a `seenNetwork =true`. Stejný pomocník
řídí klasifikaci, čítače a filtry na straně klienta. Živé MÍSTNÍ ZACHYCENÍ
ratio používá `RECEIVER_COMPARISON_RADIUS_NM` (výchozí 175 NM) a není uložen.
