# Global Map Time V2

Global Map Time je jeden UTC okamžik sdílený historickým přehráváním provozu a
volitelnými map-context vrstvami. `MapTimeController` je malá client-side
hranice stavu; nevlastní aircraft state ani žádného providera. `/time-machine`
zůstává master clockem a při postupu playbacku volá `setTime`/`seek`.

## Režimy a časová sémantika

- `LIVE` znamená běžnou cestu živého radaru. Live aircraft poller a SSE cesta
  zůstávají beze změny.
- `HISTORICAL` znamená, že každá zapnutá context vrstva se řeší proti
  vybranému okamžiku. Aktuální data nikdy tiše nenahrazují chybějící historii.
- Všechny API okamžiky jsou ISO timestampy s timezone a interně se normalizují do UTC.
- Radar a METAR používají nejnovější pozorovaný záznam v nebo před požadovaným
  okamžikem. Radar akceptuje maximální rozdíl deset minut; METAR maximální
  stáří pozorování dvě hodiny.
- Vítr je modelový produkt. Resolver vyžaduje `modelRun <= selected time`,
  poté zvolí nejbližší valid time v rámci jedné hodiny a zachová oba timestampy.
- AUP/UUP používá revizi publikovanou v nebo před vybraným časem a interval
  obsahující vybraný čas. Zůstává `PLANNED`, nikdy actual.
- Historický SIGMET je explicitně unavailable, dokud nevznikne samostatný archiv.

Každý výsledek obsahuje requested time, resolved time, match type, delta,
provider a source kind (`OBSERVED`, `MODEL` nebo `PLANNED`). Jedna vrstva
může být unavailable, zatímco provoz a ostatní vrstvy pokračují.

## Persistence a retence

Radarové framy se archivují jako validované PNG soubory pod
`WEATHER_RADAR_ARCHIVE_DIR/YYYY/MM/DD/HHMM.png`. Download používá dočasný
soubor a atomický rename, dvouworkerový backfill, retenční cleanup a volitelný
byte cap. Výchozí produkční umístění je `/var/lib/airradar/weather-radar`;
musí jít o persistentní úložiště.

Normalizované METAR, wind snapshoty a AUP/UUP revize používají omezené atomické
JSON archivy ve stejném parentu runtime state. Deduplikují se a prořezávají na
`MAP_CONTEXT_RETENTION_DAYS` (ve výchozím stavu následuje
`HISTORY_RETENTION_DAYS`) a nikdy nejsou součástí aircraft history ani SSE
payloadů.

## API a výkon klienta

- `GET /api/map-context/at?at=...Z` vrací malý manifest.
- `GET /api/map-context/range` vrací omezené rozsahy dostupnosti.
- Data vrstev se načítají přes `/api/map-context/radar`, `/metar`, `/wind`
  a `/aup`; archivované radar bytes obsluhuje `/radar/frame/:id`.
- Traffic endpointy zůstávají beze změny; context se záměrně nevkládá do
  `/api/time-machine/window`.

Všechny hodnoty `at` jsou omezeny na nakonfigurovaný retenční horizont a
odmítají neplatné nebo příliš budoucí timestampy. Playback context requesty se
slučují, kontrolují generací a bucketují po pěti minutách; seek abortuje
předchozí requesty a staré odpovědi nemohou přepsat novější seek. MapLibre
sources používají explicitní ID `time-machine-*` a aktualizují se na místě.

Neexistuje syntetický backfill: historická dostupnost začíná, až když každý
archiv poprvé přijme data. Resolver lze znovu použít budoucím Flight Story přes
`resolveContextAt(timestamp)`.
