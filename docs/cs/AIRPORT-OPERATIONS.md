# Airport Operations V2

Airport Operations je pozorovací vrstva nad existujícími údaji letišť,
vzorkovanými pozicemi, drahami, METAR a Flight Intelligence. Nejde o pokyn
ATC ani o úplný provozní deník letiště.

## Původ údajů a confidence

Souřadnice, čas, výška, rychlost, kurz, vertikální rychlost, zdroj dráhy a
METAR jsou pozorované údaje. `APPROACH`, `LANDING`, `TAKEOFF`, `DEPARTURE`,
`GO_AROUND`, `HOLDING` a `OVERFLIGHT` jsou omezené odhady s uvedenými důkazy a
úrovní confidence. Pravděpodobná dráha vyžaduje geometrii prahu a shodu
kurzu; samotný vítr nikdy nevytvoří vysokou confidence.

## Klasifikace

Klasifikace používá nejméně tři platné časově seřazené pozice, omezené okno
45 km, poloměr letiště 22 km a poloměr prahu 8 km. Vysoko letící průlet se
nepočítá do použití dráhy. Přiblížení, které po dosažení letiště stoupá a
odlétá, je nezdařené přiblížení; stabilní opakované pozice v okolí znamenají
čekání v prostoru. Nejednoznačné údaje se nezobrazují jako fakt.

## API a historie

`GET /api/airports/:icao/operations?period=today|24h|7d` vrací omezené přílety,
odlety, přiblížení, poslední pohyby, nezdařená přiblížení, čekání, použití drah,
úroveň aktivity, pravděpodobnou dráhu, větrné komponenty a diagnostiku.

## Vítr a použití dráhy

Vítr a použití dráhy jsou oddělené informace: používejte „dráha zvýhodněná
větrem“ a „pravděpodobná dráha podle nedávného provozu“, nikoli provozní
doporučení.

## Omezení

Výpadky přijímače, chybějící trasa nebo METAR, vrtulníky, touch-
and-go, blízká letiště a paralelní dráhy snižují confidence. Audit spustíte
příkazem `npm run audit:airport-operations`.

Výsledky jsou počítány z historických vzorků, nikoli z aktuálního stavu mapy.
Při dosažení limitu dotazu je odpověď označena jako neúplná a uvedené počty
jsou pouze dolní mez. Nezavádí se nová tabulka databáze, aby se neduplikovala
historie Flight Intelligence. Úroveň aktivity je deterministická: QUIET je
nula pohybů, LIGHT jeden až tři, MODERATE čtyři až osm a BUSY devět nebo více
relevantních pohybů v daném okně. Přelety se do použití dráhy nezapočítávají.
