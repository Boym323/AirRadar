# Selected-feature reduction — phase 1 (2026-10-19)

This change is **an incomplete, non-deployable-by-default first phase**, not a claim that every
unselected feature has been removed. The source of truth for the accepted and rejected IDs is
the user's explicit keep/remove selection in the ChatGPT conversation on 2026-10-19.

## Removed in phase 1
- 21 obsolete standalone UI routes: historical browser/Flight Story/Time Machine,
  comparisons, intelligence, operations dashboard, procedures, sector explorer,
  watchlist/alerts/fleet/notifications, their admin-only pages and Digital Twin calibration.
- Topbar, mobile, radar rail and command palette links to those routes.
- Generated feature registry references to the deleted pages; backend APIs have not
  been removed in this phase.

## Preservation requirements and dependency conflicts
- **H07 + H14 + S02/S06/S07/S08/S09** require some PostgreSQL sampled history,
  aggregates and/or Flight rows even without historical UI. No schema/tables/data are deleted.
- **R17** needs minimal published ATC sector geometry even though T01–T07 are rejected.
  Do not delete sector geometry required by the preserved map layer.
- **R11** needs a minimal observed/resolved route display, but the full flight-plan and
  route-intelligence / forecasting stack is rejected.
- **L11 + L12** preserve push/Pushover *delivery transports* but reject the alert rule
  editor and historical event analytics. The remaining trigger/delivery policy needs a
  dedicated follow-up design; do not silently disable or invent notifications.
- **W01/W02/W03/W04/W06/W07/W08/W09** remain; wind/Weather Fusion,
  time-machine archives, route and corridor products are rejected.
- **T08/T09/T10** keep ATS and NAVAID/FIX datasets independently of the discarded
  flight-plan prediction stack.
- **E07/E09** retain RXW metadata and FlightAware integration without the rejected
  H1/FPN waypoint overlay or full detail-flight-plan UI.
- **J09** persists sampled history; permanent deletion of database rows or migration
  rollback is explicitly forbidden.

## Validation gate and next steps
1. Run feature registry generation check, typecheck, lint, full Vitest, build, and
   browser smoke. Update stale snapshot/link tests before merging.
2. Inspect server search results for removed /flights and /airspace/sectors links.
   Remove the obsolete result families rather than redirecting misleadingly.
3. Remove each rejected backend lane only after an import/call graph and contract
   review, then prune orphan UI modules, scripts, configuration, localization
   and tests. Keep shared helpers used by retained features.
4. No production deployment until all checks are green and remaining external
   API consumers have been inventoried. Verify release identity and production
   health following deploy. Never run destructive database migrations.

## Phase 2 (staged): remove the live H1/FPN radar overlay

The retained E07 RXW Hub metadata integration is unchanged. The rejected E08 live H1/FPN map functionality no longer registers FPN MapLibre layers or makes 60-second availability and 30-second selected-aircraft waypoint polling requests. Tests ensure the live radar has no FPN imports, layers or client requests. The live H1/FPN decoder, availability API, and cache have now been retired in a subsequent commit; historical archive rows and validation remain readable. No database migration or production deploy is performed by this PR.

The aircraft detail RXW metadata panel no longer renders H1/FPN waypoint lists. The sanitized RXW communications and reported structured route hint (E07) remain accessible. Parsing and historical compatibility continue pending the server-side E08 retirement phase.

The retired historical ACARS/FPN MapLibre renderer and its no-longer-mounted
UI/styles/copy are removed. This does **not** delete persisted RXW route history:
`lib/server/rxw-route-history.ts`, its validated historical decoder, the
migration definitions and database contents remain intact.

## Phase 3 (staged): retire standalone UI modules

Remove orphaned procedure-explorer, ATC airspace-explorer, airport-compare components and their dedicated CSS after removal of their original page entrypoints. Preserve independent NAVAID/ATS navigation browser, published ATC map geometry, airport catalog/airport detail, and all non-UI reference and import pipelines. Add a regression guard so obsolete standalone components do not return. No schema changes or history deletions.

## Phase 4 (staged): drop retired investigation deep links

The shared investigation-link helper keeps only Navigation Integrity and NAVAID/ATS route bookmark validation used by the retained views. Deleted airspace-sector, flight comparison, airport comparison, SID/STAR procedure and sector-history parameter parsers/builders, their obsolete types and validation helpers. Regression test guards the kept and removed exports. No API routes, database tables, historical data, or runtime ingestion are changed.

## Phase 5 (staged): stop retired selected-aircraft requests

The selected-aircraft context hook no longer fetches Flight Intelligence events or the removed route-weather intelligence (formerly per selection and at 120-second intervals). Their quick-detail sections, data props and the OD route-weather component are removed. Preserve ATC context, SIGMET observations and Navigation Integrity. The situation summary remains temporarily pending a separate dependency review; server-side ingestion/calculation is not disabled by this patch.

## Phase 6 (staged): retire flight situation summary in the quick aircraft drawer

Remove the rejected synthesized Flight Intelligence situation summary and its UI adapter from the selected-aircraft detail. Preserve separate ATC advisory context, SIGMET raw context and Navigation Integrity details. This patch does not delete the shared analysis library or historical observations; those require a separate server-side dependency review.

## Phase 7a (staged): stop Digital Twin polling in selected-aircraft context

Remove the rejected 60-second per-selection Digital Twin HTTP loop, local outcome-diff state and snapshots from the aircraft context hook. Keep an explicitly null typed compatibility field until the separate map/display removal, so no stale forecast is rendered and no remaining UI integration makes HTTP requests. Do not remove the shared history or operational runtime until its server-side consumers are audited.

## Phase 7b (staged): remove orphan Digital Twin and Operational Focus map layers

Following the disabled per-aircraft situation polling, unregister eight Digital Twin forecast layers, the Operational Focus line/target layers, the event popups, focus camera/URL callbacks, map legend and the unreachable quick-detail focus section. Preserve the selected aircraft trails, ATC/ATS maps, SIGMET and Navigation Integrity overlays. Other projection libraries and the temporary typed-null Digital Twin value remain until the broader server and Flight Follow HUD dependency audit. No database migrations or production changes.

## Phase 8 (staged): remove live Weather Avoidance classification and UI

The rejected W11 Weather Avoidance classification no longer runs in the radar selection/render path, no longer flows through the drawer props, and is no longer shown as a panel. Preserve aircraft SIGMET context (W06), standalone observed trajectory-deviation context, and Navigation Integrity. The pure Weather Avoidance analysis module and existing unit tests are not deleted pending independent audit of possible server-side imports. No history, database schema, ingest or production deployment changes.

## Phase 9 (staged): unregister rejected Digital Twin Regional Attention radar overlays

Remove the orphan regional-attention map source, its line/aircraft layers, client-side focus events, and associated per-snapshot GeoJSON calculation. Preserve ordinary aircraft trails, ATC and Navigation Integrity map overlays. The pure Regional Attention helper remains until all event publishers and server-side consumers are independently audited; the patch does not touch database history or production.

## Phase 10 (staged): unmount rejected Predictive and Digital Twin detail panels

The retained aircraft detail no longer mounts PredictiveAircraftAdvisories or AircraftOperationalTwin. This removes their live browser requests to the rejected prediction and situation APIs without affecting the aircraft hero photo, ADS-B telemetry, historical altitude profile, receiver context or normal aircraft metadata. Their UI modules, API routes, historical outcome/audit data, and supporting analytical engines remain untouched until server dependencies and data retention are reviewed. Tests assert these panels are not remounted.

## Phase 11 (staged): unmount rejected W10 Weather Fusion in aircraft detail

Stop the retained aircraft detail from auto-requesting the retired W10 Aviation Weather Fusion endpoint by unmounting its component. Keep existing ATC context, public METAR/SIGMET sources, observed BDS 4.4 aircraft weather, historical altitude chart and ADS-B telemetry unchanged. Pure fusion UI/service/API and history are preserved until the cross-import and storage retention audit. Add negative mount regression coverage.

## Phase 12 (staged): unmount rejected origin/destination weather on aircraft detail

Remove the W12-style origin/destination FlightRouteWeather component from retained aircraft detail. This stops its additional route-weather request without impacting the recorded aircraft route, published METAR/TAF airport weather, SIGMET or retained altitude history. Also update the stale visual-refinement test for already-removed PredictiveAircraftAdvisories and Digital Twin UI, preserving hero metrics and mobile drawer expectations. Weather provider/API modules and historical records remain unchanged.

## Phase 13 (staged): delete orphan client-side prediction panel

Now that retained aircraft detail no longer imports predictive advisories, delete `components/predictive-aircraft-advisories.tsx` and its CSS. Retain server prediction endpoints and predictive models/output tests temporarily pending independent runtime dependency and historical-data retention audit; update UI-only tests to assert absence rather than testing retired component timers. No destructive schema changes or production deploy.

## Phase 14 (staged): delete orphan Digital Twin client and obsolete UI-only boundary test

Remove `components/aircraft-operational-twin.tsx`, its CSS and its old Operational Focus UI-only test after the component was unmounted and forecast/map layers removed. Keep Navigation Integrity service and source data, aircraft altitude history and ATC overlays. The rate-limited server endpoint, scoring engines, retained archived observations, and server-side tests remain temporarily until dependency/persistence audit. Regression tests assert absent UI, rather than retaining unreachable client predictions.

## Phase 15 (staged): delete orphan W10 Weather Fusion panel

Delete unmounted `components/aircraft-weather-fusion.tsx` and remove its UI-only test assertions, while keeping on-demand weather service contracts, METAR, SIGMET, BDS4.4 aircraft observations and ordinary ADS-B telemetry. The server endpoint, pure computation library and their unit tests are retained until a server import/storage audit; do not delete historical data.

## Phase 16 (staged): delete the rejected W11 Weather Avoidance analytical module

After removing W11 from live selection and the SIGMET detail panel, delete the now-unreferenced pure `lib/weather/avoidance-intelligence.ts` classifier and its dedicated scenario tests. Preserve the independent observed SIGMET deviation calculations, W06 weather advisories, METAR/TAF, and aircraft weather profile. Keep non-destructive API, database and historical data intact; the CI TypeScript/build gate checks for remaining imports.

## Phase 17 (staged): remove orphan Operational Focus card and drawer summary

Delete unused map focus card and compact drawer summary components and their dedicated CSS, following retirement of their sole live consumers. Keep actual selected-aircraft telemetry, ATC overlay and Navigation Integrity. Outcome/historical back-end data and scorer modules remain intact pending independent server dependency review. Regression tests assert that these removed UI modules do not reappear.
