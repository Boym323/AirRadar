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

## Phase 12 (staged): repair CI after retired predictive/Digital Twin UI deletion

Removed the obsolete prediction-timeline UI-only boundary test, and updated three surviving test suites to stop importing deleted PredictiveAircraftAdvisories/AircraftOperationalTwin components. Retain read-only checks of the legacy server prediction evidence whitelist and Digital Twin promotion safeguards, until their API dependencies and persistence are reviewed. Czech UI test no longer demands copy inside removed UI. New feature-boundary assertion protects against accidental restoration of discarded panels and the obsolete test. No DB changes.

## Phase 13 (staged): remove unreachable Digital Twin forecasts from the retained Flight Follow HUD

Flight Follow remains available, with identity, live altitude/speed/vertical-rate telemetry, known destination, the existing route waypoint context, follow toggle and compact drawer mode. The always-null Digital Twin compatibility prop and dead ETA, predicted runway and forecast weather rendering have been removed from this HUD. No additional network requests, database changes or migrations. Tests protect the retained follow interaction and the absence of retired forecast content.

## Phase 14 (staged): prune unused Regional Attention map-only projector

Removed the obsolete `lib/operational-twin/regional-attention-ui.ts` and its dedicated visualization test, which had no radar consumer after removing D-layer event listeners and GeoJSON sources. Preserve historical Regional Attention outcome validators, promotion/graduation logic and stored data; this is not a server/runtime migration. The explicit feature-boundary regression confirms the dead UI projector remains removed without deleting persisted outcome modules.

## Phase 12 (staged): retire Digital Twin compatibility API shape

The selected-aircraft context hook now returns only the retained ATC result. All temporary typed-null Digital Twin and Operational Focus return fields and type imports are removed after confirming that map, flight-follow and drawer call sites no longer consume them. Regression tests protect the ATC context and ensure the rejected Digital Twin type is not reintroduced. Historical data and server APIs remain unchanged.

## Phase 18 (staged): retire unused public read APIs

Remove eight read-only API entrypoints whose standalone pages or selected-aircraft consumers
were retired in the preceding phases: Time Machine range/window (H11/H12), Flight
Intelligence events/analytics (P01-P03), regional/predictive Operations views (P15,
D09-D12), selected-aircraft route-weather (W12) and Weather Fusion (W10).

Preserve all PostgreSQL history, stored outcomes, ingestion services, and archived observations.
This phase changes no migrations or databases. Shared weather provider, route reference,
Navigation Integrity, retained altitude history, and published ATC map geometry stay intact.
Remaining server pipelines and internal libraries require a separate import/call graph review
before removal; old external consumers of these removed routes receive 404 after deployment.

Do not merge/deploy until the full CI, build and runtime smoke pass against the new head.
The PR remains draft and release validation/production gates still require explicit review.

## Phase 19 (staged): retire the unused Flight Intelligence SSE endpoint

Remove the Flight Intelligence SSE route and its route-only test after its client UI was deleted.
Preserve shared SSE capacity management for live radar, OGN and system streams. Retain stored
FlightEvent history and the shared runtime producer until notification and database dependencies
have been audited. Retire Time Machine and Flight Intelligence rows from the feature registry;
update the generated English and localized Czech tables. No DB/schema migration or deploy.

## Phase 20 (staged): retire R13 receiver marker and range rings

Remove public receiver marker rendering, MapLibre ring layers, menu control,
preset flag, helper and dedicated tests. Preserve internal receiver coordinates
for local airport proximity and initial map centering. Previously saved presets
with the retired ring flag remain loadable and silently discard it.

## Phase 21 (staged): align old route-boundary tests with retired APIs

Rewrite stale public API contract assertions for discontinued regional Operations,
predictive overview and on-demand Weather Fusion endpoints as negative existence
checks. Preserve the remaining tests for internal serializers, anonymous outcome
storage and independent meteorological sources until the backend import/retention
audit. Do not restore deleted endpoints merely to satisfy obsolete tests.

## Phase 22 (staged): retire T11 SID/STAR client and public API

Removed the retained radar SID/STAR switches, public `/api/procedures` route,
procedure MapLibre layers, fetch/polling effects and the orphan map geometry helper.
Preserved ATS route network, NAVAID/FIX references and other selected map overlays.
Legacy map presets strip the rejected `showSids` and `showStars` fields on parse.
Pure procedure parsing/repository code is left temporarily until all server/scripts
consumers are audited; no historical procedure source data is deleted.

## Phase 23 (staged): retire standalone airport operations and historical-flight API routes

Retired three public airport operation/traffic APIs (A03-A12) and the historical
flight list/flight story APIs (H05-H09). Kept airport list/details, aircraft
quick detail, `/api/history/:hex`, statistics/storage services and all recorded
Flight/FlightPosition rows. Pure server aggregation/flight-history helpers remain
while shared callers and database writer contracts are audited. Removed only
route-owned tests; retained query/persistence regression tests and no migrations.
Existing external consumers of removed URLs will see 404 after deployment.

## Phase 24 (staged): retire T12 planned AUP/UUP map and API paths

Remove public current/historical AUP API routes, the radar query hook,
planned-airspace UI toggles, stored map preset fields and MapLibre plan overlays.
Simplify ATC GeoJSON to published sector geometry only while retaining map
selection, transmitter and ATS reference layers. Historical plan archives,
persistence, and shared ATC sector data remain unchanged pending an independent
server ownership audit. No schema changes or data deletion.

## Phase 25 (staged): retire T02-T07 standalone ATC diagnostics and traffic APIs

Delete sector history, traffic, transition and prediction-validation public endpoints.
Keep published sector data for the explicitly retained radar ATC geometry and
ATS route sources; preserve aircraft context and existing historical observations.
The former endpoint-specific rate-limit tests are removed; shared rate limiter
and bounded internal service tests remain. This does not remove ATC background
parsing or history tables; those require a later import/persistence audit.

## Phase 26 (staged): reconcile newer main map-base extraction

Merged upstream main bc2f5fc17277 through an explicit two-parent commit, with
manual adaptation of the new base-overlay module. Unlike upstream, this module
must not register retired R13 receiver rings or T11 SID/STAR sources. Published
ATS routes, navigation data, weather radar and Navigation Integrity sources are
registered once from the new helper, preserving the tested lifecycle.
Upstream changelog and historical code metrics are retained; subsequent code
metrics must be regenerated after release integration and successful CI.

## Phase 27 (staged): align release-preview with retained routes

Replace obsolete Time Machine, History, Watchlist and Operations route smokes with
selected airport, navigation, navigation-integrity, weather, system and receiver
pages, and explicitly assert HTTP 404 for removed page routes. Preserve browser
responsive sweeps, language switching, retained aircraft quick actions, and
live radar/weather/receiver/aircraft visual evidence. Update assertions referring
to removed AUP/UUP map hook and presets. Do not merge or deploy until the exact
head passes all required checks.

## Phase 28 (staged): synchronize release visual scope with selected features

Remove screenshot target registrations for retired airport live boards, predictive
panels, standalone watchlists, notification centers and Operations dashboards
from the release gate planner. Keep selected live radar, airport map, aircraft
detail, weather, receiver and system targets. Retired feature file paths fail
closed to the full browser gate rather than requesting deleted screenshots.
The release planner's tests now assert that every targeted screenshot exists in
the actual production capture registry. No production deployment authorized.

## Phase 22 (staged): repair release-preview checks against retired surfaces

Update outdated test assertions that require removed Operations, History,
Intelligence or receiver-marker UI. Keep the browser smoke strictly interactive:
use the visible mobile airport navigation link and restore the desktop viewport
for locale checks; select retained Navigation from the mobile More menu.
No deleted page or API is reintroduced.

## Phase 29 (staged): remove automatic Digital Twin sampling from receiver polling

Remove the rejected D01-D23 background calibration sampler that periodically
filtered/sorted the entire local aircraft map and called the Operational Twin
situation builder. The live receiver snapshot loop no longer schedules this
unused synthetic request, and shutdown no longer waits for the sampler. Keep
the existing historical outcome persistence and its graceful shutdown, retained
receiver statistics/history, and Navigation Integrity. This step does not yet
remove the other predictive/intelligence/twin observers; they require a separate
import, alert and persistence dependency audit. Also align the release browser
geometry contract with four retained aircraft quick actions, and keep a bounded
429 allowance for the still-existing situation API until that endpoint retires.

## Phase 30 (staged): retire stale autonomous-calibration test expectation

Update the Digital Twin Event Outcome boundary to assert absence of the removed
periodic sampler rather than require that retired background computation.
Retain request-driven outcome capture, existing truth-source boundaries and
persistence-shutdown assertions. The old descriptive source marker
`refreshDrivenSampling` is historical diagnostic metadata, not an active sampler.

## Phase 31 (staged): preserve real Traffic/Layers collision checks at 821px

The release browser sweep confirmed all 28 static visual targets but hit the
821px desktop breakpoint where HUD controls can wrap. Replace the obsolete
left-to-right-only assertion with a two-dimensional rectangle overlap check.
The dropdown still must stay outside the open drawer, and failures now report
measured rectangles for diagnosis. Do not weaken the selected-aircraft drawer,
accessibility, or responsive smoke checks.

## Phase 32 (staged): decouple rejected analytics from notification transports

Retire the per-snapshot Flight Intelligence detector scan and predictive shadow
candidate/evaluation loop, including their AlertEngine adapters for discarded
P01-P15, D01-D23 and L01-L10 analytical notification rules. Remove their old
FlightEvent-to-occurrence lookup from AlertEngine (no DB rows or history deleted).
Keep the independent Pushover durable delivery worker and existing Web Push
notifier/queue, together with local receiver statistics, persisted altitude/
flight history, Navigation Integrity and retained aircraft telemetry.
Existing non-analytical AlertEngine.observe transition handling remains a separate
legacy lane until explicit trigger/transport policy is finalized; neither L11
nor L12 implies re-enabling selected-out alert rules.

Historical predictive/Flight Intelligence read APIs remain compatibility surfaces
but will no longer receive newly generated live predictions/events. They require
an explicit removal/consumer audit. No automatic backfill, data deletion or
schema migration. Update source-level regression contracts and drop tests that
assert the retired analytical notifier behavior.

## Phase 33 (staged): retire W12 route-weather browser fixture

The responsive browser sweep still waited for removed W12 route-weather widgets
inside the selected-aircraft Situation tab. Remove the obsolete mocked API,
widget selectors and flight-situation summary expectation. Preserve the real
ATC panel, retained advanced-disclosure navigation integrity/weather evidence
and the quick-detail tab interaction test.

## Phase 34 (staged): retire obsolete FlightEvent canonical-id unit test

Full release tests exposed one legacy test whose sole purpose was calling the
removed `AlertEngine.resolvePersistedFlightEventId` private helper. Delete it
and replace it with a negative dependency regression: the delivery engine must
not import the FlightEvent ORM or recreate that lookup. Keep history tables
and delivery worker unchanged.

## Phase 35 (staged): retire stale Digital Twin browser data-layer assertions

The full browser release gate reached the 821px data-layer verification but
still required old D01-D23 `operational-twin-v2` map sources and layers.
Restrict the authoritative live map data-layer verification to retained
airport locations, ATC sector map context, ATS routes and SIGMET. Preserve
fixture-backed feature-content/cross-country checks; do not bring back Twin
map sources just to satisfy an obsolete browser assertion.

## Phase 36 (staged): remove Digital Twin validation from live ADS-B snapshots

Remove five Digital Twin outcome/trajectory/event/regional validators and the
Aircraft Operational Focus observation from the LOCAL receiver snapshot path.
Eliminate the per-snapshot calibration flush scheduling. Keep the ordinary local
ingest, statistics, alert delivery, navigation integrity, trails, history and
source-affinity processing intact. Regression tests now assert that rejected
`snapshot.operationalTwin` and nested `twin.*` timings are absent while
retained statistics/Navigation Integrity still run.

This is **hot-path isolation only**: the legacy Digital Twin request APIs,
on-demand capture methods, startup calibration hydration/persistence and their
modules are intentionally still present. Removing them, along with the old
AlertEngine and its rules, requires a separate dependency-checked patch. No
database migration or historical data deletion is part of this change.

## Phase 37 (staged): retire synthetic Digital Twin benchmarks

Delete the T57 standalone GitHub workflow, replay-only test and benchmark script.
The 1x/2x/4x load-scaling workflow now measures retained snapshot application,
SSE fanout and ATC geometry only, using output schema version 2. Remove its
disconnected Twin validator timing report and obsolete CLI entrypoint. The
snapshot comparison diagnostic list now names retained snapshot paths instead
of retired Twin and Flight Intelligence timings. No claims of measured CPU
savings are made until a matched before/after live-snapshot benchmark is run.

## Phase 38 (staged): retire Digital Twin request endpoints and server assembly

Delete the retired public aircraft situation endpoint, all five Digital Twin
admin calibration/graduation routes and the now-unreachable server situation
assembler. Remove obsolete boundary tests that intentionally demanded these
rejected APIs; replace them with a negative route regression. Preserve the
independent Navigation Integrity feature, recorded aircraft history, and ATC
map geometry. This does **not** delete existing PostgreSQL calibration tables
or change schema. The in-process calibration validators and their diagnostics
still need a dedicated removal phase before merge.

## Phase 39 (staged): remove orphan Digital Twin in-process calibration

Drop the seven Digital Twin validation instances, startup hydration, shutdown
persistence flush and the rejected report/capture API from AircraftStateService.
Retire the unused calibration persistence implementation and its dedicated
unit test; leave all historical database tables/records intact. System-status
no longer exposes orphan Twin validation fields. Local reception startup no
longer awaits optional Digital Twin calibration hydration, but retains stats,
Navigation Integrity, history, core delivery and receiver diagnostics.

## Phase 40 (staged): remove abandoned Digital Twin validators and replay tests

Delete eleven unused in-memory Twin validation modules for outcome, event,
trajectory-quality V1/V2, graduation/promotion, truth-first recall,
regional attention and aircraft focus, together with eleven isolated
unit-test suites. Remove obsolete barrel exports and add a negative regression
for the retired modules. Preserve the shared corridor model/typing temporarily
because weather-corridor consumers still import its types, and leave all
historical database rows and the independently retained Navigation Integrity
service untouched. The remaining Twin projection/map libraries need a separate
consumer audit before deletion.

## Phase 40a: decouple retained runtime-performance API from deleted validators

The retained runtime-performance endpoint previously imported Twin Event Outcome
forensics after the validation module had been deleted. Remove this orphan import
and the obsolete `validatorPaths` / `operationalTwinForensics` telemetry fields.
Preserve ingest, CPU, health phases, event-loop, stall evidence and admin/public
access policies. No historical measurements or live receiver behavior change.

## Phase 41 (staged): remove abandoned Twin overlays, forensics and attention models

Remove nine Twin-only libraries: situation map overlays, Aircraft Operational
Focus map/navigation/change/focus projections, regional attention and situation
models, focus queues, historical Twin forensics and retired trajectory-truth
helpers, along with eight direct unit-test suites. Remove their obsolete barrel
exports and guard against reintroduction. Retain the weather corridor's shared
type dependencies and preserve the separately implemented Navigation Integrity,
ATC map context, receiver history and notification transport stack.

## Phase 42 (staged): retire the last Digital Twin domain modules

Remove the seven remaining `lib/operational-twin/` files (corridor, events,
index, navigation-integrity corridor **projection**, trajectory-quality V2/V3,
and Twin-specific types) and five tests for rejected Twin forecasts. Extract
the minimal structurally equivalent corridor input types into the independent
`lib/weather/corridor-intelligence.ts` weather model, preserving its existing
PIREP/SIGMET test coverage and semantics. This is *not* removal of the retained
`lib/server/navigation-integrity` service, receiver weather observations,
METAR, SIGMET or historical PostgreSQL aircraft positions.

## Phase 43: remove ATC shadow prediction without removing current-sector matching

Remove 165 lines of on-receiver ATC shadow worker queue/validation and state,
the unnecessary config flag, prediction validation library and its tests.
Drop retired ATC shadow counters from memory-retention attribution and align
current-sector tests. Preserve live ATC sector matching, published sector
geometry, ATS/NAVAID/FIX, navigation integrity, history and push delivery.
No database migration, main merge or production deployment.

## Phase 43a: decouple retained aircraft context from ATC shadow validation

Keep the on-demand aircraft/ATC context route and live current-sector matching. Remove its old per-request prediction classifications and validation writes, now that the obsolete shadow worker has been retired. Preserve existing rate limits, aircraft identifier checks, current-airspace context and error handling.

## Phase 44 (staged): retire unconsumed aircraft prediction endpoint

Delete the legacy `/api/aircraft/:hex/prediction` endpoint whose client and
advisory panels have already been removed. Drop obsolete advisory API boundary
tests and generated registry references, including the stale Explainable
Prediction feature. Update outcome/readiness boundary tests to enforce 404.
Do not remove the independent system admin readiness endpoint in this phase;
that retained page must be decoupled before deleting the predictive library.
Historical PostgreSQL records and migrations are untouched.

## Phase 45 (staged): remove admin prediction calibration dashboard

Unmount the retired predictive readiness/calibration UI from the retained
System page, stop its automatic data fetch, delete the admin readiness API,
and update both generated feature tables. Remove the stale Digital Twin
outcome card that was already unsupported by the server. Preserve live
receiver diagnostics, ATC/Navigation Integrity health, runtime timeline,
weather observability and historical database schema. Predictive collector
libraries and old unit tests still require a separate retirement phase.

## Phase 46 (staged): stop constructing idle predictive state on server startup

Remove the orphan PredictiveStateStore instance from the retained aircraft service,
its shutdown flush, dead accessors and diagnostics. The live ADS-B pipeline no
longer instantiates or owns a predictor; the retained system status no longer
publishes the old prospective validation field. This does not delete the still
imported prediction model library or historical outcome/observation rows;
these have independent tests and require a separate dependency-checked removal.

## Phase 47: align tests with rejected ATC and predictive surfaces

Replace stale ATC-shadow configuration assertions, prediction-route runway
boundary checks and browser contracts that required the removed admin
readiness dashboard. Retain coverage for current ATC sector enablement,
system status polling, historical safety checks and the canonical production
fixtures. Do not restore rejected endpoints or config solely for old tests.

## Phase 43 (staged): retire the orphan recap read endpoint and assembler

Remove the orphan daily/weekly `/api/recap` read endpoint, its 448-line
server-only recap assembler, and the now-obsolete isolated recap unit test.
Preserve receiver statistics, sampling and all historical PostgreSQL rows,
recorded FlightPosition and existing retained public history endpoints.
Synchronize the feature registry and both EN/CS API inventories. External
consumers of the retired endpoint will receive 404 after deployment.

## Phase 48 (staged): remove retired predictive research engine and admin evidence

Delete the 31 unconsumed `lib/predictive-intelligence/` modules, orphan server
readiness/prospective-retention/predictive-projection helpers, stale watchlist
predictive scoring, retained-only-for-research flight-evidence endpoint/widget,
and associated replay/validation scripts, timer unit files and direct unit tests.
Replace the source-level predictive optimization boundary with negative
regressions; drop obsolete CLI aliases and aircraft-state re-exports. The live
predictive state and public/admin prediction endpoints were retired in earlier
phases; this changes no ADS-B or Navigation Integrity behavior. Do not delete
historic FlightEvent, PredictiveObservation, FlightPosition or existing schema
migrations; a deployed legacy systemd timer must be disabled as part of the
later supervised deployment, not while this PR is in draft.

## Phase 48a (staged): sync the retained system feature registry

Remove the deleted admin flight-prediction evidence route from the system
observability registry and both generated/localized feature tables. The
system feature description now lists only supported receiver diagnostics;
predictive readiness and graduation no longer appear as active promises.

## Phase 48b: retire predictive airport board and stale rollout contracts

Delete the orphan airport-operations client hook (which continued trying the
retired `/api/operations/predictive` endpoint), the rejected V7 arrival
sequence and dependent V8 arrival-flow prediction projection. Remove their
isolated tests and the old rollout/accuracy unit suites that require deleted
Predictive Intelligence modules. Preserve the independent airport catalog,
airport detail, weather, `AirportOperationsResponse` types shared by legacy
airport domain helpers, and actual history records. Retain the unrelated CSP
security boundary while replacing the obsolete prediction-export test with
negative regression checks. No migrations or deployment.

## Phase 49 (staged): delete idle Flight Intelligence producer and replay analytics

Remove the unused FlightIntelligenceService singleton allocation and diagnostics
from AircraftStateService. Delete its obsolete detector/persistence backend,
retired analytics report, replay/operations/situation helper libraries, old
standalone CSS and their isolated replay/corpus/quality scripts and tests.
Keep shared Flight Intelligence event type definitions provisionally for
remaining historical/notification DTO consumers; preserve destination
provenance, all persisted Flight and FlightPosition / FlightEvent data,
Navigation Integrity, retained aircraft history endpoints, ADS-B ingestion and
Web Push/Pushover transports. No tables, migrations or production config are
changed. Add a negative source-level guard against re-instantiating the old
producer from live state.

## Phase 49a (staged): decouple retained load benchmarks from deleted detector

The old live-performance benchmark still instantiated FlightIntelligenceDetector
and mutated its private nearest-airport lookup; this no longer exists. Remove
these dead scenarios and the misleading before/after comparison. Keep the
actual retained snapshot-apply, SSE fanout, source merge, cache and ATC
geometry benchmarks. Version the isolated load-scaling report to schema 3
with `snapshotApplication.full` only; the old airport-catalog comparison and
synthetic Flight Intelligence nearest-airport experiment are retired. Update
regression tests and avoid attributing invented CPU savings to this cleanup.

## Phase 49b: remove last orphan Flight Intelligence replay-only tests

The full Vitest run found two tests importing the deleted operations-center
projection and prospective terminal-evidence classifier. Both only tested the
rejected prediction/Flight Intelligence domain, not retained historical
readers. Delete these two test suites and extend the negative regression guard.
Leave all FlightEvent and FlightPosition records, migrations and history APIs.

## Phase 50 (staged): decouple the retired AlertEngine from ingest

Remove all live calls to old alert rules from local snapshots, history first-seen
writes, enrichment updates and reception-record evaluation. The receiver no
longer instantiates AlertEngine. Preserve aircraft history, statistics, Navigation
Integrity and the independent durable delivery worker. The legacy status remains
disabled for system compatibility; no new alert signals are generated.

## Phase 51 (staged): retire legacy alert/watchlist/fleet APIs and state

Remove 16 public/admin rule, watchlist, geofence, fleet, notification-center
and simulation API routes, six orphaned UI modules, legacy AlertEngine, old
simulation/effectiveness analytics, obsolete notification-center state and their
isolated tests. Keep Web Push subscription/VAPID endpoints, Pushover delivery
worker, delivery queue/database contracts and admin delivery-health API.
The legacy watchlist session endpoint remains temporarily because system and
delivery diagnostics still depend on its authentication contract. No destructive
database migrations, queue purges, deployment or main-branch changes.

## Phase 51a (staged): repair release boundaries and authoritative documentation

Replace the old production watchlist-mutation smoke with 404 assertions for
retired endpoints. Reconcile docs/features.registry.json and regenerate the
English feature table, alongside a current Czech feature overview. Both now
describe retained pages/APIs only and clarify that preserved notification
transports do not automatically generate new alerts.

CI/CodeQL/load scaling must be checked on the final commit before merge.
Do not treat reductions in source lines as measured CPU/RAM savings.

## Phase 51b (staged): strip legacy alert rule write repository

Remove all unused fleet, matcher, geofence, rule and AlertOccurrence creation
methods and the V1 evaluation engine/types. Keep the existing AlertOccurrence
and AlertDelivery database records and migrations intact. Retain historical
occurrence reads and the delivery worker's claim, retry, stale claim recovery
and health contracts. The receiver logbook no longer loads legacy server
watchlists; its deprecated wire counter is zero pending compatibility removal.

## Phase 51c (staged): retire unused server watchlist storage

Remove the JSON rule config reader, server watchlist store and mutation
validation endpoint helper, along with their now irrelevant tests. Preserve
the separate browser-local watchlist matcher: it is still used by live radar
filters and does not evaluate server rules or produce alerts.

## Phase 52 (staged): remove obsolete Airport Intelligence analytics

Remove the old airport movement inference pipeline, Airport Operations V1
projection, terminal-demand horizon V9, V3 Airport Intelligence inference
and standalone Movement Analytics UI/CSS/copy. Delete their abandoned
standalone unit suites, obsolete quality CLI and generated quality artifact.
Preserve canonical airport catalog/detail/infrastructure, nearby-aircraft
logic, runway metadata, METAR/TAF and independent historic traffic readers.
Add a negative regression gate for deleted modules and preserved endpoints.
No database migration or production deployment.

## Phase 53 (staged): retire unused weather-fusion and weather-corridor analytics

Delete the unused on-demand Weather Fusion server, generic fusion evaluator
and independent meteorological corridor prediction engine, plus their
isolated tests. Keep the retained METAR/TAF/SIGMET and weather-radar
providers, aircraft observations, aircraft SIGMET overlays and current
route-weather context. No hot-path weather calculations are introduced,
no persistence or schema migrations are modified, and no deployment occurs.

## Phase 54 (staged): retire standalone playback, Flight Story prose, recaps and procedures

Delete unmounted Time Machine playback/window/event utilities, Flight Story
narrative assembler and unused read-only alias, daily recap interpreter, and
standalone SID/STAR procedure import pipeline and synchronization script.
Remove their isolated tests and the stale `procedures:sync` command. Drop the
orphan ATC sector traffic panel and obsolete Fleet Explorer locale helper.
Preserve sampled aircraft history, flight/position/event tables, generic
history API, ATS navigation routes/FIX data, live ATC map geometry and
independent history/statistics API consumers. No database migrations or main
branch/production changes. Full CI must check for remaining source imports.

## Phase 55 (staged): remove unused modeled wind and sector history analytics

Remove abandoned ICON-EU/ALADIN wind-aloft network client and its former
wind-fusion adapter, unrelated to retained direct BDS aircraft weather and
runway METAR wind-component calculation. Retire unmounted ATC sector history
batch/DTO modules and their dedicated integration test, plus obsolete operations
stylesheets. Retain live sector matching and published geometries, sector map,
ATS routes, airport/runway wind computation, METAR/TAF/SIGMET and persisted
FlightPosition records. No schema migration or release deployment.

## Phase 55a: repair retained map-context range and stale test imports

The retained map-context range API no longer imports Time Machine. Its traffic
playback range is explicitly nullable while METAR/AUP/radar archive ranges
keep their existing contract. Remove abandoned ATC history benchmarks and
specialized analytics tests. Move the retained ATC channel-spacing formatter
to the shared frequency-policy module; update its test instead of losing
spacing provenance. Keep J10 synthetic aircraft exclusively as test fixtures;
update the T58 boundary test to import the isolated fixture. Refresh radar
and Czech UI tests that previously read a retired ATC component.

## Phase 55b: retire orphan notifier factories while retaining delivery transports

Remove the unused legacy AlertNotifier factory, duplicate Pushover HTTP sender
and predictive/Flight-Intelligence alert formatter. Keep the independent
durable Pushover worker and DB-backed queue, passive delivery-health reporting
and the Web Push VAPID/subscription/sending transport. Declare Web Push's
minimal delivery payload contract locally so it no longer imports an obsolete
alert producer. This does not restore event detection or create fresh alerts.

## Phase 56: fail-closed smoke semantics for J10 retirement

The isolated production-gates environment has no real readsb/Beast receiver,
network provider, or PostgreSQL URL. After retiring J10, the correct API health
state is explicitly degraded with provider readsb-unconfigured,
readsb offline, database not configured, and zero fabricated aircraft. Update
only this isolated gate to assert those exact properties; do not weaken
real deployment health checks or restore synthesized production traffic.
Keep explicit Beast-only source support if configured.

## Phase 56a: preserve selected-aircraft smoke with a loopback readsb fixture

The visual smoke targets intentionally select real traffic drawer rows. J10's
production mock has been deleted, so an isolated gate without input correctly
had none. Add a tiny localhost-only HTTP readsb wire fixture inside the
production-gates test harness (not deployed runtime), serving deterministic
aircraft.json and receiver.json. Run real readsb normalization, SSE and browser
selection against that fixture; keep public health degraded because the
isolated PostgreSQL DB is absent and ensure it reports real readsb transport
rather than mock. The separately tested unconfigured production provider
still fails closed. Shut down the fixture with the child process.

## Phase 57: retire orphan alert JSONL presentation and legacy intelligence stream

Remove the no-longer-called Flight Intelligence SSE UI hook and analytics DTO,
the legacy JSONL alert-history page/store and its isolated unit test. AlertV1
historical PostgreSQL tables, records, read-only occurrence/queue APIs,
Pushover worker, Web Push transport and admin authentication remain unchanged.
The memory-test script now exercises the durable delivery worker instead.
No migrations or persisted data are deleted.

## Phase 57a: prune unreachable visual regression fixtures

Remove more than 900 lines of abandoned visual fixtures and smoke paths for
retired recap, airport movement intelligence and predictive advisory/admin
screens. The current visual target inventory contains none of these screens.
Retain real browser coverage for the live radar, ATC/ATS map, airport/weather,
aircraft details, receiver, System and local ADS-B normalization. The isolated
readsb wire fixture now supplies NIC/NACp/SIL integrity fields so the retained
advanced ADS-B telemetry disclosure is actually mounted and tested. No
production receiver fallback or transport logic is altered.

## Phase 57b: align visual regression tests with retained features

Update five stale suites that still required eliminated prediction, recap,
airport operations and Truth Accuracy visual fixture data. Replace their old
expectations with regression guards against reintroduced APIs and positive
checks for the retained System status, readsb NIC/NACp/SIL telemetry, airport
map, radar, weather and receiver smoke. Remove the unmounted Operations Center
opener from the release smoke worker. The application and database are unchanged.
