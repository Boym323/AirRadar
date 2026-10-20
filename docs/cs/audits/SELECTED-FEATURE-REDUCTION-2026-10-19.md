# Redukce vybraných funkcí — etapa 1 (2026-10-19)

Tato změna je **první nedokončená etapa a nesmí se automaticky vydávat za kompletní odstranění všech funkcí**.
Závazným podkladem pro ID funkcí k zachování a odstranění je výslovný výběr uživatele v
konverzaci ChatGPT ze dne 19. října 2026.

## Co bylo v první etapě odstraněno
- 21 samostatných uživatelských stránek: procházení historie, Flight Story,
  Time Machine, porovnávání, Flight Intelligence, provozní dashboard, procedury,
  detail ATC sektorů, watchlist, upozornění, flotily a oznámení, vybraná
  administrace a kalibrační stránka Digital Twin.
- Odkazy na tyto stránky z hlavního menu, mobilní navigace, mapové lišty a příkazové nabídky.
- Neaktuální záznamy stránek v registru funkcí a jeho generované dokumentaci.
- Serverová API se v této etapě zatím neodstraňovala.

## Povinné závislosti zachovaných funkcí a rozpory ve výběru
- **H07 + H14 + S02/S06/S07/S08/S09** potřebují některé historické databázové
  agregace, vzorkované pozice nebo záznamy Flight, i když byly jejich historické stránky odstraněny.
  Tabulky ani historická data se nesmějí mazat.
- **R17** potřebuje minimální publikovanou geometrii sektorů ATC, i když T01–T07
  byly vyřazeny. Z mapové vrstvy se nesmějí odstranit její společné datové podklady.
- **R11** vyžaduje jednoduché zobrazení pozorované nebo rozpoznané trasy,
  nikoli plný letový plán a analytický predikční subsystém.
- **L11 + L12** ponechávají transport Web Push a Pushover, ale ruší editor
  pravidel a historickou analytiku alertů. Spouštění oznámení je nutné znovu
  definovat; nesmí se potichu vypnout ani nahradit neodsouhlasenou automatizací.
- **W01/W02/W03/W04/W06/W07/W08/W09** zůstávají; vítr, Weather Fusion, historické
  mapové archivy, počasí na trase i predikční koridor byly vyřazeny.
- **T08/T09/T10** zachovávají referenční data ATS a NAVAID/FIX nezávisle na
  odstraněných modelech letových plánů.
- **E07/E09** zachovávají RXW metadata a FlightAware, ale nevyžadují H1/FPN
  waypoint vrstvu ani plné uživatelské rozhraní letového plánu.
- **J09** zachovává vzorkovanou historii. Destruktivní migrace či smazání dat jsou zakázány.

## Ověření a další kroky
1. Ověřit registr funkcí, TypeScript, ESLint, úplný Vitest, build a prohlížečové testy.
   Před sloučením upravit zastaralé testy odkazů a snímků obrazovek.
2. Upravit serverové výsledky vyhledávání, které dosud odkazují na odstraněné stránky
   letů nebo detailů ATC sektorů; nezavádět zavádějící přesměrování.
3. Každou vyřazenou serverovou funkci odstranit až po kontrole grafu importů,
   volajících a datových smluv. Potom odstranit osiřelé komponenty, skripty,
   konfigurace, lokalizace a zastaralé testy. Společné moduly musí zůstat.
4. Neprovádět produkční nasazení, dokud nebude CI zelené a nebudou prověřeni
   externí uživatelé API. Po vydání ověřit verzi a stav produkce.
   Nikdy nepoužívat destruktivní databázové migrace.

## Fáze 2 (rozpracováno): odstranění živé H1/FPN mapové vrstvy

Zachovaná integrace RXW Hubu E07 pro technická metadata zůstává beze změn. Zamítnutá E08 již v živém radaru neregistruje H1/FPN vrstvy MapLibre ani neprovádí pravidelné dotazy na waypointy (60 s) a trasu vybraného letadla (30 s). Test hlídá odstranění importů, mapových vrstev i dotazů v živém radaru. Živý parser H1/FPN, API dostupnosti a cache byly v navazujícím commitu odstraněny; historické záznamy a jejich validace zůstávají čitelné. PR neprovádí databázovou migraci ani produkční nasazení.

Panel metadat RXW v detailu letadla už nezobrazuje H1/FPN seznam waypointů. Technická metadata komunikace a strukturovaná informace o trase z RXW (E07) zůstávají dostupné. Parsování a kompatibilita historických záznamů zatím zůstávají pro pozdější bezpečné vyřazení E08 na serveru.

Odstraněn byl také osiřelý historický vykreslovač ACARS/FPN pro MapLibre a
nenapojené uživatelské rozhraní, styly i překlady. **Nejde o mazání uložené
historie RXW:** soubor `lib/server/rxw-route-history.ts`, jeho validovaný
dekodér historických záznamů, migrace a data zůstávají nedotčené.

## Fáze 3 (rozpracováno): odstranění osiřelých UI modulů

Po odstranění jejich vstupních stránek byly vyřazeny samostatné komponenty průzkumníku procedur, ATC průzkumníku a porovnání letišť včetně vlastních CSS. Samostatný prohlížeč NAVAID/ATS, geometrie ATC sektorů pro mapu, katalog i detail letiště a referenční importní procesy zůstávají zachovány. Regresní test brání návratu odstraněných komponent. Bez změny schématu a bez mazání historie.

## Fáze 4 (rozpracováno): úklid odkazů na zrušené stránky

Sdílený pomocník pro vyšetřovací odkazy nyní zachovává jen ověřování záložek pro Navigation Integrity a NAVAID/ATS používaných v ponechaném UI. Odstraněny jsou parsování a generování parametrů pro zrušený ATC průzkumník, porovnání letů a letišť, procedury SID/STAR a historii sektorů včetně nepoužívaných typů a validací. Regresní test hlídá zachované i odstraněné exporty. Beze změny API, databáze, historických dat a příjmu provozu.

## Fáze 5 (rozpracováno): vypnutí dotazů odstraněných funkcí

Hook kontextu vybraného letadla již nedotazuje Flight Intelligence ani inteligenci počasí na trase (dříve při výběru a každých 120 sekund). Odstraněny jsou sekce rychlého detailu, předávané parametry a OD route-weather panel. ATC kontext, SIGMET a Navigation Integrity zůstávají zachovány. Souhrn situace zůstává dočasně do samostatného auditu závislostí; tento patch nevypíná serverové výpočty.

## Fáze 6 (rozpracováno): odstranění souhrnu Flight Intelligence z detailu letadla

Z rychlého detailu vybraného letadla byl odstraněn nepožadovaný syntetizovaný souhrn letové situace a související UI adaptér. Samostatný kontext ATC, SIGMET a údaje o integritě navigace zůstávají zachovány. Sdílená analytická knihovna ani historická pozorování nebyla odstraněna; ta vyžadují samostatný audit serverových závislostí.

## Fáze 7a (rozpracováno): ukončení dotazů Digital Twin pro vybrané letadlo

Z hooku detailu letadla byla odstraněna nepožadovaná HTTP smyčka Digital Twin po 60 sekundách, stav rozdílů priorit a cache snímků. Do následného odstranění mapových komponent zůstává pouze typově definovaná `null` kompatibilita, takže se nenačítají ani nezobrazují zastaralé predikce. Historická data a serverové zpracování zůstávají do samostatného auditu vazeb.

## Fáze 7b (rozpracováno): odstranění mapových vrstev Digital Twin a Operational Focus

Po vypnutí dotazování vybraného letadla byly vyřazeny predikční vrstvy Digital Twin, čáry a body Operational Focus, mapové události, automatické přiblížení, URL akce, legenda a již nepoužívaná sekce v detailu letadla. Výběr letadla, jeho stopa, ATC/ATS, SIGMET a Navigation Integrity zůstávají zachovány. Zbylé serverové knihovny a dočasný typový null výstup Digital Twin čekají na samostatný audit závislostí; bez migrací databáze a změn produkce.

## Fáze 8 (rozpracováno): odstranění živého Weather Avoidance a panelu

Nevyžadovaná klasifikace W11 Weather Avoidance se již nepočítá při výběru/vykreslení letadla, nepředává se přes komponenty detailu ani se nezobrazuje. SIGMET pro letadlo (W06), samostatný zjištěný kontext odchylky trajektorie a Navigation Integrity zůstávají zachovány. Čistá analytická knihovna a její unit testy zůstávají do samostatného auditu serverových importů. Bez změn historie, databázového schématu, příjmu dat a produkce.

## Fáze 9 (rozpracováno): odstranění regionálních mapových vrstev Digital Twin

Odstraněn osiřelý mapový zdroj Regional Attention, vrstvy čar/letadel, klientský posluchač a přepočítávání GeoJSON při snímcích provozu. Běžná stopa letadel, ATC i mapové informace Navigation Integrity jsou zachovány. Čistá knihovna Regional Attention zůstává do auditu všech producentů událostí a serverových konzumentů; bez zásahů do databázové historie či produkce.

## Fáze 10 (rozpracováno): odstranění panelů predikcí a Digital Twin z detailu letadla

Z ponechaného detailu letadla byly odpojeny komponenty PredictiveAircraftAdvisories a AircraftOperationalTwin. Prohlížeč už z této stránky neposílá jejich požadavky na zrušená API predikcí a situace. Fotografie letadla, telemetrie ADS-B, historický výškový graf, kontext přijímače a běžná metadata zůstávají zachovány. UI soubory, serverová API, historická kalibrační data i výpočtové moduly dočasně zůstávají kvůli auditu vazeb a retence dat. Testy brání opětovnému připojení panelů.

## Fáze 11 (rozpracováno): odstranění panelu W10 Weather Fusion z detailu letadla

Odpojením komponenty ze zachovaného detailu letadla se již automaticky nedotazuje vyřazený endpoint W10 Aviation Weather Fusion. Zachovaný ATC kontext, METAR/SIGMET, pozorovaná data počasí BDS 4.4, historický graf výšky i telemetrie ADS-B zůstávají. Samostatná knihovna/panel/API a historie zatím nejsou mazány kvůli auditu importů a retence; regresní test hlídá, že se panel nevrátí.

## Fáze 12 (rozpracováno): odpojení počasí na trase z detailu letadla

Zachovaný detail letadla již nevykresluje komponentu FlightRouteWeather pro počasí na počátečním/cílovém letišti. Odpovídající klientský požadavek odpadá; přitom zůstávají informace o trase, METAR/TAF letišť, SIGMET a historický graf výšky. Opraven také starý test vizuálu, který vyžadoval odstraněné panely PredictiveAircraftAdvisories a Digital Twin. Moduly poskytovatelů počasí, API a historická data beze změn.

## Fáze 13 (rozpracováno): odstranění osiřelého klientského panelu predikcí

Po odpojení ze zachovaného detailu letadla byly odstraněny soubory `components/predictive-aircraft-advisories.tsx` a příslušné CSS. Serverová API a výpočetní knihovny predikcí i jejich testy zůstávají do auditu sdílených vazeb a zachování historických dat. Testy již neověřují časovače zrušeného panelu, ale jeho nepřítomnost. Bez destruktivních migrací a nasazení produkce.

## Fáze 14 (rozpracováno): smazání osiřelého klienta Digital Twin a starého UI testu

Odstraněny `components/aircraft-operational-twin.tsx`, příslušné CSS a test určený výhradně pro odstraněné UI Operational Focus. Navigační integrita, výšková historie a ATC vrstvy zůstávají. Serverové API s rate limitingem, analytické knihovny, historická pozorování a serverové testy zůstávají do bezpečného auditu závislostí a persistence. Regresní testy ověřují nepřítomnost zrušeného panelu.

## Fáze 15 (rozpracováno): odstranění osiřelého panelu W10 Weather Fusion

Smazána odpojená komponenta `components/aircraft-weather-fusion.tsx`; testy už nevyžadují její UI, ale kontrolují nepřítomnost. Zachována API rozhraní poskytovatelů METAR/SIGMET, pozorování BDS 4.4, běžná telemetrie a serverové testy. Výpočetní knihovny a serverové API zůstávají do auditu importů a historie; bez mazání dat.

## Fáze 16 (rozpracováno): odstranění nepotřebného analytického modulu W11 Weather Avoidance

Po odstranění W11 z živého radaru a detailu SIGMET smazána osamocená čistá knihovna `lib/weather/avoidance-intelligence.ts` a její scénářové testy. Samostatný výpočet zjištěné odchylky trajektorie, SIGMET (W06), METAR/TAF a profil počasí letadla zůstávají zachovány. Historie, API a databáze nebyly měněny; případné zbývající importy ověří TypeScript a build v CI.

## Fáze 17 (rozpracováno): odstranění osiřelých komponent Operational Focus

Po odstranění posledních živých konzumentů byly smazány mapová karta Operational Focus, souhrn v panelu detailu a jejich samostatná CSS. Ponechány jsou skutečná telemetrie letadel, ATC vrstvy a Navigation Integrity. Backend výsledky, historická data a hodnoticí moduly zůstávají do samostatného auditu serverových závislostí. Regresní test hlídá, že se odstraněné UI nevrátí.

## Fáze 12 (rozpracováno): oprava CI po odstranění UI predikcí a Digital Twin

Zrušen zastaralý test pouze odstraněné predikční časové osy a upraveny tři zbývající testovací soubory tak, aby neimportovaly smazané komponenty PredictiveAircraftAdvisories/AircraftOperationalTwin. Kontroly stávajícího seznamu povolených serverových podkladů predikcí a ochrany kalibrace Digital Twin zůstávají do auditu závislostí API a uložených dat. Lokalizační test už nevyžaduje text ve smazaném UI. Nový regresní test hlídá nepřítomnost odstraněných panelů a starého testu. Bez změn DB.

## Fáze 13 (rozpracováno): odstranění nedostupných předpovědí Digital Twin z režimu sledování

Flight Follow zůstává dostupný včetně identity, živé telemetrie výšky/rychlosti/vertikálního pohybu, známého cíle, kontextu dalšího bodu trasy, tlačítka sledování a zmenšeného režimu panelu. Odstraněn je vždy prázdný parametr Digital Twin i již nefunkční zobrazování prediktivního ETA, dráhy a počasí. Žádné nové dotazy, změny databáze ani migrace. Testy hlídají zachované sledování a nepřítomnost zrušených predikcí.

## Fáze 14 (rozpracováno): odstranění osiřelého mapového projektoru Regional Attention

Vyřazena nepotřebná knihovna `lib/operational-twin/regional-attention-ui.ts` a její test mapového zobrazení, protože radar již nemá související posluchače ani GeoJSON zdroje. Validátory historických Regional Attention výsledků, kalibrační logika a uložená data zůstávají beze změn; nejde o migraci serveru. Regresní test hlídá nepřítomnost mapového projektoru bez ztráty historických výsledků.

## Fáze 12 (rozpracováno): odstranění kompatibilního rozhraní Digital Twin

Hook kontextu vybraného letadla nyní vrací pouze zachovaný výsledek ATC. Byly odstraněny dočasné prázdné položky Digital Twin a Operational Focus i související typové importy, protože je již nepoužívá mapa, sledování letu ani detail. Regresní testy zachovávají ATC kontext a hlídají, aby se zrušené typy nevrátily. Historická data a serverová API se nemění.

## Fáze 18 (postupně): odstranění nevyužívaných veřejných API

Odstraněno osm endpointů pro vyřazené funkce Time Machine, Flight Intelligence,
Operations, počasí na trase letadla a Weather Fusion. Zachovány jsou databázové
historické záznamy, archivované výsledky, ingestní služby, meteorologické zdroje,
Navigation Integrity, výškový profil letadel a potřebná ATC geometrie.
Neprovádí se žádná změna schématu databáze ani nasazení do produkce.

## Fáze 19 (postupně): odstranění SSE endpointu Flight Intelligence

Po odstranění klientského rozhraní byl odstraněn samostatný SSE endpoint
Flight Intelligence a jeho izolovaný test. Sdílený SSE kapacitní manažer a
streamy živého radaru, OGN a systému zůstávají. Uložená historie FlightEvent
se nemaže; zbylé runtime producenty je nutné auditovat kvůli závislostem
notifikací a perzistence. Registr funkcí a tabulky EN/CS byly synchronizovány.

## Fáze 20 (postupně): odstranění R13 značky přijímače a kružnic dosahu

Odstraněna veřejná značka přijímače, kružnice dosahu, přepínač vrstvy,
volba v mapových presetech, pomocný modul a příslušné testy. Interní souřadnice
přijímače zůstávají pro okolní letiště a počáteční vycentrování mapy.
Dříve uložené presety jsou kompatibilní a zastaralou volbu zahazují.

## Fáze 21 (postupně): úprava testů po odstranění veřejných API

Zastaralá testovací očekávání pro regionální Operations, prediktivní přehled
a Weather Fusion nahrazena kontrolami nepřítomnosti zrušených API.
Zůstávají testy interních serializátorů, anonymních uložených výsledků
a nezávislých meteorologických zdrojů do úplného auditu závislostí.
Odstraněná API se kvůli starým testům znovu nezavádějí.

## Fáze 22 (postupně): odstranění T11 SID/STAR z klienta a veřejného API

Odstraněny přepínače mapových vrstev SID/STAR, veřejné API `/api/procedures`,
mapové vrstvy, jejich načítání a osamocený generátor geometrie. Zachovány
jsou ATS trasy, navigační body NAVAID/FIX a ostatní vybrané mapové vrstvy.
Staré uložené presety při načtení zahodí volby `showSids` a `showStars`.
Čisté parsovací a repozitářové moduly zůstávají do dalšího auditu závislostí.

## Fáze 23 (postupně): odstranění API letištního provozu a seznamu historických letů

Zrušena tři veřejná API letištního provozu (A03–A12) a API pro seznam
historických letů a detail Flight Story (H05–H09). Zachovány seznam a detail
letišť, detail aktuálního letadla, `/api/history/:hex`, statistické služby
i uložené záznamy Flight/FlightPosition. Sdílené serverové funkce zůstávají
do auditu volajících a databázových zápisů. Bez migrací a mazání dat.
Po nasazení budou vyřazené veřejné adresy vracet HTTP 404.

## Fáze 24 (postupně): odstranění T12 AUP/UUP mapy a API

Odstraněna veřejná API aktuálních a historických AUP/UUP, mapový dotazovací
hook, přepínače, uložené volby a vrstvy plánovaných aktivací. Publikovaná
geometrie ATC sektorů, vysílače, ATS trasy a navigační zdroje zůstávají.
Historické archivy, databázové záznamy a sdílené ATC informace se nemění.
Bez migrací a mazání dat.

## Fáze 25 (postupně): odstranění T02–T07 API provozu a diagnostiky ATC

Zrušena veřejná API historie sektorů, provozu, přechodů a validace predikcí ATC.
Zachována publikovaná data sektorů potřebná pro mapu, ATS trasy, kontext
letadel i uložené historické údaje. Odstraněny izolované testy rate limitů
starých endpointů; společné testy zůstávají. Bez změn databáze a migrací.

## Fáze 26 (postupně): integrace nové mapové architektury z main

Převzata extrakce základních mapových vrstev z aktuálního main bc2f5fc17277.
Nový modul úmyslně neobnovuje odstraněné kružnice R13 ani SID/STAR T11.
Zachovány ATS trasy, navigační body, meteorologický radar a Navigation Integrity.
Changelog a historická metrika kódu pocházejí z main; po dokončení CI je nutné
vygenerovat nové metriky aktuální redukované větve.

## Fáze 27 (postupně): aktualizace release kontrol zachovaných funkcí

Testy odstraněných stránek Time Machine, Historie, Watchlist a Operations
nahrazeny kontrolami letišť, navigace, Navigation Integrity, počasí, systému a
přijímače. Odstraněné stránky musí vracet HTTP 404. Zachovány testy mobilního
rozložení, jazyků, detailu letadla a mapových vizuálů. Opraveny kontroly starého
AUP/UUP hooku a presetů. Bez úspěšného CI není možné nasadit produkci.

## Fáze 28 (postupně): synchronizace vizuálních release kontrol

Z plánovače release odstraněny neexistující screenshoty letištních Live Boardů,
predikčních panelů, Watchlistu, Notification Center a Operations Dashboardu.
Zachovány kontroly živé mapy, letišť, detailu letadla, počasí, přijímače a
systému. Změny zrušených oblastí spouštějí plnou kontrolu místo odkazu na
neexistující screenshot. Produkce zůstává nezměněna.

## Fáze 22 (postupně): oprava release-preview kontrol po odstranění funkcí

Zastaralá očekávání testů byla upravena pro odstraněné Operations, Historii,
Intelligence a značku přijímače. Prohlížečový smoke nadále ověřuje skutečná
kliknutí: mobilní odkaz na Letiště, návrat na desktop pro jazykové kontroly
a zachovanou Navigaci v mobilním menu Více. Odstraněné API se neobnovuje.

## Fáze 29 (postupně): odstranění automatického vzorkování Digital Twin

Ze zpracování živých dat odstraněn automatický minutový výběr letadla pro
Digital Twin. Při výběru se procházela a třídila celá mapa letadel a volal se
výpočet situační projekce. Další perzistence dříve uložených výsledků,
bezpečné ukončení, historie, statistiky přijímače a Navigation Integrity
zůstávají zachovány. Ostatní pozorovatele predikcí je ještě nutné samostatně
prověřit. Kontrola rozložení nyní odpovídá čtyřem zachovaným akcím detailu
letadla; ochrana před limitací stále existujícího API zůstává aktivní.

## Fáze 30 (postupně): úprava testu odstraněného kalibračního časovače

Testy Digital Twin Event Outcome nyní kontrolují, že samostatné periodické
vzorkování již neexistuje. Zůstává kontrola požadované perzistence, bezpečného
ukončení, hranic zdrojů pravdy a dosavadního zpracování událostí na vyžádání.
Historický diagnostický popisek není aktivním spouštěčem výpočtu.

## Fáze 31 (postupně): přesnější kontrola překrývání ovladačů při 821 px

Prohlížečová kontrola úspěšně vytvořila 28 vizuálních scénářů; na hranici
821 px se mohou ovladače Provoz a Vrstvy zalomit do dvou řádků. Původní
kontrola pořadí na ose X je nahrazena skutečnou kontrolou průniku obdélníků
v osách X a Y. Rozbalené menu musí stále zůstat mimo otevřený boční panel.
Při selhání se vypíší naměřené souřadnice; ostatní kontroly se neoslabují.

## Fáze 32 (postupně): oddělení zrušené analytiky od L11/L12

Z pravidelného příjmu ADS-B odstraněna detekce Flight Intelligence a výpočet
predikcí včetně jejich napojení na stará upozornění. AlertEngine již nezávisí
na prediktivních serializátorech ani na dotazech FlightEvent do DB.
Samostatné Pushover/Web Push transporty, fronty doručení, statistiky přijímače,
historické lety a výškové profily i Navigation Integrity zůstávají zachovány.
Jiná pravidla původního AlertEngine zatím běží odděleně od analytiky a vyžadují
samostatné rozhodnutí o konfiguraci spouštěčů; zachování L11/L12 samo o sobě
neznamená návrat odstraněného Watchlistu. Historická data se nemažou.

## Fáze 33 (postupně): odstranění zastaralého browser testu W12

Produkční prohlížečový test čekal na již odstraněný widget počasí na trase
vybraného letu. Odstraněn falešný API fixture i staré selektory. Test nadále
kontroluje ATC panel, rozbalení pokročilého kontextu a zachované podklady
Navigation Integrity a počasí.

## Fáze 34 (postupně): odstranění testu již zrušeného dohledávání FlightEvent ID

Úplné testy nalezly jediný zastaralý test privátní funkce
`AlertEngine.resolvePersistedFlightEventId`. Test byl odstraněn a nahrazen
kontrolou, že doručovací engine znovu nezíská přímou závislost na ORM FlightEvent.
Historická data a samostatný doručovací worker zůstávají beze změny.

## Fáze 35 (postupně): oprava kontrol zrušených mapových vrstev Digital Twin

Úplný prohlížečový test u šířky 821 px ještě očekával mapové zdroje
Digital Twin (D01–D23). Kontrola nyní vyžaduje jen zachované mapové vrstvy
letišť, ATC kontextu, ATS tras a SIGMET včetně ověření obsahu geografických
dat. Vyřazené prediktivní vrstvy se neobnovují.

## Fáze 36 (postupně): odstranění validací Digital Twin z živých ADS-B snímků

Pět validátorů Digital Twin (výsledky, kvalita trajektorie V1/V2, události,
regionální pozornost) již neběží při každém lokálním snímku přijímače.
Odstraněno bylo také pozorování Aircraft Operational Focus a plánování
zápisu kalibrace při každém snímku. Zůstává příjem poloh, statistika,
doručovací infrastruktura, Navigation Integrity, letové stopy, historie
a přepínání zdrojů. Regresní testy vyžadují nepřítomnost měření
`snapshot.operationalTwin` a `twin.*` a zachování statistik a navigační
integrity. Stále existují stará API, výpočty na vyžádání, inicializace
kalibrace a moduly. Ty se odstraní zvlášť po kontrole závislostí.
Bez databázové migrace a mazání historických záznamů.

## Fáze 37 (postupně): odstranění syntetických benchmarků Digital Twin

Odstraněn samostatný workflow T57, jeho test a syntetický benchmark.
Zátěžový test 1×/2×/4× nyní měří pouze používaný příjem snímků, SSE
a geometrii ATC; výstup má schéma verze 2. Neaktivní měření Digital Twin
a zastaralý příkaz CLI již nejsou součástí testu. Diagnostika
zpracování snímku používá zachované provozní části. Žádná číselná
úspora CPU se bez srovnatelného měření před/po netvrdí.

## Fáze 38 (postupně): odstranění API a sestavování Digital Twin na vyžádání

Odstraněno veřejné API pro situaci letadla, všech pět administračních API pro
kalibraci a vyhodnocení Digital Twin a již nepoužívaný serverový sestavovač.
Zrušeny zastaralé hraniční testy, které tyto odmítnuté endpointy vyžadovaly;
nová regresní kontrola naopak ověřuje jejich nepřítomnost. Samostatná
Navigation Integrity, historická data a geometrie ATC mapy zůstávají.
Databázová schémata ani uložené tabulky kalibrace se nemažou.
Validátory kalibrace a jejich diagnostiky v procesu vyžadují další fázi.

## Fáze 39 (postupně): odstranění osiřelé kalibrace Digital Twin v procesu

Ze služby AircraftStateService odstraněno sedm objektů validace Digital Twin,
načítání kalibrace při startu, ukládání při vypínání a staré metody pro
zachycování a sestavování reportů. Odstraněna již nepoužívaná serverová
implementace perzistence kalibrace a její samostatný test. Historické tabulky
a uložená data zůstávají beze změny. Systémová diagnostika již nepředává
zrušené výsledky Digital Twin. Příjem ADS-B nečeká na kalibraci; statistiky,
Navigation Integrity, historie a doručovací infrastruktura zůstávají.

## Fáze 40 (postupně): odstranění osiřelých validátorů Digital Twin

Odstraněno jedenáct již nepoužívaných modulů validace výsledků, událostí,
kvality trajektorie V1/V2, promotion/graduation, truth-first recall,
regionální pozornosti a Aircraft Operational Focus včetně jedenácti
samostatných testovacích souborů. Upraveny exporty a přidána negativní
regresní kontrola jejich nepřítomnosti. Sdílené typy koridorů prozatím
zůstávají, protože je používá meteorologická část. Zachována všechna
historická data, samostatná Navigation Integrity i běžný živý radar.

## Fáze 40a: odpojení provozního API od odstraněné validace

Zachované API runtime-performance dosud importovalo odstraněný modul
Event Outcome kvůli starým forenzním údajům. Import a nepoužívané položky
`validatorPaths` a `operationalTwinForensics` byly odstraněny.
Měření příjmu, CPU, systémových fází, event-loop a stall evidence i řízení
přístupu zůstává. Historické záznamy a příjem letadel beze změny.

## Fáze 41 (postupně): odstranění mapových projekcí a forenziky Digital Twin

Odstraněno devět již nepoužívaných modulů Digital Twin: staré mapové
vrstvy, kontext a změny Aircraft Operational Focus, model regionální situace,
pozornost a fronty zaměření, forenzní výpočty a pomocník kontroly trajektorie.
Odstraněno osm souvisejících jednotkových testů, neplatné exporty a přidána
negativní regresní kontrola. Zachovány sdílené meteorologické typy,
Navigation Integrity, ATC mapa, příjem a historie letadel i transporty oznámení.

## Fáze 42 (postupně): odstranění posledních modulů Digital Twin

Odstraněno posledních sedm souborů adresáře `lib/operational-twin/`:
koridor, události, index, prediktivní projekce Navigation Integrity,
kvalita trajektorie V2/V3 a typy; zároveň pět testů odmítnutých predikcí.
Minimální kompatibilní typy meteorologického koridoru byly přesunuty do
samostatného modelu `lib/weather/corridor-intelligence.ts`. Zachovány testy
PIREP/SIGMET a jejich dosavadní význam, skutečná Navigation Integrity,
METAR, pozorované počasí i historické polohy v PostgreSQL.

## Fáze 43: odstranění ATC shadow predikcí bez ztráty aktuálního sektoru

Ze služby příjmu bylo odstraněno 165 řádků front a validací ATC shadow,
stará konfigurační volba a modul validace predikcí s testy. Upraveny počítadla
paměti a testy přiřazení aktuálního ATC sektoru. Zůstává sektorová geometrie,
ATS/NAVAID/FIX, Navigation Integrity, historie i doručování upozornění.
Bez databázové migrace, merge do main a nasazení na produkci.

## Fáze 43a: odpojení zachovaného ATC kontextu od shadow validace

Zachováno API kontextu letadla a aktuální sektor, odstraněny pouze výpočty klasifikace ATC predikcí a zápisy do neexistující validace. Omezení požadavků, kontrola ICAO, aktuální vzdušný prostor a zpracování chyb zůstaly.

## Fáze 44 (postupně): odstranění nepoužívaného predikčního API letadla

Odstraněno dříve odpojené `/api/aircraft/:hex/prediction` a staré hraniční
testy prediktivních doporučení. Vyčištěn registr funkcí a záznam Explainable
Prediction; zbývající testy nyní ověřují nepřítomnost veřejného API.
Administrátorské vyhodnocení readiness v systémové stránce zatím zůstává,
dokud nebude odpojeno ve vlastní fázi. Historické záznamy a migrace beze změn.

## Fáze 45 (postupně): odstranění administrátorského panelu predikcí

Ze zachované systémové stránky odstraněn starý panel prediktivní připravenosti
a kalibrace, jeho automatické dotazy a administrační readiness API.
Aktualizovány tabulky funkcí EN/CS a odstraněna nefunkční diagnostická karta
Digital Twin. Zachována diagnostika přijímače, ATC/Navigation Integrity,
časová osa výkonu, meteorologie i databázová historie. Samostatné knihovny
a testy predikcí zbývají na další fázi.

## Fáze 46 (postupně): odstranění nevyužitého prediktivního stavu serveru

Ze služby letadel odstraněno vytváření PredictiveStateStore, ukládání při
vypnutí, přístupové metody i nepotřebná diagnostika. Příjem ADS-B již žádný
prediktivní stav nevlastní a systémový stav nezobrazuje historickou validaci.
Samostatná modelová knihovna a staré databázové záznamy zatím zůstávají pro
následující kontrolu závislostí. Historie a zachované funkce beze změny.

## Fáze 47: úprava testů po odstranění ATC a prediktivních funkcí

Zastaralé testy konfiguračního přepínače ATC shadow, veřejného predikčního
API, administrátorského readiness panelu a starých browser očekávání byly
nahrazeny kontrolami zachovaných služeb a nepřítomnosti odstraněných cest.
Zůstává kontrola aktuálních sektorů, stavu systému i bezpečnostních podmínek.

## Fáze 43 (postupně): odstranění osiřelého API a sestavovače rekapitulací

Odstraněn endpoint `/api/recap`, starý 448řádkový serverový sestavovač
denních/týdenních přehledů a jeho samostatný jednotkový test. Statistiky
přijímače, ukládání historie a data FlightPosition v PostgreSQL zůstávají.
Synchronizován registr funkcí i anglický a český inventář API. Staré URL
po nasazení vrátí 404; žádné databázové migrace ani nasazení.

## Fáze 48 (postupně): odstranění nepoužívaného prediktivního enginu

Odstraněno 31 modulů `lib/predictive-intelligence/`, osiřelé servery
readiness, retence prediktivních pozorování a projekce vstupů, staré
watchlist predikce, administrátorské API důkazů letu a jeho nepoužívaný panel.
Odstraněny jednorázové validační skripty, jednotky systemd timeru, související
testy a neplatné příkazy z package.json. Regresní test nyní kontroluje
nepřítomnost backendu a zachování Navigation Integrity. Historická data
FlightEvent, PredictiveObservation, FlightPosition ani migrace se nemažou.
Při budoucím nasazení je nutné pod dohledem zrušit případně aktivní starý
systemd timer; v rámci draft PR se nastavení produkce nemění.

## Fáze 48a (postupně): aktualizace registru systémových funkcí

Odstraněno zrušené API důkazů predikce letu z registru a obou tabulek
funkcí. Systémová diagnostika již neslibuje neexistující prediktivní
readiness ani graduation. Zachována skutečná diagnostika příjmu ADS-B.

## Fáze 48b: odstranění prediktivních letištních panelů a starých testů

Odstraněn již nepoužívaný hook Airport Operations (včetně dotazů na
zrušené API), předpovědní přístupové vrstvy Arrival Sequence V7 a Arrival
Flow V8 i testy založené na odstraněných prediktivních modulech.
Zůstává katalog a detail letiště, skutečné počasí, sdílené letištní typy
a historické záznamy. Bez migrací a nasazení; kontrola CSP zůstala.

## Fáze 49 (postupně): odstranění neaktivního Flight Intelligence a replay

Ze služby AircraftStateService odstraněna nevyužitá instance Flight
Intelligence a její diagnostika. Odstraněny staré detektory, persistence,
analytika, replay a související skripty, komponentové styly a testy.
Sdílené typy událostí Flight Intelligence prozatím zůstávají kvůli
historickým modelům; zachována destination provenance, databázové záznamy
Flight/FlightPosition/FlightEvent, Navigation Integrity, historie letadel,
příjem ADS-B a transporty Web Push/Pushover. Žádné migrace ani produkce.

## Fáze 49a (postupně): odpojení benchmarků od odstraněného detektoru

Starý benchmark dosud vytvářel FlightIntelligenceDetector a zasahoval
do jeho interního vyhledávání letišť. Nepotřebné scénáře a zavádějící
před/po porovnání odstraněny. Zachována měření aplikace snapshotů,
SSE, source merge, cache a geometrie ATC. Výsledný load-scaling report
používá schéma 3 a `snapshotApplication.full`, bez starých experimentů.

## Fáze 49b: odstranění posledních osiřelých testů Flight Intelligence

Kompletní Vitest odhalil dva testy importující zrušený Operations Center
a prediktivní validátor terminálních událostí. Jde pouze o zrušené
analytické funkce, proto byly testy odstraněny a negativní regresní
kontrola rozšířena. Historická data a API zůstávají.

## Fáze 50 (postupně): odpojení AlertEngine od živého příjmu

Odstraněna volání starého vyhodnocovače upozornění ze snímků ADS-B,
uložení nových letadel do historie, doplňování metadat a vyhodnocování
denních i celkových rekordů. Samotné sledování a ukládání historických
dat, statistiky přijímače a Navigation Integrity zůstaly zachovány.
Samostatný worker doručování nebyl odstraněn.

## Fáze 51 (postupně): odstranění starých API a analytiky alertů

Odstraněno 16 API tras watchlistu, flotil, geofence, pravidel, simulátoru
a centra notifikací, osiřelé UI komponenty a neaktivní AlertEngine
s analytikou a specializovanými testy. Zachovány Web Push, Pushover,
fronta a databázové kontrakty doručování, diagnostické API a historická
data. Kompatibilní session endpoint zůstává kvůli ochraně diagnostiky.

## Fáze 51a (postupně): aktualizace dokumentace a kontrol produkce

Registr funkcí, anglický a český přehled a produkční kontrola odpovídají
zachovaným trasám. Zrušené API musí odpovědět 404, nikoliv úspěšně
provést starou mutaci watchlistu. PR je stále draft bez merge a nasazení.
Zachování transportu neznamená automatické vytváření nových alertů.

## Fáze 51b (postupně): odstranění starých zápisových cest pravidel

Z databázového repozitáře odstraněny metody pro vytváření a změnu
flotil, pravidel, geofence a událostí AlertOccurrence i nepoužívaný
vyhodnocovač V1. Historické tabulky, čtení událostí, fronta AlertDelivery
a její potvrzování, opakování i obnovování zatuhlých položek zůstávají.
Logbook už nenačítá stará serverová pravidla; kompatibilní počitadlo
dočasně vrací nulu, místo aby provádělo zbytečné dotazy.

## Fáze 51c (postupně): odstranění serverového úložiště watchlistu

Odstraněno čtení starého souboru alerts.json, úložiště pravidel na
serveru a jeho validační helper spolu s historickými testy.
Naopak se zachovává zcela samostatné lokální označování letadel
v prohlížeči: toto filtrování je součástí živého radaru a nevyhodnocuje
serverová pravidla ani samo neposílá upozornění.

## Fáze 52 (postupně): odstranění nadbytečné analytiky letišť

Odstraněna stará pipeline pohybů letadel u letišť, projekce Airport
Operations V1, Terminal Demand Horizon V9, Airport Intelligence V3
a osiřelá komponenta Movement Analytics včetně stylů, překladů,
testů a jednorázového auditního skriptu a výstupního souboru.
Katalog letišť, aktuální detail, informace o drahách, blízký provoz,
METAR/TAF a nezávislé historické čtení provozu zůstávají zachovány.
Přidána negativní regresní kontrola. Bez databázových migrací, merge
a zásahu do produkce.

## Fáze 53 (postupně): odstranění staré analytiky počasí

Odstraněna nepoužívaná serverová služba Weather Fusion, sdílený výpočetní
model Fusion a samostatná prediktivní meteorologická koridorová analytika
včetně izolovaných testů. Zůstává skutečné počasí METAR/TAF/SIGMET,
meteorologický radar, pozorování z letadel, mapový kontext SIGMET a používaný
kontext počasí podél trasy. Bez změny uložených dat, schématu nebo produkce.

## Fáze 54 (postupně): odstranění přehrávání historie, Flight Story a procedur

Odstraněny již nezobrazené knihovny Time Machine pro přehrávání a časová okna,
narativní sestavovač Flight Story, opuštěná interpretace denních rekapitulací
a samostatný importér procedur SID/STAR se synchronizačním skriptem.
Zrušeny související izolované testy a zastaralý příkaz `procedures:sync`.
Pryč je i osamocený panel historického provozu ATC a překlad Fleet Explorer.
Zachována vzorkovaná historie, databázové Flight/Position/Event záznamy,
obecná historická API, ATS trasy a FIX, současná sektorová ATC geometrie
na mapě a nezávislé statistické služby. Bez migrací či zásahů do produkce.

## Fáze 55 (postupně): odstranění modelovaného větru a historie ATC analytiky

Odstraněn osiřelý síťový klient větru ICON-EU/ALADIN a jeho někdejší
výpočtový adaptér. Pozorování počasí přímo z letadel (BDS) a výpočet
složky větru vůči letištní dráze z METAR zůstávají samostatné. Pryč jsou
i nepoužívané dávkové historické přehledy ATC sektorů, jejich typy,
samostatný test a zastaralé styly provozních panelů. Zachována aktuální
geometrie ATC a přiřazení sektorů, ATS trasy, meteorologická API a
historické databázové záznamy FlightPosition. Bez migrací a nasazení.
