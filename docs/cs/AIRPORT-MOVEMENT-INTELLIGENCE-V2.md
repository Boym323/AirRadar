# Airport Movement Intelligence V2

Intelligence pohybů na letišti je omezený odhad na vyžádání nad existujícími
záznamy AirRadaru `Flight` a vzorkovanými `FlightPosition`. Nepřidává novou
databázovou tabulku ani migraci.

## Sémantika

Pozice, časové značky, výška, rychlost, track, vertikální rychlost, souřadnice
letiště a geometrie drah jsou pozorovaná data. `APPROACH`, `LANDING`,
`TAKEOFF`, `DEPARTURE`, `OVERFLIGHT` a `PROBABLE_RUNWAY` jsou
deterministické inference. UI používá formulace „pravděpodobný“ nebo „zřejmě“
a každý pohyb obsahuje lidsky čitelný důkaz a confidence `low`/`medium`/`high`.

Tyto výsledky nejsou ATC povolení, přidělená dráha, pokyn věže, naladěná
frekvence ani úplný záznam pohybů letiště.

## Omezení a úplnost

`GET /api/airports/[icao]/movements?period=today|24h|7d` nejprve vyhledá
nedávné vzorkované pozice v časově omezeném obalu 45 km kolem letiště, poté
vybere nejvýše 250 unikátních flight ID v pořadí podle nejnovější pozice a
provede jeden dávkový lookup metadat letů. Dotaz na pozice je omezen na
50 000 řádků a uchovává nejvýše 240 pozic na let. Odpověď uvádí
`complete: false` a `truncated: true`, kdykoli je dosaženo limitu; částečné
počty jsou dolní hranice. Běžný výchozí rozsah UI je 24 hodin.

Analyzátor provede jeden omezený dotaz na pozice a jeden dávkový dotaz na lety,
poté klasifikuje v paměti. Ignoruje neplatné časové značky/souřadnice a
potřebuje alespoň tři platná seřazená pozorování. Řídké nebo nejednoznačné
trajektorie nemusí vytvořit žádnou klasifikaci.

## Pravidla klasifikace

- Approach: klesající vzdálenost od letiště spolu s trendem klesání v
  realistickém letištním koridoru, bez požadavku na touchdown.
- Landing: approach, který dosáhne blízkosti prahu dráhy/letiště v malé výšce
  se sníženou nebo nízkou rychlostí. Jde o „pravděpodobné přistání“, protože
  vzorkovaná data přijímače mohou skončit před dosednutím.
- Takeoff: začátek blízko letiště v malé výšce následovaný stoupáním,
  zrychlením a pohybem směrem ven.
- Departure: odchozí stoupající provoz poprvé zachycený až po vzletu; první
  pozorovaný bod nemusí ležet na dráze.
- Overflight: vzdálenost nejprve klesá a následně roste, zatímco výška je
  neslučitelná s přistáním a k letišti není vázán trvalý vzorec stoupání/klesání.

## Pravděpodobná dráha

Konce drah se vyhodnocují nezávisle. Analyzátor kombinuje blízkost prahu s
relevantním pozorovaným trackem a používá nejkratší úhlový rozdíl, takže
reciproční headingy jako 359° a 001° jsou od sebe dva stupně. Dráha se vrátí
pouze tehdy, když skóre geometrie a tracku překročí limit a nejlepší kandidát
není prakticky shodný s jiným koncem dráhy. Paralelní nebo jinak
nejednoznačné dráhy proto vrátí žádnou pravděpodobnou dráhu místo vynucené
odpovědi. `OVERFLIGHT` má vždy `runway: null`, i když jeho track odpovídá
směru dráhy. Souhrny využití drah počítají pouze approach, landing, takeoff a
departure; přelety nezvyšují počet neznámých drah.

## Omezení

Přijímač může letadlo zachytit pozdě, ztratit před dosednutím, vzorkovat hrubě
nebo pozorovat nezdařené přiblížení. Počasí se nepoužívá k tvrzení kauzality;
porovnání dráhy a větru zůstává oddělené. Analyzátor je vysvětlitelný a
pravidlový, nikoli ML, a jeho diagnostika zveřejňuje pouze omezenou dobu
dotazu a počty řádků. Nevracejí se žádné soukromé souřadnice přijímače.

Hlavní mapa radaru zachovává stávající architekturu. Statické datové sady
letišť, ATC, ATS a volitelně vzdušného prostoru používají nezávislý omezený
retry stav, zachovávají last-known-good data, při cleanupu abortují a přehrají
nejnovější payload, když jsou MapLibre sources připraveny nebo znovu vytvořeny.
Airspace activity je pouze enrichment a nemůže potlačit základní ATC polygony.
