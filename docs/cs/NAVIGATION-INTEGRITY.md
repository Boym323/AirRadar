# Integrita navigace V1

Integrita navigace AirRadaru je konzervativní vrstva situačního přehledu
postavená na existující ADS-B telemetrii. Nejde o oficiální síť pro monitoring
rušení GNSS a systém nedokazuje rušení, spoofing ani poruchu navigace letadla.

## Sémantika a původ dat

Kanonicým pozorováním je `NavigationIntegrityObservation`. NIC, NACp, NACv,
SIL, SDA, GVA a verze ADS-B zůstávají samostatnými hodnotami s možností
`null`. Nedostupné hodnoty zůstávají `null`; AirRadar nepřevádí kategorie ADS-B
na vymyšlená procenta. Do pozorování se přenáší existující původ a časová
čerstvost jednotlivých polí. Rozdíl mezi LOCAL a NETWORK zůstává zachován.

Pozorování vyžaduje platnou pozici, dostatečně čerstvou pozici a čerstvá data
integrity s omezeným časovým rozdílem. Pozemní cíle, neznámý původ, zastaralá
pole a neúplné dvojice se odmítají. Systém tak nespojí aktuální pozici se
starým hlášením integrity.

## Vzorkování a persistence

Živá služba vyhodnocuje soubor letadel nejvýše jednou za 15 sekund a regionální
detektor nejvýše jednou za 30 sekund. Persistence je řídká: řádek může vzniknout
při prvním pozorování, změně stavu/zdroje/pásma, významném pohybu nebo jako
heartbeat po 120 sekundách. Migrace přidává `NavigationIntegrityObservation` a
`NavigationIntegrityAnomaly` s omezenými časovými, letadlovými, buněčnými a
výškovými indexy. Surová pozorování jsou určena k retenci 30 dnů; pracovní sada
v procesu má limit a TTL úklid.

Migrace se do produkce nepouští automaticky. PostgreSQL je pro živý radar
volitelný; při jeho nedostupnosti diagnostika vrací nedostupné metriky jako
`null`, kde je to vhodné, a omezený detektor může dál pracovat v paměti procesu.

## Prostorový a výškový model

Pozorování se mapují do deterministických buněk 0,2° zeměpisné šířky/délky a do
pěti výškových pásem: 0–10 000 ft, 10 000–20 000 ft, 20 000–30 000 ft,
30 000–40 000 ft a 40 000 ft nebo více. Sousední zasažené buňky tvoří jeden
omezený region pouze ve stejném výškovém pásmu. Surová výška v pozorování zůstává.

### Kalibrace V1.1 a vysvětlitelnost

Každý kandidát nyní nese strojově čitelné důkazy: pravidla, aktuální a baseline
mediány, podíl nízké integrity, rozdíly, nezávislá letadla, okolní normální
letadla, zdroje, prostorovou a časovou koherenci a auditní kategorie. Stávající
vzorec confidence se nemění: MEDIUM může vzniknout bez zralé baseline, což se
výslovně označí jako `BASELINE_IMMATURE` a nepovažuje se za potvrzení příčiny.

Zralost baseline používá počet nezávislých letadel, počet vzorků a pokrytí
15minutových časových bucketů. `PARTIAL` začíná na 3 letadlech a 6 vzorcích,
`READY` vyžaduje 5 letadel, 20 vzorků a 3 buckety a `STRONG` 8 letadel, 20
vzorků a 6 bucketů. Samotný počet zpráv tedy nemůže baseline označit za silnou.

## Klasifikace a detektor

Stav letadla je `NORMAL`, `REDUCED`, `DEGRADED`, `SEVERE` nebo `UNKNOWN`.
Pravidla jsou průhledná a používají více původních polí; jedno nízké pole znamená
reduced, více nízkých ukazatelů degraded a severe vyžaduje silnější vícepolní
důkaz. Regionální kandidát vyžaduje nejméně tři nezávislá letadla, nikoli tři
zprávy jednoho letadla. Pět přispěvatelů je počáteční hranice pro medium
confidence a high confidence vyžaduje osm lokálně podpořených přispěvatelů,
trvání a připravenou baseline. Závažnost a confidence jsou oddělené.

Detektor používá omezené klouzavé okno, mediány buněk, počty letadel, počty
zdrojů a jednoduchou deterministickou baseline. Nepoužívá ML. Hystereze vyžaduje
dvě kvalifikující vyhodnocení pro otevření a tři normální vyhodnocení pro uzavření.
Kandidát je heuristická korelovaná navigační anomálie; nesmí se popisovat jako
„detekováno GPS rušení“.

Ochrana proti falešným poplachům zahrnuje odmítnutí starých dvojic, počítání
nezávislých letadel, rozlišení zdrojů, vyloučení pozemních cílů, odmítnutí
neplatných souřadnic, omezenou sousednost buněk a oddělení LOCAL/NETWORK. Síťová
pozorování se mohou účastnit, ale API ukazuje jejich původ a netvrdí, že je
přímo zachytil receiver AirRadaru.

## API

- `GET /api/navigation-integrity/current?window=5m|15m|30m|60m` vrací omezené
  souhrny buněk a důkazy aktivních anomálií. Výškové a zdrojové filtry se validují
  a časová okna jsou omezena.
- `GET /api/navigation-integrity/aircraft/:hex` vrací poslední omezené
  pozorování, čerstvost/původ, klasifikaci letadla a regionální kontext.
- `GET /api/navigation-integrity/history?from=&to=` vrací omezené anomální
  události, nikdy neomezený proud surových ADS-B vzorků.
- `GET /api/admin/navigation-integrity/diagnostics` vrací chráněné čítače,
  důvody odmítnutí, připravenost baseline a omezené paměťové indikátory.
- `GET /api/admin/navigation-integrity/candidates?window=15m&limit=20` vrací
  omezený chráněný přehled aktivních kandidátů a jejich strukturovaných důkazů.

## UI a omezení

Radar má volitelnou vrstvu Integrita navigace. Zobrazuje střídmé buňky v jantarové
nebo červené barvě a legendu pouze po zapnutí; normální a neznámá data nevytvářejí
barvu falešného poplachu. API vybraného letadla zahrnuje kontext integrity pro
plochy Situation/Data. Historické anomálie jsou pro Time Machine dostupné přes
omezené historické API.

Vrstva vychází z telemetrie integrity ADS-B, nikoli z oficiálního monitoringu
GNSS. Nedokáže určit příčinu korelované degradace, měřit RF podmínky ani rozlišit
všechny avionické, dekodérové, providerové nebo environmentální artefakty.
Korelace s počasím musí zůstat popisná a nesmí tvrdit příčinu.

## Retence a soukromí

Řídká surová pozorování jsou určena k retenci přibližně 30 dnů; agregované
anomální události mohou být uchovány déle. Veřejné projekce vracejí omezené
buňky a kontext letadla bez skrytých souřadnic receiveru a bez interních cest
filesystemu/databáze. Všechna časová okna, identifikátory a počty se validují a
omezují.

## Integrace s Digital Twin corridorem

Operational Digital Twin používá přímo už běžící process-local Navigation
Integrity service. Pro vybrané letadlo se aktivní regionální anomaly cells
protínají s budoucím vzorkovaným 30minutovým corridorem pouze tehdy, když
projektovaná výška patří do stejného Navigation Integrity altitude bandu.

Digital Twin zachovává severity, confidence, počet zasažených letadel,
LOCAL/NETWORK source evidence, baseline maturity a audit categories. Regionální
heuristika se nepřejmenovává na GNSS interference a nulový počet budoucích
průniků není all-clear.

Integrace nepřidává veřejný Navigation Integrity request, databázové
čtení/zápis, persistence ani polling loop.
