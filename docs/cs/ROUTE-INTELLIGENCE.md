# Route Intelligence

Route Intelligence porovnává metadata trasy již připojená k živému letadlu s
publikovaným českým dokumentem ATS tratí. Jde o interpretaci dostupných
route metadat letadla vůči publikované ATS síti. Není to ATC povolení a nesmí
se to vykládat jako aktuální provozní dostupnost airway.

Dopředně kompatibilní doménové kontrakty V2 jsou zdokumentovány v
[ROUTE-INTELLIGENCE-V2-CONTRACTS.md](ROUTE-INTELLIGENCE-V2-CONTRACTS.md).

## Zdroje a hranice

Aircraft strana používá pouze existující enrichment:

- `FlightPlan.filedRoute`, je-li přítomno;
- `FlightPlan.waypoints` jako fallback, pokud neexistuje filed route text;
- existující provider source (`FlightAware`, `ADSBDB`, demo nebo jiný
  nakonfigurovaný zdroj).

Autoritativní ATS strana používá file-backed dokument
`lib/ats/cz-routes.ts`, včetně jeho effective date, route designatorů, bodů,
segmentů a explicitních discontinuities. Route Intelligence nezapisuje do
PostgreSQL.

Route Corridor Intelligence V1 může navíc pro právě vybrané letadlo použít
existující server-side provider Aviation Weather Center k omezenému lookupu
přesných identifikátorů NAVAID/FIX. Tyto referenční souřadnice mohou vyřešit
pouze endpointy filed nebo DCT spojnic. Nikdy nenahrazují publikovanou ATS ani
procedure geometrii a jejich provenance zůstává explicitní.

## Tokenizer a matching

Tokenizer rozpoznává `WAYPOINT`, `AIRWAY`, `DCT` a `UNKNOWN`. Airway
se identifikuje podle publikovaného ATS designátoru nebo konzervativní airway
syntaxe používané projektem. Běžné pouze písmenové názvy fix/navaid se přijímají
jako waypoint kandidáti; nepodporovaná syntaxe zůstává unresolved. Airway token
se nikdy nepovažuje za waypoint.

Waypoint matching vyžaduje přesný uppercase název. Duplicitní názvy se neřeší
výběrem prvního výsledku: route context musí kandidáta rozlišit, jinak leg
zůstává unresolved.

Explicitní airway designátor povoluje omezenou graph traversal pouze uvnitř
daného publikovaného route designátoru. Traversal používá existující
publikované segmenty, vyhýbá se smyčkám a zastavuje na discontinuities.
Direct leg se nenahrazuje nefiled airway cestou. `DCT` je direct leg a je
vyloučen z ATS coverage. Reverzní průchod publikovaného segmentu je podporován
a zachovává směr filed route.

## Dynamická pozice

Statická analýza trasy se cacheuje v omezené in-memory cache podle tvaru trasy,
route tokenů a ATS effective date. Aktualizace živé pozice počítají pouze
blízkost segmentu, along-track progress, kompatibilitu headingu, vzdálenost k
dalšímu waypointu a cross-track deviation.

Cross-track vzdálenost používá sférickou great-circle geometrii, nikoli
aproximaci stupňů latitude/longitude. Výchozí maximální cross-track threshold
je `25 NM`; lze jej přepsat server-side přes
`ROUTE_INTELLIGENCE_MAX_XTRACK_NM` nebo pro browser výpočet přes
`NEXT_PUBLIC_ROUTE_INTELLIGENCE_MAX_XTRACK_NM`. Mimo threshold se žádný
aktuální ATS segment netvrdí. Heading je pouze confidence/ordering faktor a
nikdy jediná matching podmínka.

## Coverage a stavy

Coverage je:

```text
matched ATS-eligible route legs / ATS-eligible route legs × 100
```

Airport tokeny, explicitní DCT legs a nepodporovaná syntaxe se nepočítají jako
selhané ATS legs. Multi-segment traversal na jednom filed airway leg se počítá
jako jeden eligible leg. `MATCHED` znamená, že každý eligible leg byl
spolehlivě namapován; `PARTIAL`, že jen některé; `UNRESOLVED`, že žádný ATS
segment nebyl spolehlivě namapován. Chybějící route data vrací `NO_ROUTE`;
chybějící ATS dokument vrací `NO_ATS_DATA`.

Progress view je seřazen podle filed route: dokončené segmenty, aktuální
segment a zbývající segmenty. Segment se neoznačí jako dokončený jen proto, že
je nejbližší; completion vyžaduje geometrický postup za jeho endpoint v rámci
stejného thresholdu.

## Dostupnost a omezení

ATS `availabilityStatus` zůstává `UNKNOWN`. Route Intelligence neodvozuje
live CDR availability, NOTAM uzávěry, SID/STAR procedures, runway assignment,
ATC clearance, trajectory ani operational activation. Mezinárodní části mimo
načtená publikovaná ATS data zůstávají unresolved, pokud nelze oba endpointy
filed spojnice jednoznačně vyřešit omezeným lookupem referenčních bodů. Taková
fallback geometrie je explicitně `FILED_ROUTE` / `SCHEMATIC`, nikoli
publikovaná ATS geometrie. Aircraft route source, ATS source/effective date a
referenční provenance zůstávají oddělené.

Terminal procedures jsou samostatná hranice statického ingestu.
`lib/procedures` konzumuje sdílené kontrakty `Procedure` a
`npm run procedures:sync` vytváří validovaný lokální artefakt používaný
runtime repository a omezenými lookupy `/api/procedures`. Aircraft display
kód nikdy nenačítá eAIP source.

Selected-aircraft flow načítá pouze origin SID a destination STAR sety přes
omezené procedure API. Statická V2 analýza používá 128položkovou cache
klíčovanou trasou, airport contextem, ATS effective date, procedure
identity/version a relevantním runway contextem. Dynamická analýza potom
používá aktuální pozici, track a altitude bez znovusestavení statické trasy.
Chybějící procedures, ATS data nebo runway context vytvářejí explicitní
degraded states.

## Route Corridor Intelligence V1

Route Corridor Intelligence je additivní selected-aircraft projekce nad
existující Route Intelligence V2 trasou a dynamickým stavem. Nevytváří druhou
autoritu trasy ani další stream živých letadel.

Pokud má vybrané letadlo filed route, browser vybere maximálně 24 kandidátních
identifikátorů waypointů a provede jeden omezený request přes existující
same-origin endpoint `/api/navigation/data?ids=...`. Server sadu rozdělí do
dávek po maximálně osmi identifikátorech a znovu používá existující AWC cache,
in-flight coalescing a upstream request budget. Nevzniká timer, background
poller, databázový zápis ani další EventSource.

Publikovaná ATS a SID/STAR geometrie má vždy přednost. Pokud filed leg nelze
rekonstruovat z publikované ATS sítě, ale oba endpointy lze jednoznačně vyřešit
z referenčního datasetu, V1 může vykreslit schematickou `FILED_ROUTE` spojnici.
Nejednoznačné shody nebo body bez souřadnic zůstávají unresolved.

Corridor projekce používá existující V2 great-circle dynamický engine a
zobrazuje průběh trasy, další fix, ETA podle aktuální groundspeed, zbývající
vzdálenost přes vyřešenou geometrii, cross-track odchylku, očekávaný track
segmentu, rozdíl vůči pozorovanému tracku a confidence rekonstrukce. Zbývající
vzdálenost je explicitně označena jako částečná, pokud část geometrie zůstává
unresolved.

Live mapa vykresluje rekonstruovanou geometrii jako proletěnou, aktuální a
zbývající část. Pokud použitelný corridor neexistuje, zůstává fallback původní
vizualizace origin-current-destination.

Stav `DEVIATING` používá záměrně hysterézi. Cross-track odchylka nad 10 NM musí
být přítomná ve třech různých pozorováních během alespoň 10 sekund. Návrat
vyžaduje dvě pozorování během alespoň pěti sekund. Jednorázová odchylka je pouze
`OFFSET`. Jde o produktové zobrazovací thresholdy, nikoli navigační limity ani
ATC/bezpečnostní hodnocení.

V1 je pouze display/on-demand intelligence. Route deviation eventy se
nepersistují do Flight Intelligence a funkce netvrdí ATC clearance,
certifikované navigační vedení ani provozní dodržení trasy.
