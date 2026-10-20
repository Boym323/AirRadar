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

Zachovaná integrace RXW Hubu E07 pro technická metadata zůstává beze změn. Zamítnutá E08 již v živém radaru neregistruje H1/FPN vrstvy MapLibre ani neprovádí pravidelné dotazy na waypointy (60 s) a trasu vybraného letadla (30 s). Test hlídá odstranění importů, mapových vrstev i dotazů v živém radaru. Volitelné API/parser RXW a čtení historického archivu zatím zůstávají z důvodu samostatného auditu závislostí a uložených dat; **nejde zatím o kompletní odstranění E08**. PR neprovádí databázovou migraci ani produkční nasazení.
