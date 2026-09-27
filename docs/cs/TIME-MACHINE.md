# Time Machine V1

Time Machine je samostatný historický radarový kontext na `/time-machine`.
Rekonstruuje všechna persistovaná pozorování přijímače v omezeném UTC okně a
nevytváří druhý history store.

## Architektura a API

`FlightPosition` je zdrojem pozic letadel; `Flight` a `Aircraft`
poskytují trvalou identitu/kontext; `FlightEvent` poskytuje read-only
intelligence markery. `/api/time-machine/range` hlásí skutečné persistované
min/max timestampy. `/api/time-machine/window` přijímá UTC parametry
`from`/`to` a každý request omezuje na pět minut, 40 000 pozic, 500 letadel
a 200 událostí. Odpovědi jsou bezpečná DTO a používají cache `no-store`.

## Playback model

Prohlížeč drží jedno omezené okno. Pozice se interpolují pouze přes mezery do
30 sekund; interpolace tracku používá nejkratší cestu přes 0/360 stupňů.
Letadlo je skryto před prvním pozorováním, přes velkou mezeru nebo více než
45 sekund po posledním pozorování. Playback je deterministický při
1×, 5×, 10× a 30×. Seek ruší/zneplatňuje stale window odpovědi.

## Události a kontext

Události Flight Intelligence jsou read-only markery. Kliknutí seekne na jejich
`occurredAt` a vybere jejich letadlo, je-li dostupné. Výběr zobrazí trvalou
identitu, flight context, aktuální historické hodnoty, pětiminutovou historickou
stopu a odkaz na detail zachyceného Flight.

Mapa používá izolované MapLibre source/layer názvy začínající
`time-machine-`; nesdílí živé markery ani stopy. Map Context V2 přidává přes
Global Map Time historické řešení radaru, METAR, větru a AUP/UUP. Každá vrstva
je nezávislá a může být unavailable bez skrytí letadel. Historie SIGMET se
netvrdí, když neexistuje archiv.

## Retence a budoucí hranice

Dostupnost sleduje skutečnou retenci `FlightPosition`, nikoli natvrdo zadaný
počet dnů. Všechny API okamžiky jsou explicitní UTC ISO timestampy; UI
formátování používá existující locale/timezone policy AirRadaru.
Repository/service hranice je záměrně vhodná pro budoucí PostgreSQL plus
cold-archive source i pro Flight Story V1. Time Machine zůstává read-only a
selhání databáze je izolované od live ingestu a SSE. Viz
[MAP-TIME.md](MAP-TIME.md).
