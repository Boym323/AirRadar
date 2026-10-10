# AirRadar Visual System V3

AirRadar uses a dark aviation-operations visual language optimized for map-first
workflows, dense operational data and long-running desktop use. The goal of
Visual System V3 is consistency, operational readability and a map-first
aviation surface, not a visual rebrand.

## Principles

1. **Map first.** The map is the primary operational surface. Controls should
   support the air picture instead of competing with it. Floating controls use
   compact shared surfaces, restrained borders and compact typography.
2. **Semantic color.** Mint/accent means live or actionable, amber/selected
   means focus or historical selection, red/danger means operational attention,
   violet is ATC/airspace context and blue is weather.
3. **Information hierarchy before decoration.** Use typography, spacing and
   grouping before adding another border, shadow or color.
4. **Shared primitives first.** New cards, buttons, metric tiles, segmented
   controls, empty states and status badges should use
   `components/ui-primitives.tsx`.
5. **Tokenize before adding values.** New reusable colors, radii, typography
   sizes, spacing and motion belong in the `:root` token set in
   `app/globals.css`.
6. **Responsive by construction.** Feature pages must remain usable at the
   existing production-gate breakpoint sweep and the 320 px minimum viewport.

## Canonical foundation

The canonical foundation lives in `app/globals.css`:

- surfaces: `--background`, `--surface-*`
- borders: `--border-*`
- text: `--text-primary`, `--text-secondary`, `--text-muted`
- semantic color: `--accent`, `--selected`, `--success`, `--warning`,
  `--danger`, `--atc`, `--weather`
- spacing: `--space-1` through `--space-6`
- radii: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`,
  `--radius-pill`
- typography: `--font-size-2xs` through `--font-size-2xl`
- motion: `--motion-fast`, `--motion-medium`

MapLibre paint colors that cannot consume CSS custom properties belong in
`lib/map-theme.ts`. Do not introduce feature-local map palettes when a
semantic map color already exists there.

The live radar uses the open, no-key OpenFreeMap dark vector style as its base,
with a subtle AirRadar blue tint restoring the near-black operations backdrop.
Attribution for OpenStreetMap data and OpenFreeMap is retained in the map
controls; no paid map dependency is introduced. The map theme owns
the cartographic base, labels, airport tiers, routes, range rings, ATC,
weather and operational selection semantics. Airport overlays use the existing
catalog tiers: significant airports remain visible at overview zoom, smaller
fields enter at local zoom, and heliports require both their layer toggle and
a closer zoom. Labels use ICAO/IATA context rather than long names. Receiver
rings fade at continental zoom and expose compact distance labels at local
zoom.

## Shared primitives

`components/ui-primitives.tsx` contains the reusable presentation layer:

- `Card` and `Panel`
- `SectionHeader`
- `MetricCard`
- `Button`
- `SegmentedControl`
- `EmptyState`
- `StatusBadge`
- map controls and icon buttons

Legacy feature class names may remain during migration, but the shared primitive
should own the common surface, radius, interaction and typography behavior.

## Map controls and contextual evidence

Map controls use the shared `MapControl` and `MapControlGroup` primitives.
Navigation, traffic and layer controls share the same surface, border, focus
and touch sizing tokens. Legends are contextual: range, route, ATC, weather
and aircraft color legends only appear when their corresponding mode is active,
and are hidden on small screens when they would compete with the map or bottom
navigation.

## Visual debt budget

Run:

```bash
npm run visual:check
```

The audit measures ad-hoc values outside the canonical `:root` token block.
The budget is intentionally monotonic: cleanup may lower the limits, but new
feature work must not increase them without an explicit design-system decision.

The current Phase 1 budget is:

| Metric | Maximum |
| --- | ---: |
| hardcoded color occurrences outside `:root` | 393 |
| unique hardcoded colors outside `:root` | 263 |
| literal border radii outside `:root` | 155 |
| literal font sizes outside `:root` | 538 |

The report is written to `artifacts/visual-system-audit.json` and uploaded by
CI.

## Browser visual evidence

The production browser gate captures screenshots for representative desktop and
mobile surfaces into `artifacts/visual-smoke/`:

- live radar, selected aircraft (desktop/tablet/mobile) and expanded mobile detail
- Statistics, Time Machine and System
- weather (seeded available data on desktop, deterministic empty state on mobile)
- watchlist (empty on desktop/mobile)
- notifications (empty on desktop/mobile)
- receiver analysis (unavailable backend on desktop/mobile)
- localized and grouped **More** navigation (Czech desktop, English 320 px mobile)
- mobile radar, Statistics and selected feature details

New V3.3 states use Playwright request interception and deterministic fixtures
rather than live upstream data. The visual sweep checks horizontal overflow for
each target before saving its screenshot; it also waits for the expected
data/empty/unavailable UI to appear. Locale/menu captures validate a real
English navigation state. This still does **not** constitute an automatic
pixel-diff comparison against approved baselines.

These screenshots are CI artifacts rather than checked-in pixel baselines.
Dynamic aircraft, weather and operational data make strict pixel matching noisy,
while the existing browser gate already hard-fails on responsive horizontal
overflow and runtime/browser errors. The screenshots provide a stable review
surface for visual changes without creating false failures from live data.

## V3.4 final screenshot review (2026-10-08)

The last successful production release (workflow #37803889859, commit `6ca4efd2`)
produced 46 desktop, tablet, and mobile PNG screenshots. The review sampled
all major surface families: map/selection, aircraft detail, statistics,
airport board, weather, notifications, watchlist, receiver coverage,
predictive panels, Time Machine, search, and system diagnostics.

No large redesign was warranted. Three concrete visual consistency
improvements were identified and implemented:

- **Mobile bottom navigation:** use the short visible label "Radar" instead
  of wrapping a lengthy live-picture title over two lines; retain the full
  localized `aria-label` for assistive technology.
- **320 px mobile overflow menu:** render the grouped menu on a fully opaque
  elevated surface so underlying page copy does not bleed through the items.
- **Weather page gutters:** align the weather layout's 12 px content inset
  with adjacent operational pages; reserve bottom clearance for the fixed
  mobile navigation so the last weather panel remains scrollable.

Regressions are covered by `tests/visual-system-v3-4.test.ts`. Existing
production Playwright screenshot fixtures cover both the 320 px English
overflow and mobile weather empty state, as well as the remaining pages.
The screenshots are review evidence, **not** an approved image-diff baseline;
passing browser smoke does not certify typography and aesthetics without
human review of a fresh post-change artifact.

## Migration policy

When touching an existing feature:

1. reuse a shared primitive where possible;
2. replace feature-local reusable colors/radii/font sizes with semantic tokens;
3. keep aviation-domain colors only when they encode actual domain semantics;
4. run `npm run visual:check`;
5. verify the relevant desktop/mobile visual-smoke artifact when the change is
   visually meaningful.

The migration is incremental. Feature behavior and data contracts must not be
changed merely to complete a visual cleanup.

## Visual System V4: readability and information hierarchy (2026-10-10)

- Increased reusable microcopy and supporting-label typography by 1 px via
  shared tokens; preserved the 14 px body baseline and 44 px touch controls.
- The selected-aircraft mobile glance now starts at up to 43svh / 390px;
  explicit expand remains available at up to 80svh. The redundant map
  counter is hidden only when the selected-aircraft drawer is visible.
- Low-zoom place/airport labels and boundaries are slightly brighter while
  roads/POIs remain deliberately quiet. OpenFreeMap and attribution are unchanged.
- Airport Live Board presents current traffic, exceptions and the live lanes
  before optional advanced analyses. The full V6–V9 and D2–D4 evidence remains
  accessible within a native keyboard-operated details disclosure, with
  localized Czech and English copy. No data fetching or calculation changed.
- Regression tests guard typography tokens, mobile collapsed/expanded
  behavior, map semantics and disclosure order. Production browser screenshots
  must still be manually reviewed after CI; no image-diff baseline is implied.

## Visual System V5: progressive tracker-style information architecture

V5 draws on established map-first flight-tracker interaction principles without
copying another product's branding, artwork, trade dress or proprietary data.
It reuses existing AirRadar APIs and UI rather than implementing parallel
search, aircraft state, weather fetches or ATC polling.

- **V5-A1 (first PR):** direct map search/weather/ATC/filter shortcuts, backed
  by existing state; accessible pressed/disabled states; hidden beneath an open
  aircraft drawer on mobile so the map keeps its breathing room.
- **V5-A2:** consolidate topbar and map HUD hierarchy at 320, 390, 820 and
  1280+ px; no repeated counters or extra always-visible controls.
- **V5-A3:** map weather quick-state/legend and saved preference; unavailable
  weather must show provenance and never appear as a valid current radar frame.
- **V5-B1:** aircraft glance with identity, aircraft type, registration, route
  only when grounded, and four primary metrics; no fake ETA or airport.
- **V5-B2:** progressively reveal aircraft history, situation, data quality and
  weather; preserve existing operational intelligence and watchlist actions.
- **V5-C1:** airport summary with observed movements, weather/runway context
  and clear availability/uncertainty; no unsupported delay or gate claims.
- **V5-C2:** tabs for overview, arrivals, departures, operations, weather, map,
  analyses; preserve V6-V9 and D2-D4 behind an advanced tab.
- **V5-D:** mobile peek/expanded/complete drawer states, keyboard/screen reader
  controls, safe-area handling, fixed navigation, and 320 px compatibility.
- **V5-E:** consolidate semantic CSS tokens, verify visual debt and language
  parity, review CI screenshots manually and perform post-deploy public
  static-asset/console smoke tests.

Each PR must pass lint/typecheck, Vitest, visual:check and the relevant desktop
and mobile browser gates. Avoid performance regressions, unnecessary polling,
new data providers and unsupported aviation certainty claims. Keep the PR open for review; merging to main starts the automated production
release pipeline.

### V5-A2 implemented: compact map HUD

The radar topbar now shows receiver health and UTC without repeating LOCAL and
NETWORK counters. Extended-coverage source counts remain available in the
map HUD disclosure on desktop and in the traffic browser. The filter total
appears on the V5 quick-filter action and traffic browser, not a third map
badge. At <=820px the map uses a single compact control row with the nearby
traffic count; the independent redundant summary card is hidden. Touch
controls retain 44px targets and the traffic trigger retains an accessible
name even when its visible label is hidden at <=420px. Search remains the
primary flexible topbar control.

### V5-A3 implemented: trustworthy weather state

The radar shortcut and timeline now expose a shared selected-frame state: off,
loading, ready, stale or unavailable. An old frame is explicitly marked and
timestamped; other stale catalog frames cannot mark the selected frame stale.
A failed/empty catalog clears the previous image and frame ID and stops
animation, so old radar pixels are not mistaken for current weather. Existing
layer preference, frame selection, cache and 60-second polling are preserved,
without any new provider. An unavailable layer displays localized feedback.
Both A2 and A3 must pass the production browser gate and human screenshot
review before a release.

### V5-A release gate: lazy Operations Center intelligence

The responsive browser gate exposed a real background request inefficiency:
Operations Center mounted an intelligence SSE subscription and one
`/api/intelligence/events?limit=12` fetch for every closed radar view.
It now subscribes only while the Operations Center is open, retaining the
existing stream and cleanup behavior. This reduces hidden background work,
prevents needless pressure on the public intelligence API rate limit and
preserves strict browser console/HTTP error validation; no 429 responses
are suppressed or ignored in test assertions.

### V5-B1/B2: aircraft glance and progressive intelligence

The selected-aircraft drawer keeps the shared four-metric
`RadarTrafficHero` but now displays aircraft type, registration and
observed operator as separate source-backed chips instead of a long merged
text line. Incomplete route enrichment displays only known endpoints and
never renders a fabricated origin-to-destination arrow. Position age is
visibly marked stale beyond 60 seconds. Flight Situation keeps summary,
relevant ATC, available route weather and flight events immediately
accessible; deep navigation integrity, SIGMET, observed aircraft weather
and wind context live in a keyboard-accessible native disclosure. No
provenance, advanced data or existing APIs were removed.

### V5-B3: accessible immediate flight actions

The selected-aircraft summary now carries a single cross-tab quick-action
strip: follow on map (real existing map-follow state), center on map,
flight history, native share/clipboard URL, alert-rule settings and full
aircraft detail. The independent star remains an ICAO watchlist toggle,
not a fake push notification subscription. Follow is disabled for aircraft
without a position. Sharing sends only the canonical public aircraft-detail
link from the user's browser; missing sharing permissions receive explicit
accessible feedback. All actions are reachable without first entering the
Flight tab, use >=44 px tap targets and localized labels.

### V5-C1: airport information architecture

Airport detail now has seven accessible views (overview, arrivals, departures,
operations, weather, map, analytics), horizontal-scroll touch tabs, arrow/Home/End
keyboard navigation, stable `#airport-view-*` deep links and shared airport
operations/live-traffic controllers. The overview uses an airport hero, observed
metrics, weather and live traffic; reference infrastructure remains in a native
disclosure. Map, weather, background airport analytics and the airport nearby
panel mount only in their selected view. Operational quantities are receiver-
observed/inferred: no provider-sourced gates, official delays or fake schedules.

### V5-C2: arrivals and departures

These dedicated tables use the existing bounded airport movement snapshots
only, with search, observed-movement filters, confidence, runway evidence and
links to flight histories. The time column is **observation time**, not a
scheduled arrival/departure or invented ETA. Missing and incomplete sources
are explicitly disclosed; the table never invents delays, gate numbers,
schedules, official flight status or route endpoints. The two lists share
one airport controller and only render in their selected view.

### V5-C3/C4: operations and analytics

Operations has its own observed runway/timeline board, short-range flow
signals, holding/go-around context and an explicit receiver-inference
disclaimer. The default overview no longer repeats the complete flow pressure
analytics. Analytics holds the existing V6-V9 and D2-D4 evidence, plus
historical traffic and movements in a separate dedicated view. These models
remain source-labeled and confidence-aware; switching views never creates a
second airport operations controller.
