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
