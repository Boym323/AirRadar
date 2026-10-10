# Map Context V1/V2

Map Context je volitelný enrichment vykreslovaný vedle živé mapy letadel.
Nikdy nevlastní aircraft state a není součástí `/api/stream`, readsb pollingu,
historie, statistik, OGN ani flight intelligence. V2 přidává Global Map Time a
omezené historické archivy; chybějící kontext je unavailable místo tichého
fallbacku na aktuální data. Změny METAR a větru se slučují v RAM a zapisují
atomickými JSON snapshoty; výchozí flush je 60 sekund (nebo 64 změn) a řízené
ukončení čekající data zapíše. Viz [MAP-TIME.md](MAP-TIME.md).

## Meteorologický radar

Radar provider čte oficiální katalog PNG ČHMÚ CZRAD `MAX_Z_MASKED` na
`https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/`.
Produkt je web-map image v EPSG:3857, vytvářený každých pět minut, s hranicemi
celého obrazu `[11.267, 48.047]` až `[20.770, 52.167]`. Server parsuje pouze
striktní název `pacz2gmaps3.z_max3d.YYYYMMDD.hhmm.0.png`, odmítá neplatné/
budoucí timestampy a vystavuje omezený dvouhodinový katalog (max. 25 framů).

`/api/weather/radar/frames` vrací veřejná metadata framů. Frame endpoint
přijímá pouze validované timestamp ID, sestaví allow-listed URL ČHMÚ a validuje
status, `image/png`, PNG signature, neprázdný obsah a limit payloadu 12 MiB.
Nejde o obecný URL proxy. Katalogové requesty se cacheují 60 sekund, frame
bytes se slučují a omezují a při selhání katalogu bez použitelné cache se vrací
`available: false`.

Prohlížeč používá jeden MapLibre image source a mění jeho URL bez znovuvytvoření
mapy. Radar leží pod labely, letišti, procedures, SIGMET, obrysy vzdušného
prostoru, stopami a letadly. UI má latest/history režim, timeline reálných
framů, play/pause, omezený neighbour prefetch, stale indikaci po 18 minutách a
persistovanou opacity (20–100 %, výchozí 65 %). V2 archivuje validované framy
do persistentního omezeného adresáře a řeší nejnovější frame v nebo před
Global Map Time.

Vrstva meteorologického radaru nově podporuje druhý produkt **PseudoCAPPI 2 km**
z oficiálního katalogu PNG ČHMÚ
`https://opendata.chmi.cz/meteorology/weather/radar/composite/pseudocappi2km/png/`.
Výchozí zůstává MAX_Z. API katalogů a obrázků povolují jen hodnoty
`MAX_Z_MASKED` a `PSEUDOCAPPI_2KM`; poskytovatelé mají oddělené cache,
konstrukci URL a přesnou kontrolu názvů `z_cappi020`.
Výběr produktu se uchovává jen v prohlížeči. Historický Map Context nadále
pracuje s archivem MAX_Z, dokud nebude hotový archiv pro více produktů.

**Echo Top není PNG**. ČHMÚ tento produkt poskytuje jako ODIM HDF5 na
`https://opendata.chmi.cz/meteorology/weather/radar/composite/echotop/hdf5/`.
Dokud nevznikne bezpečné zpracování HDF5 s validací jednotek a projekce,
nelze Echo Top vykreslovat stejnou PNG vrstvou ani ho vydávat za skutečnou
výšku horní hranice oblaků.

## Mapa METAR

METAR vrstva znovu používá `AviationWeatherProvider` a oficiální JSON API
Aviation Weather Center. Jediný omezený dávkový request obslouží vybranou
oblast mapy; prohlížeč neposílá jeden request na každé letiště. Provider drží
samostatnou jednopoložkovou omezenou batch cache a sdílí AWC parsing, timeout,
backoff a failure handling s airport weather.

`/api/weather/metar-map` vrací jen veřejná mapová pole: souřadnice stanice,
čas pozorování, flight category, vítr, dohlednost, ceiling, teplotu, rosný bod,
QNH, clouds a raw METAR. Stale pozorování jsou vizuálně oslabena a označena.
Místo React DOM markerů se používají MapLibre GeoJSON kruhy.

## Vítr ve výšce

`WindAloftProvider` používá Open-Meteo DWD ICON API s explicitním výběrem
modelu `icon_eu`. Požaduje jednu omezenou mřížku 0,75° pro provozní oblast
CZ/SK/AT a tlakové hladiny 850, 700, 500, 300 a 200 hPa. Rychlosti se požadují
a zobrazují v uzlech; směr je meteorologický směr FROM modelu a neobrací se.
Tlakové hladiny jsou přibližné výšky, nikoli přesné Flight Levels.

`/api/weather/wind` allowlistuje hladiny a valid times, vrací omezenou sadu
bodů a používá 30minutovou cache modelového snapshotu se stale-if-error. Vítr
je označen `ICON-EU / Model forecast` s model run a valid time, pokud je
transport poskytuje. Má vlastní selector valid-time a nesdílí radar timeline.

## AUP/UUP

Mapa znovu používá existující českou pipeline AUP/UUP na
`/api/airspace/activity` a její existující provider/cache. Samostatný toggle
Map Context vykresluje stejnou autoritativní geometrii sektorů s plánovanými
okny jako `PLANNED ACTIVE` nebo `UPCOMING`; nikdy nepřejmenuje plánovanou
alokaci na potvrzenou aktivaci. Source reference, interval platnosti,
issue/update provenience, vertikální limity a existující disclaimer zůstávají
dostupné v popupu mapy.

## Životní cyklus vrstev a izolace selhání

Každá nová vrstva má nezávislý client state a cleanup: radar image source,
METAR GeoJSON source, wind GeoJSON source a AUP/UUP views. Aktualizace dat
používají `updateImage`, `setData` nebo paint/layout properties; instance
mapy se nevytváří znovu kvůli togglům, změně framu, opacity, hladin nebo valid
times. Všechny nové vrstvy jsou ve výchozím stavu vypnuté a preference
používají existující konvenci AirRadar `localStorage`.

Z-order je: basemap → radar → AUP/UUP planned fills → ATS/procedures → SIGMET
→ wind arrows → airports/METAR → route/trails → aircraft. Selhání providera je
lokální pro jeho vrstvu a nikdy nezastaví živou aircraft cestu.
