# AirRadar V3 – vizuální systém

AirRadar používá tmavý vizuální jazyk leteckého provozu optimalizovaný pro
mapové pracovní postupy, hustá provozní data a dlouhodobé používání na
desktopu. Cílem V3 je konzistence, čitelnost a mapová plocha, nikoli rebranding.

## Principy

1. **Nejprve mapa.** Ovládání podporuje obraz provozu a nesoupeří s ním.
2. **Sémantické barvy.** Mintová znamená živý stav, jantarová fokus nebo výběr,
   červená provozní pozornost, fialová ATC a modrá počasí.
3. **Hierarchie před dekorací.** Nejprve používejte typografii, mezery a skupiny.
4. **Sdílená primitiva.** Karty, tlačítka, metriky, segmenty, prázdné stavy a
   odznaky používají `components/ui-primitives.tsx`.
5. **Tokenizace.** Nové barvy, poloměry, typografie, mezery a animace patří do
   tokenů v `app/globals.css`.
6. **Responzivita.** Stránky musí fungovat od šířky viewportu 320 px.

## Kanonické základy

Základ v `app/globals.css` tvoří povrchy `--background` a `--surface-*`,
rámečky `--border-*`, textové tokeny, sémantické barvy `--accent`, `--selected`,
`--success`, `--warning`, `--danger`, `--atc`, `--weather`, mezery
`--space-1` až `--space-6`, poloměry `--radius-sm` až `--radius-pill`, velikosti
písma `--font-size-2xs` až `--font-size-2xl` a pohyb `--motion-fast` a
`--motion-medium`. MapLibre barvy, které nemohou používat CSS proměnné, patří
do `lib/map-theme.ts`.

## Sdílená primitiva a mapa

`components/ui-primitives.tsx` obsahuje `Card`, `Panel`, `SectionHeader`,
`MetricCard`, `Button`, `SegmentedControl`, `EmptyState`, `StatusBadge`, mapové
ovladače a ikonová tlačítka. Mapové ovladače používají `MapControl` a
`MapControlGroup`; navigace, provoz i vrstvy sdílejí povrch, rámeček, focus a
dotykové rozměry. Kontextové legendy se zobrazují jen při aktivním režimu a na
malém displeji se skryjí, pokud by soupeřily s mapou nebo navigací.

## Rozpočet vizuálního dluhu

```bash
npm run visual:check
```

Audit měří hodnoty mimo kanonický blok `:root`. Úklid může limity snížit, nová
funkce je však nesmí zvýšit bez rozhodnutí design systému.

| Metrika | Maximum |
| --- | ---: |
| pevné barvy mimo `:root` | 393 |
| unikátní pevné barvy mimo `:root` | 263 |
| doslovné poloměry mimo `:root` | 155 |
| doslovné velikosti písma mimo `:root` | 538 |

Report je v `artifacts/visual-system-audit.json` a CI ho nahrává jako artefakt.

## Browser důkazy

Produkční browser gate ukládá screenshoty do `artifacts/visual-smoke/` pro živý
radar, Statistics, Time Machine, System a mobilní plochy. Nejde o pixelové
baseline, protože živá data jsou proměnlivá; gate však selže při horizontálním
overflow nebo runtime chybách.

## Migrační pravidla

Při úpravě funkce použijte sdílené primitivum, nahraďte lokální hodnoty tokeny,
zachovejte doménové barvy jen tam, kde mají význam, spusťte
`npm run visual:check` a u významné změny ověřte desktopový i mobilní artefakt.
Migrace je postupná; chování ani datové kontrakty se nemění jen kvůli úklidu.

Podrobný anglický originál je v [../VISUAL-SYSTEM.md](../VISUAL-SYSTEM.md).
