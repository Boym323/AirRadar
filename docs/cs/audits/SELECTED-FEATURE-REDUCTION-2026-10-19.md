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
