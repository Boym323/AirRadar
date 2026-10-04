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

## Airport Live Board V5

Detail letiště znovu používá 24hodinovou operations odpověď a existující
airport-weather odpověď v jediném page-scoped controlleru. Controller provádí
one-shot refresh každých 30 sekund. V3 dál sdílí jedinou existující `/api/stream` subscription mezi Live Boardem
a Nearby Aircraft. NOW inbound a NOW outbound jsou stále odvozené z čerstvých
ADS-B pozic existujícím konzervativním airport-traffic classifierem, řazené
podle vzdálenosti a omezené na šest letadel. Každý aktivní řádek se následně
v paměti koreluje s už načteným omezeným Airport Operations snapshotem.
Korelace se přijme pouze pro stejnou ICAO identitu, nekonfliktní callsign,
směrově kompatibilní movement a event vzdálený nejvýše 20 minut od live
pozorování s tolerancí dvou minut na clock skew. Poslední přílety a odlety zůstávají newest-first, deduplikované podle
Flight ID a omezené na šest řádků. GO_AROUND/HOLDING mají vlastní šestipoložkový provozní
lane. Přehled využití drah je omezený na čtyři řádky.

Při úspěšné korelaci aktivní řádek zpřístupní odpovídající Flight ID přes
Flight Story a zobrazí poslední kompatibilní movement, runway, confidence a čas
eventu. Chybějící, stale nebo konfliktní evidence zůstává pouze LIVE a nic se
nedohaduje. V4 nad touto evidencí přidává vysvětlitelný aktivní journey stav:
INBOUND, HOLDING, APPROACH, FINAL, LANDED, GO_AROUND, INITIAL_CLIMB nebo OUTBOUND.
FINAL vyžaduje čerstvý korelovaný APPROACH, live vzdálenost <=8 km a vertical
rate <=-150 fpm. LANDED vyžaduje čerstvý korelovaný LANDING a současně live
on-ground observation, takže nesouvisející stojící letadla se do aktivního
arrival lane nikdy nepovýší. Route metadata se hodnotí odděleně jako CONFIRMED, UNKNOWN
nebo CONFLICT a nikdy nepřepisují pozorovaný pohyb. V5 přidává omezený NOW Flow Pulse počítaný čistě z aktivních journey řádků: inbound, final, holding, outbound, go-around a route-conflict počty plus attention seznam nejvýše šesti položek. Attention se řadí deterministicky GO_AROUND → HOLDING → route conflict a potom podle vzdálenosti. Normální provoz — včetně LANDED řádků — je z attention záměrně vynechaný. Board zároveň znovu používá stejný METAR pro kategorii letu, vítr, dohlednost,
teplotu a QNH. Jde o pozorovací pohled přijímače a počasí, nikoli letištní
letový řád, FIDS, přidělení dráhy nebo instrukce ATC.

## Airport Live Board V6

V6 zachovává NOW Flow Pulse z V5 a nad stejnými sdílenými daty přidává druhou
čistou projekci: Flow Trend / Pressure. Porovnává receiver-inferred příletové a
odletové pohyby za posledních 15 minut s předchozími 15 minutami. Rozdíl
jediného pohybu zůstává STABILNÍ; stav ROSTE nebo KLESÁ vyžaduje rozdíl alespoň
dvou pohybů, aby se omezilo kolísání při nízkém provozu.

Holding se počítá za aktuálních 15 minut a go-aroundy v 30minutovém exception
okně. Pressure level je omezené deterministické skóre nad aktuálním snapshotem
inbound, outbound, final, holding, go-around a route conflict plus
konzervativními bonusy za zřetelně rostoucí příletový nebo odletový tok. Jde o
pozorovací ukazatel toku, nikoli metriku kapacity letiště, zpoždění, bezpečnosti
nebo ATC.

Konzistence dráhy se vyhodnocuje z runway evidence posledních 30 minut. Jsou
potřeba alespoň tři vzorky; STABILNÍ evidence vyžaduje, aby jedna dráha tvořila
alespoň 75 procent vzorků. Jinak je výsledek SMÍŠENÝ nebo NEURČENÝ. V6
nepřidává nový request, stream, databázovou tabulku ani persistence write path.

## Airport Live Board V7

V7 zachovává Flow Trend / Pressure z V6 a přidává Runway Flow / Stability jako
další čistou projekci nad stejným omezeným operations snapshotem. Porovnává
pohyby s runway evidencí za posledních 15 minut s předchozím 15minutovým oknem.
Každý let přispěje v jednom okně nejvýše jedním runway vzorkem podle svého
nejnovějšího pohybu s runway evidencí.

Stav runway flow je záměrně konzervativní. STABILNÍ vyžaduje nejméně tři vzorky
v obou oknech, stejnou dominantní dráhu a alespoň 75% podíl této dráhy v každém
okně. PŘECHOD vyžaduje nejméně tři vzorky v obou oknech, změnu dominantní dráhy
a alespoň 60% podíl předchozí i nové dominantní dráhy. Jinak je výsledek SMÍŠENÁ
EVIDENCE nebo MÁLO DAT.

Panel zvlášť ukazuje aktuální runway evidenci příletů a odletů, počet reported
versus inferred runway vzorků a porovnání s dráhou zvýhodněnou aktuálním větrem,
pokud je aktuální evidence dostatečně silná. Přechod znamená změnu omezené
receiverové evidence, nikoli potvrzení změny konfigurace letiště nebo pokyn ATC.
V7 nepřidává nový request, EventSource, API route, databázovou tabulku ani
persistence write path.

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


### V7 Arrival Sequence

V7 runway-flow panel doplňuje omezené pořadí aktivních příletů ze stejného
živého receiverového snapshotu. Nejvýše šest approaching letadel se odešle
jedním batch requestem na existující `GET /api/operations/predictive?hexes=`.
Request používá existující 30s refresh token letištního controlleru, takže
nevzniká další EventSource ani druhý periodický timer.

Z predikční odpovědi se kopírují pouze readiness-gated PUBLIC ETA a runway
advisories; admin preview se zahazuje. Přílet s CONFIRMED route zůstává viditelný
i bez predikce. UNKNOWN route vstoupí do pořadí jen tehdy, když PUBLIC prediction
destination odpovídá ICAO aktuálního boardu. Predikční ETA/runway se rovněž
použijí pouze při této shodě destination.

Řádky s PUBLIC ETA se řadí první, ostatní deterministicky podle journey stage a
vzdálenosti. Panel ukazuje kalibrovanou nejistotu ETA, medián rozestupu
dostupných ETA, stabilitu predikované dráhy a existující pozorovaný V7 runway
flow. Jde o receiver/prediction intelligence, nikoli ATC pořadí nebo FIDS.

### V8 Approach Queue Intelligence

V8 zachovává V7 arrival sequence beze změny a nad jeho už filtrovanými řádky
odvozuje jediný další omezený in-memory signál hustoty. Počítá aktivní přílety,
stavy APPROACH/FINAL a HOLDING, pokrytí PUBLIC ETA, sousední ETA rozestupy a
medián/minimum ETA rozestupu. V8 nepřidává žádného nového kandidáta, route
rozhodnutí, predikci ani runway hodnotu.

Stav je záměrně popisný, nikoli provozní. EMPTY a LOW_DENSITY pokrývají řídké
snapshoty, ACTIVE běžný provoz více letadel, BUILDING vyžaduje nejméně čtyři
přílety a další potvrzující hustotu, COMPRESSED vyžaduje nejméně tři PUBLIC ETA
vzorky a alespoň dvě sousední ETA mezery nejvýše čtyři minuty a
HOLDING_PRESENT vyžaduje nejméně dvě letadla v holdingu v omezeném pořadí.
Jde o AirRadar receiver/prediction-density labely, nikoli ATC pořadí,
separační minima, kapacitu letiště, zpoždění nebo bezpečnostní hodnocení.

V8 nepřidává nový fetch, timer, EventSource, API route, databázové čtení/zápis,
migraci ani persistence path nad existující vstupy V7 arrival sequence.

