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

- živý radar
- Statistics
- Time Machine
- System
- mobilní radar
- mobilní Statistics

Tyto screenshoty jsou CI artefakty, nikoli verzované pixelové baseline.
Dynamická letadla, počasí a provozní data dělají striktní pixel matching
nestabilní, zatímco existující browser gate už tvrdě selhává při responzivním
horizontálním overflow a runtime/browser chybách. Screenshoty poskytují
stabilní plochu pro revizi vizuálních změn bez falešných selhání způsobených
živými daty.

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
