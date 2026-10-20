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
