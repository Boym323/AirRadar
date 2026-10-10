# AirRadar Visual System V3

AirRadar používá tmavý vizuální jazyk leteckého provozu optimalizovaný pro
workflow, kde je mapa na prvním místě, hustá provozní data a dlouhodobé použití
na desktopu. Cílem Visual System V3 je konzistence, provozní čitelnost a
mapově orientované letecké rozhraní, nikoli vizuální rebranding.

## Principy

1. **Mapa na prvním místě.** Mapa je hlavní provozní plocha. Ovládací prvky
   mají podporovat přehled o provozu, ne s ním soupeřit. Plovoucí ovladače
   používají kompaktní sdílené povrchy, střídmé rámečky a kompaktní typografii.
2. **Sémantické barvy.** Mintová/accent znamená živý nebo akční stav,
   jantarová/selected fokus nebo historický výběr, červená/danger provozní
   pozornost, fialová kontext ATC/vzdušného prostoru a modrá počasí.
3. **Hierarchie informací před dekorací.** Než přidáte další rámeček, stín nebo
   barvu, použijte typografii, mezery a seskupování.
4. **Nejprve sdílená primitiva.** Nové karty, tlačítka, dlaždice metrik,
   segmentované ovladače, prázdné stavy a stavové odznaky mají používat
   `components/ui-primitives.tsx`.
5. **Nejprve tokenizujte, potom přidávejte hodnoty.** Nové znovupoužitelné
   barvy, poloměry, velikosti typografie, mezery a pohyb patří do sady tokenů
   `:root` v `app/globals.css`.
6. **Responzivita už z konstrukce.** Funkční stránky musí zůstat použitelné při
   existujícím sweepu breakpointů produkční brány a minimálním viewportu 320 px.

## Kanonický základ

Kanonický základ je v `app/globals.css`:

- povrchy: `--background`, `--surface-*`
- rámečky: `--border-*`
- text: `--text-primary`, `--text-secondary`, `--text-muted`
- sémantické barvy: `--accent`, `--selected`, `--success`, `--warning`,
  `--danger`, `--atc`, `--weather`
- mezery: `--space-1` až `--space-6`
- poloměry: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`,
  `--radius-pill`
- typografie: `--font-size-2xs` až `--font-size-2xl`
- pohyb: `--motion-fast`, `--motion-medium`

Barvy MapLibre paint, které nemohou používat CSS custom properties, patří do
`lib/map-theme.ts`. Nevytvářejte lokální mapové palety pro jednotlivé funkce,
pokud tam už existuje odpovídající sémantická mapová barva.

Živý radar používá jako základ otevřený dark vector styl OpenFreeMap bez
potřeby klíče, doplněný jemným modrým tónováním AirRadar, které obnovuje téměř
černé provozní pozadí. Atribuce dat OpenStreetMap a OpenFreeMap zůstává v
ovládacích prvcích mapy; nepřidává se žádná placená mapová závislost. Mapové
téma vlastní kartografický základ, labely, úrovně letišť, trasy, kruhy dosahu,
ATC, počasí a sémantiku provozního výběru. Overlaye letišť používají existující
katalogové úrovně: významná letiště zůstávají viditelná při přehledovém zoomu,
menší letiště se objeví při lokálním zoomu a heliporty vyžadují současně
zapnutou vrstvu i bližší zoom. Labely používají kontext ICAO/IATA místo
dlouhých názvů. Kruhy přijímače při kontinentálním zoomu mizí a při lokálním
zoomu zobrazují kompaktní labely vzdáleností.

## Sdílená primitiva

`components/ui-primitives.tsx` obsahuje znovupoužitelnou prezentační vrstvu:

- `Card` a `Panel`
- `SectionHeader`
- `MetricCard`
- `Button`
- `SegmentedControl`
- `EmptyState`
- `StatusBadge`
- mapové ovladače a ikonová tlačítka

Legacy názvy tříd jednotlivých funkcí mohou během migrace zůstat, ale sdílené
primitivum má vlastnit společné chování povrchu, poloměru, interakce a
typografie.

## Mapové ovladače a kontextové důkazy

Mapové ovladače používají sdílená primitiva `MapControl` a
`MapControlGroup`. Ovládání navigace, provozu a vrstev sdílí stejné tokeny
povrchu, rámečku, focusu a dotykových rozměrů. Legendy jsou kontextové:
legenda dosahu, trasy, ATC, počasí a barev letadel se zobrazí pouze tehdy, když
je aktivní odpovídající režim, a na malých obrazovkách se skryjí, pokud by
soupeřily s mapou nebo spodní navigací.

## Rozpočet vizuálního dluhu

Spusťte:

```bash
npm run visual:check
```

Audit měří ad-hoc hodnoty mimo kanonický blok tokenů `:root`. Rozpočet je
záměrně monotónní: úklid může limity snižovat, ale nová práce na funkcích je
nesmí zvyšovat bez explicitního rozhodnutí design systému.

Aktuální rozpočet Phase 1 je:

| Metrika | Maximum |
| --- | ---: |
| výskyty hardcoded barev mimo `:root` | 393 |
| unikátní hardcoded barvy mimo `:root` | 263 |
| doslovné poloměry rámečků mimo `:root` | 155 |
| doslovné velikosti písma mimo `:root` | 538 |

Report se zapisuje do `artifacts/visual-system-audit.json` a nahrává jej CI.

## Vizuální důkazy z prohlížeče

Produkční browser gate pořizuje screenshoty reprezentativních desktopových a
mobilních ploch do `artifacts/visual-smoke/`:

- živý radar, vybrané letadlo na desktopu, tabletu a mobilu včetně rozšířeného detailu;
- statistiky, Time Machine a systémová diagnostika;
- počasí: předem připravená dostupná data na desktopu a prázdný stav na mobilu;
- watchlist bez pravidel na desktopu a mobilu;
- centrum oznámení bez událostí na desktopu a mobilu;
- analýza přijímače s nedostupným backendem na obou typech obrazovek;
- lokalizovaná nabídka „Více“ v češtině na desktopu a angličtině při šířce 320 px;
- radar na mobilu, statistiky, detaily letadel a prediktivní přehledy.

Nové scénáře V3.3 používají deterministická testovací data a zachytávání API
požadavků přes Playwright místo nestabilních živých dat. Test nejprve čeká na
očekávaný načtený, prázdný či nedostupný stav a hlídá horizontální přetékání
při každém screenshotu. Nabídka v angličtině ověřuje skutečnou změnu jazyka.
Nejde však o automatické pixelové porovnání se schválenými obrázky.

Screenshoty jsou artefakty CI, nikoli verzované pixelové baseline. Dynamická
letadla, počasí a provozní data by způsobovala falešné rozdíly; produkční brána
už samostatně kontroluje responzivitu a runtime/browser chyby. Obrázky jsou
podkladem pro lidskou kontrolu vizuálních úprav.

## Závěrečný vizuální audit V3.4 (2026-10-08)

Poslední úspěšné produkční nasazení (workflow #37803889859,
commit `6ca4efd2`) poskytlo 46 PNG screenshotů desktopu, tabletu a mobilu.
Audit zahrnoval mapu a výběr letadla, detail letadla, statistiky, letištní
tabuli, počasí, oznámení, watchlist, dosah přijímače, prediktivní panely,
Time Machine, vyhledávání a systémovou diagnostiku.

Celkový vzhled je jednotný a není třeba další velká přestavba. Nalezly se
tři konkrétní drobnosti, které V3.4 opravuje:

- **Spodní navigace na mobilu:** místo dlouhého dvouřádkového názvu je
  zobrazen krátký text „Radar“; plný lokalizovaný název zůstává v `aria-label`
  pro asistivní technologie.
- **Nabídka „Více“ při šířce 320 px:** skupiny odkazů mají neprůhledný
  zvýšený povrch a texty stránky pod nimi neprosvítají.
- **Odsazení počasí:** obsah má stejně jako ostatní provozní stránky
  12px okraje a na mobilu dostatečnou rezervu nad pevnou spodní navigací.

Regresní testy jsou v `tests/visual-system-v3-4.test.ts`. Playwright navíc
pokrývá anglickou nabídku na 320 px a prázdné počasí na mobilu. Automatické
testy neprovádějí schválený pixelový diff; teprve kontrola nově pořízených
screenshotů po nasazení uzavírá estetické ověření.

## Migrační pravidla

Při zásahu do existující funkce:

1. pokud je to možné, použijte sdílené primitivum;
2. nahraďte znovupoužitelné lokální barvy/poloměry/velikosti písma
   sémantickými tokeny;
3. doménové letecké barvy ponechte pouze tehdy, když skutečně kódují doménovou
   sémantiku;
4. spusťte `npm run visual:check`;
5. pokud je změna vizuálně významná, ověřte příslušný desktopový/mobilní
   visual-smoke artefakt.

Migrace je postupná. Chování funkcí ani datové kontrakty se nesmějí měnit jen
kvůli dokončení vizuálního úklidu.

## Visual System V4: čitelnost a hierarchie informací (10. 10. 2026)

- Základní tokeny pro malé popisky a sekundární text jsou větší o 1 px.
  Základní text zůstává na 14 px a dotykové ovládací prvky na 44 px.
- Sbalený mobilní panel vybraného letadla má výšku maximálně 43svh / 390 px;
  explicitní rozbalení zůstává do 80svh. Duplicitní počítadlo nad mapou
  zmizí pouze tehdy, když je panel vybraného letadla otevřený.
- Orientační popisky a hranice v malých měřítkách jsou o něco čitelnější.
  Podklad OpenFreeMap a atribuce se nemění.
- Živý přehled letiště dává přednost aktuálnímu provozu a výjimkám před
  pokročilou analytikou. Všechna existující data V6–V9 a D2–D4 zůstávají
  dostupná v rozbalovací sekci s českým a anglickým popisem.
- Regresní testy hlídají tokeny, stav panelu, sémantiku mapy a pořadí informací.
  Nové produkční screenshoty stále vyžadují ruční kontrolu; pixel-diff
  baseline zatím není součástí automatické kontroly.

## Visual System V5: postupné rozhraní inspirované flight trackery

V5 vychází z principů mapového ovládání zavedených flight trackerů, ale
nekopíruje jejich branding, grafiku, specifický layout ani proprietární data.
Používá existující API a stav AirRadaru bez dalšího vyhledávání, pollingu
počasí či duplicitních ATC zdrojů.

- **V5-A1 (první PR):** přímé zkratky na mapě pro vyhledávání, počasí, ATC
  a filtry; přístupné aktivní/neaktivní stavy; při otevřeném detailu letadla
  se na mobilu skryjí, aby zachovaly prostor mapě.
- **V5-A2:** zjednodušit horní lištu a mapový HUD na šířkách 320, 390, 820
  a 1280+ px; odstranit duplicitní počitadla a trvale viditelné ovladače.
- **V5-A3:** rychlý přepínač meteorologické vrstvy, legenda a uložená volba;
  nedostupná data nesmějí působit jako aktuálně platný radarový snímek.
- **V5-B1:** stručný detail letadla: identita, typ, registrace, ověřená trasa
  a čtyři hlavní metriky. Bez domyšlených ETA a letišť.
- **V5-B2:** postupně odkrývat historii, situaci, kvalitu dat a počasí;
  zachovat existující provozní analýzy a watchlist.
- **V5-C1:** přehled letiště s pozorovanými pohyby, počasím a kontextem drah,
  jasně označenou nejistotou. Nedomýšlet si zpoždění ani gate.
- **V5-C2:** záložky Přehled, Přílety, Odlety, Provoz, Počasí, Mapa,
  Analýzy; zachovat V6-V9 a D2-D4 v pokročilé záložce.
- **V5-D:** mobilní stavy krátký/střední/úplný detail, přístupnost klávesnicí
  a čtečkou, safe area, fixní navigace a šířka 320 px.
- **V5-E:** sjednotit CSS tokeny, prověřit vizuální dluh a překlady,
  ručně zkontrolovat CI screenshoty a po nasazení ověřit veřejné statické
  soubory a konzoli prohlížeče.

Každé PR musí projít lint/typecheck, Vitest, visual:check a příslušnými
desktopovými a mobilními browser testy. Bez výkonových regresí, zbytečného
pollingu, nových providerů a nepodložených tvrzení o leteckém provozu.
PR ponechte otevřené k revizi; sloučení do main automaticky spouští
produkční release pipeline.

### Implementace V5-A2: kompaktní mapový HUD

Horní lišta radaru nyní zobrazuje stav přijímače a UTC bez opakování počtů
LOCAL a NETWORK. Rozdělení podle zdroje je dostupné v rozbalovacím počítadle
na desktopu při rozšířeném pokrytí a v panelu provozu. Počet aktivních filtrů
zobrazuje zkratka V5 a filtr provozu, nikoli třetí mapová značka.
Na šířkách <=820 px zůstává jeden úzký řádek ovládání s počtem okolních
letadel; duplicitní souhrnná karta se skryje. Dotykové prvky zachovávají
44px cíle a tlačítko provozu má přístupný název, i když se jeho viditelný
popisek při <=420 px nezobrazuje. Vyhledávání zůstává hlavním pružným
prvkem horní lišty.

### Implementace V5-A3: jednoznačný stav meteorologické vrstvy

Zkratka počasí a časová osa používají jednotný stav vybraného snímku:
vypnuto, načítání, připraveno, zastaralé nebo nedostupné. Starý snímek
je jasně označen časem; starší nesouvisející snímky nemění aktuální stav.
Selhání či prázdný katalog zahodí předchozí obrázek i jeho ID a zastaví
animaci, takže stará data nevypadají jako aktuální počasí. Uložená volba,
výběr snímků, cache a 60sekundová obnova zůstávají beze změny; žádný nový
provider nepřibyl. Při nedostupnosti se zobrazuje přeložené upozornění.
Etapy A2 a A3 musejí před vydáním projít browser testem a kontrolou snímků.

### V5-A produkční kontrola: odložené přihlášení k Intelligence

Responzivní browser test odhalil reálnou neefektivitu: Operations Center
i při zavřeném panelu připojoval intelligence SSE a načítal
`/api/intelligence/events?limit=12` při každém zobrazení radaru.
Nyní navazuje spojení až při otevření panelu a při zavření zachovává
původní úklid spojení. Snižuje to skrytou zátěž i tlak na veřejný
limit požadavků. Chyby 429 se v browser testu nezamlčují ani neignorují.

### V5-B1/B2: shrnutí letu a postupné zobrazení intelligence

Detail vybraného letadla zachovává společné čtyři živé metriky
`RadarTrafficHero`. Typ, registrace a pozorovaný provozovatel mají
oddělené značky místo dlouhého textového řádku. Neúplná trasa zobrazuje
jen známá letiště a nevytváří nepravdivou šipku odlet–přílet.
Pozice starší než 60 s má viditelné upozornění. Záložka Situace
přednostně ukazuje souhrn, ATC, dostupný kontext trasy a provozní
události; navigační integrita, SIGMET, pozorované počasí a vítr
zůstávají v nativní přístupné rozbalovací sekci. Žádné datové zdroje
ani pokročilé údaje se neodstraňují.

### V5-B3: rychlé akce v detailu letu

Souhrn vybraného letadla má napříč záložkami jeden řádek rychlých akcí:
sledování letadla na mapě (skutečný existující map-follow stav),
vycentrování, historie letu, nativní sdílení/kopie veřejné adresy,
nastavení pravidel upozornění a úplný detail. Hvězdička zůstává
samostatným zařazením ICAO do watchlistu, nikoliv nepravdivým
přihlášením k push. Při chybějící poloze je sledování nedostupné.
Sdílení využívá jen prohlížeč a veřejný odkaz na detail; bez oprávnění
hlásí srozumitelný přístupný stav. Akce jsou viditelné bez přepínání
na záložku Let, s alespoň 44px dotykovým cílem a překlady.

### V5-C1: přehledné členění letišť

Detail letiště nabízí sedm přístupných pohledů (Přehled, Přílety, Odlety,
Provoz, Počasí, Mapa, Analýzy), vodorovně posuvné dotykové záložky, ovládání
šipkami/Home/End a stálé odkazy `#airport-view-*`. Controller provozu
a živých letadel zůstává jediný a sdílený. Přehled obsahuje základní údaje,
pozorované pohyby a počasí; referenční infrastruktura je v rozbalovací sekci.
Mapu, podrobné počasí a historické analýzy načítáme jen v příslušném
pohledu. Jde o pozorování či odvození z přijímače, ne oficiální zpoždění,
gate nebo veřejný letový řád.

### V5-C2: přílety a odlety

Samostatné tabulky používají jen existující omezený přehled pozorovaných
pohybů. Podporují hledání, filtr typu pohybu, míru jistoty, informace o
dráze a odkaz do historie letu. Čas je **čas pozorování**, nikoliv letový
řád či domyšlené ETA. Neúplná a chybějící data jsou označena; nevymýšlíme
zpoždění, gate, oficiální stav letu ani neověřenou trasu. Obě tabulky
využívají společný controller a vykreslí se jen na vlastní záložce.

### V5-C3/C4: provoz a analýzy

Provoz má vlastní přehled pozorovaného využití drah, časovou osu,
krátkodobé indikátory příletového provozu, holding a go-around včetně
upozornění, že jde o odhad přijímače. Úvodní Přehled již neopakuje
celou rozšířenou analýzu tlaku provozu. Všechny modely V6–V9 a D2–D4,
historické statistiky a pozorované pohyby jsou samostatně v Analýzách.
Zachovává se informace o zdroji, míra jistoty a jediný controller.

### V5-C ověření v CI

Produkční browser gate nyní prochází všech sedm letištních záložek, testuje
filtrování pozorovaných příletů/odletů, provoz drah a pokročilou analytiku,
načtení mapy a počasí a vrací se na požadovaný snímek. Ukládá přehled na
desktopu, mobilu 390 a 320 px, mobilní přílety a desktopovou analytiku.
Jde o skutečně vykreslené Playwright snímky, nikoli grafické makety.

### V5-C dokončení vzhledu po auditu v1.0.405

- Dlouhé textové signály modelu D4 již nepřebírají třísloupcové
  rozložení seznamu letů, ale využívají dostupnou šířku karty.
- Pod 600 px se pozorované přílety a odlety zobrazují jako označené
  karty s původními odkazy a daty v jediném sémantickém HTML table.
  Hlavička letiště a akce jsou kompaktní i na 320–390 px.
- Aktivní záložka se automaticky posune do zorného pole a postranní
  indikace upozorňuje na další záložky.
- D2–D4 zůstávají přístupné v samostatné rozbalovací části; při absenci
  průkazných dat se zobrazí jednotná přeložená zpráva.
- CI pořizuje letištní snímky všech sedmi záložek na kombinaci šířek
  320, 390, 768 a 1366 px. Browser test rozbalí evidence, ověří je
  a před snímkem analytiky je znovu sbalí. Úspěšný CI neznamená
  automaticky hotovou lidskou kontrolu snímků.

### V5-E1: doladění vizuálu a jazykové parity (2026-10-10)

- Analýza pohybů letiště používá samostatný česko-anglický slovník místo
  promíchaných českých a anglických textů. Titulky, období, informace o
  dráze a upozornění se přepínají podle zvoleného jazyka. Výpočty a API
  pozorovaných pohybů se nemění.
- Identita letadla neopakuje výrobce, pokud název modelu již výrobce
  obsahuje. Stejná formátovací funkce slouží stávajícímu i staršímu
  detailu; původní metadata výrobce a modelu zůstávají samostatně.
- Na šířce 320 px je atribuce MapLibre, OpenFreeMap a OSM kompaktní.
  Rozbalená stále nabízí původní povinné odkazy. Nový screenshot ověřuje
  rozbalený stav bez skrytí atribuce.
- Historická analytika využívá sdílené tokeny povrchů, ohraničení,
  typografie a zaoblení; limity vizuálního dluhu se nezvyšují.
- Produkční browser gate pořizuje navíc mobilní analytiku v angličtině
  a rozbalenou atribuci mapy na 320 px. Po vydání je stále nutná
  lidská kontrola finálních screenshotů.

### V5-E2–E6: mapa na prvním místě, přehled letu, důvěryhodnost trasy a letiště

- Přepínač **Jen mapa** dočasně rozšíří stávající MapLibre mapu; skryté
  navigační a provozní panely se vrátí bez nové subscription nebo pollingu.
  Výběr letadla režim automaticky ukončí. Filtry, vrstvy a povinná
  atribuce zdrojů mapy zůstávají dostupné.
- Hlavička detailu letadla ukazuje odhad procentuálního postupu po trase
  **jen při dostupnosti platného údaje z existujícího Route Corridor
  modelu**. Zahrnuje míru jistoty a zdrojové upozornění, nevyvozuje
  oficiální čas příletu, gate ani letový status.
- Legenda mapy odlišuje trasu skutečně zaznamenanou přijímačem od
  modelovaných či veřejných segmentů včetně právě odhadovaného úseku.
  Zachovávají se dosavadní MapLibre vrstvy a ADS-B/OGN zdroje.
- Detail letiště má rychlý přechod na Mapu. V okolním provozu lze z
  existujícího sdíleného controlleru vybrat všechna, přibližující se
  nebo odlétající letadla a otevřít konkrétní letadlo na živém radaru
  již podporovaným odkazem `/?aircraft=<ICAO>`. Není přidáno žádné
  další SSE spojení letiště.
- V5-E6 doplňuje regresní testy, desktopové a mobilní screenshoty
  režimu Jen mapa, test přímého přechodu na letištní mapu a mobilní
  snímek mapy na 390 px. Před vydáním zkontrolovat CI screenshoty.


## V6-A — sledování více letadel

Přepínač **Více letadel** na živém radaru přidává lokální výběr až deseti ICAO identit. Kliknutí na letadlo při zapnutém režimu připne jeho ICAO a nad mapou zobrazí jeho aktuální telemetrii, i když už je vybráno jiné letadlo. Přerušované čáry zobrazují přijaté stopy ze zvoleného zdroje LOCAL/EXTENDED, nikoli modelovaná trasa. Při ztrátě signálu zůstává karta označená jako mimo pokrytí; režim lze ukončit bez změny filtru či serverových watchlistů. Využívá existující stream a MapLibre, nepřidává nové SSE spojení.


## V6-B — mapové podklady bez přestavění radaru

Živý radar nabízí tmavý (původní OpenFreeMap), světlý (překreslení pouze barev původního podkladu) a volitelný historický satelitní režim (EOxCloudless Sentinel 2020). Instance MapLibre, živé značky, zdroje tras/počasí/ATC, ovládání a SSE zůstávají zachované. Světlé barvy se aplikují jen na původní podkladové vrstvy. Satelitní WMTS se načte teprve na vyžádání pod leteckými vrstvami s povinnou atribucí. **Snímky z roku 2020 nejsou živé a volná licence je pouze pro nekomerční účely**; komerční provoz vyžaduje odpovídající licenci. Volba se ukládá pouze v prohlížeči.


## V6-C — mobilní kamera AR na vyžádání

Dosavadní mobilní Sky Finder obsahuje volitelné překrytí živého obrazu zadní kamery. Uživatel nejprve povolí Sky Finder a senzory a následně výslovně zapne kameru. Do orientačního zorného pole telefonu na výšku se promítají pouze čerstvé lokálně přijaté ADS-B polohy s použitelnou elevací vůči pozorovateli; zastaralé, mimo záběr nebo bez spolehlivých senzorů se nezobrazují. Ruční korekce náklonu zůstává jen v relaci. Video se neodesílá, neukládá ani nenahrává; mediální stopy se zastaví po vypnutí, skrytí karty a odpojení komponenty. Chyba oprávnění či HTTPS nenaruší původní Sky Finder. Překrytí není certifikovaná navigační pomůcka.


### V6-D1: volitelný 3D terén

Mapa nabízí **2D (výchozí)** a **3D terén (beta)**. Stávající mapa MapLibre zůstává zachována; výšková data Mapterhorn (DEM) se načítají až po výslovném zapnutí. Vypnutí obnoví plochý pohled bez výměny mapového stylu. Zdroj je uveden v atribuci. Nedostupnost externího DEM nesmí ovlivnit výchozí radar. Ikony letadel jsou zatím mapové značky, **nikoli 3D modely ve skutečné výšce**. Před nasazením ověřit desktop, mobil a výkon GPU.


### V6-G: prezentační režim (první verze)

Ovládací prvek přepne radar na celou obrazovku, ale používá stávající živý stream. Každých 45 sekund se vystřídá pohled na **čerstvě pozorované lokální letadlo ve vzduchu**; nejsou-li dostupná, kamera se vrátí na polohu přijímače. Režim nepřidává další stream, externí dotazy, polling ani zápisy. Uživatel může střídání pozastavit a režim kdykoli ukončit. Editor TV playlistů a sdílené presety nejsou součástí první verze.


### V6-E: důkaz původu a stáří stavu letu

Detail letadla už zobrazuje na vyžádání načtená data FlightAware (stav, plánované/odhadované/skutečné časy, zpoždění, brány). V6-E přidává označení zdroje AeroAPI, čas získání a konzervativní hodnocení stáří (do 60 minut, starší, neznámé), případně jasnou informaci o nedostupnosti externích údajů. Polohy ADS-B ani odvozené trasy se nevydávají za oficiální letový plán či FIDS. Nové UI nevytváří žádné placené dotazy ani polling na pozadí.


### V6-D2–D5: omezené 3D siluety a sledovací kamera

Volitelný 3D terén vykreslí nejvýše 12 jednoduchých prostorových siluet letadel ve skutečných zeměpisných souřadnicích a přibližné výšce. Použije čerstvá pozorování a přednostně geometrickou výšku; barometrická výška je méně přesná náhrada. Jde o **schematický 3D tvar**, nikoli ověřený model konkrétního typu ve formátu GLTF. V menu je volná kamera nebo volitelná kamera sledující vybrané letadlo s omezenou frekvencí pohybů. Vrstva WebGL2 vzniká pouze při zapnutém 3D a při návratu do 2D se odstraní. Počet objektů i geometrie jsou omezené, skrytá záložka se neanimuje. Plné realistické modely a pohled z kabiny vyžadují další GPU testy na skutečných zařízeních.


### V6-D6: omezené modely podle konstrukčního typu

Volitelná 3D vrstva používá lokálně vytvářené nízkopolygonové tvary s odlišnými rozměry trupu, rozpětím, polohou křídel, ocasními plochami a motory podle vybraných ICAO kódů (Airbus, Boeing, regionální letadla, všeobecné letectví a vrtulníky). Neznámý typ má obecný náhradní model. Jde o **vizuálně rozlišitelné přibližné tvary**, nikoli přesné licencované modely GLTF/CAD. Geometrie se sdílí podle konečného katalogu typů, nikoli podle identifikátorů letadel; limit zůstává 12 objektů, výchozí režim je 2D a nevznikají další síťové dotazy ani procesy. Pro fotorealistické zobrazení bude nutné ověření na skutečných GPU a mobilech.


## Stav systému V4: jasná hierarchie diagnostiky (2026-10-10)

Stránka `/system` seskupuje existující karty do sekcí Aplikace a výkon,
Příjem a sledování, Databáze a trasy a Služby a datové zdroje bez změny
API ani toku přijímače/SSE. Rychlá navigace umožňuje skákat mezi sekcemi.
Pruh upozornění se zobrazuje pouze při stavu `degraded`/`offline`;
vypnuté a on-demand služby nejsou považované za incident. Běžné štítky
„OK“ jsou méně výrazné, hlavní stav zůstává v horním přehledu. Na úzkých
displejích se diagnostika přeskupí do jednoho sloupce.
Regresní test `tests/system-status-visual-polish-v4.test.ts` a desktopové/
mobilní vizuální testy jsou podmínkou nasazení.

### V6-D8 – detailní modely a ověření GPU
Základní 3D terén i ohraničená vrstva až 12 lokálně zachycených letadel zůstává dostupná offline jako jednoduchá vektorová geometrie. Volitelné **Detailní modely letadel (online GLB)** jsou vypnuté ve výchozím stavu; načítají se pouze po uživatelském zapnutí 3D a tohoto přepínače. Používají veřejnou sadu [amvlab/aircraft-models](https://github.com/amvlab/aircraft-models) (bez firemních log), autor **amvlab**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), normalizovanou do souřadnic a fyzických rozměrů pro AirRadar. Podporované rodiny: A320, A350, A380, B737 a B787. Ostatní typy, chyby dekódování, síťové výpadky nebo nekompatibilní GPU pokračují původními typově odstupňovanými low-poly siluetami. Zdroj assetů je připnut na konkrétní upstream commit; max 1,5 MB/soubor, 5 000 trojúhelníků na detailní model, nejvýše dvě detailní letadla a 12 letadel celkem, žádný nový SSE/serverový dotaz.
Přepínač 3D poskytuje **Ověřit 3D na tomto zařízení** a export JSON důkazu: WebGL2, identita rendereru (pokud ji prohlížeč zveřejní), limit textur a vzorkovaná cadence requestAnimationFrame. Jde o měření prohlížeče a orientační snímkové odezvy, nikoli o certifikovaný benchmark GPU. Uživatel musí fyzicky ověřit alespoň desktopovou diskrétní/integr. GPU, iOS Safari a Android Chrome, ověřit 2D návrat při selhání WebGL, přepínání stylu, skutečně používané modely, výdrž a teplotu zařízení. Chromium CI test běží softwarově a fyzický telefon nenahrazuje.
