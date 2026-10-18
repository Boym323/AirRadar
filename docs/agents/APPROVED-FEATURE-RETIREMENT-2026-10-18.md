# Approved AirRadar feature retirement — implementation plan (2026-10-18)

[Česky](../cs/agents/APPROVED-FEATURE-RETIREMENT-2026-10-18.md)

> **Task-specific authorization and execution checklist, not a global policy.**
> Read [AGENTS.md](../../AGENTS.md) first, then [CODEX-CONTEXT.md](../CODEX-CONTEXT.md) and only the relevant implementation and tests. This document authorizes **product-level retirement** of the listed features, not destructive production data deletion, a manual deployment, a production config edit, bypassing tests, or overriding release safeguards. Verify fresh origin/main and production identity before every batch.

## Authorized retirements (15 named selections)

1. SondeHub radiosondes (REST/MQTT, map layer, provider, route, related tests).
2. NOAA Space Weather context (optional Kp context and endpoint).
3. Saved Workspaces (/workspaces).
4. Historical Baselines (/baselines); keep underlying statistics.
5. Aviation Event Feed (/events); keep source Flight Intelligence, alert, airport and Navigation Integrity events.
6. My AirRadar (/my-airradar); keep shared underlying data/services.
7. Aircraft Discovery (/discover); keep common logbook data.
8. Route Network Explorer (/routes and /routes/:origin/:destination); keep shared traffic statistics.
9. Follow Flight / Journey (/journeys and its flight-detail control); keep flight history and actual events.
10. Mobile Spotter Mode (/spotter and spotter-specific saved spots API).
11. Track Fusion Shadow (shadow-only estimator, outcome/readiness diagnostics); preserve canonical source merge and receiver history.
12. PRG Spotting Mode (a subfeature of Mobile Spotter; do not count/remove it twice).
13. Camera AR (a subfeature of Mobile Spotter; do not count/remove it twice).
14. Optional 3D radar (terrain, 3D aircraft runtime/models, UI controls, device gate); preserve 2D MapLibre and normal marker rendering.
15. Modeled wind in Operational Digital Twin (wind-aloft fetch, weather-corridor wind-dependent calculations, wind-timing shadow and promotion); preserve unrelated SIGMET, PIREP, actual BDS observations and canonical predictions.

**What remains:** local readsb/BEAST, validated network provenance/fallback (ADSBHub/ADSB.lol), canonical position merge, alerts and watchlist, SSE, Time Machine and historic positions, aircraft and airport pages, aviation events as source facts, navigation/ATC, Navigation Integrity, real aircraft-observed weather, non-wind weather including METAR/SIGMET/PIREP/radar, usable canonical Digital Twin features, and public sanitized diagnostics.

A selected feature may be retired even if it is actively consumed; product-level behavior change is approved. **Technical safety remains mandatory.** Do not falsely classify working features as dead code. Remove the external contract only when route ownership and clients have been traced and the acceptance tests have been changed intentionally, rather than weakened. Do not delete shared data or DB history.

## Execution environment prerequisite

The operator's instruction is to implement each independent batch in a **non-serving, full repository checkout with dependencies**, run all required local checks, then use the repo's **single-writer, verified, non-force direct-main** process. A push to main can cause automatic production deployment. Never push runtime changes when tests cannot run, the checkout is not isolated, current production/environment diagnostics cannot be examined safely, or the single-writer lease is unavailable. Those are BLOCKED prerequisites, **not** justification to weaken the rules or fabricate measurements.

Read current code and check live production flags through authorized *sanitized, read-only* surfaces. If inaccessible, state production state **UNKNOWN**; do not guess or retrieve secrets. Historical CI/T58 cannot prove the current deployment.

## Dependency-aware batches

### Batch A — isolated optional upstreams (SondeHub, NOAA)

- SondeHub: investigate `app/api/sondes/**`, `components/radar/use-sondehub-map-layer.ts`, `lib/server/sondehub-provider.ts`, `lib/server/sondehub-mqtt.ts`, map UI toggle/state and storage keys, `tests/sondehub-*`, relevant documentation and configuration flags. Remove listeners/timers and all first-party consumers; ensure no frontend poll nor server MQTT connection remains. Preserve ADS-B/OGN.
- NOAA: investigate `app/api/navigation-integrity/space-weather/route.ts`, `components/navigation-integrity-space-weather.tsx`, `components/space-weather-context.tsx`, `lib/server/noaa-space-weather.ts`, `lib/server/space-weather.ts`, `tests/noaa-space-weather.test.ts` and `tests/space-weather.test.ts`. Preserve **Navigation Integrity itself** and its aircraft anomaly signals.
- Explicit negative tests: no network request/connection, removed routes do not appear in registry, Navigation Integrity/radar remain usable.

### Batch B — standalone pages with shared backends preserved

- Saved Workspaces: `app/workspaces`, `components/saved-workspaces*`, `lib/workspaces.ts`, navigation, `tests/saved-workspaces-v1.test.ts`.
- Historical Baselines: `app/baselines`, `components/historical-baselines*`, `lib/historical-baselines.ts`, `tests/historical-baselines-v1.test.ts`; **do not delete** `lib/navigation-integrity/baseline.ts` or performance-baseline tooling due to similar filenames.
- Aviation Event Feed: `app/events`, `components/aviation-event-feed*`, `lib/aviation-event-feed.ts`; **retain** `/api/intelligence/events` and primary Flight Intelligence event processing.
- My AirRadar: `app/my-airradar`, `components/my-airradar-home*`; preserve watchlist, favorite airports, SSE and logbook backends.
- Aircraft Discovery: `app/discover`, `components/aircraft-discovery*`; preserve `/api/logbook/summary`.
- Route Network Explorer: `app/routes/**`, `components/route-network-explorer*`, `components/route-network-detail*`; preserve shared `/api/statistics/traffic`.
- Followed Journeys: `app/journeys`, `components/followed-journeys*`, `components/follow-journey-button.tsx`, `lib/followed-journeys.ts`; preserve canonical flight lifecycle/history and intelligence events.
- Remove links from sidebar, dashboard cards, mobile navigation, bookmarks help, feature registry and docs, plus only feature-specific tests. Never delete shared services solely because a removed page used them.

### Batch C — Mobile Spotter and both selected subfeatures

- Remove `app/spotter`, `components/mobile-spotter-mode*`, `components/spotter-camera-ar*`, `app/api/admin/spotter/saved-spots`, their exclusively owned `lib/spotter*`, camera projection, PRG helpers and `tests/spotter-*` **only after proving exclusivity**. Some generic location/geometry helpers or schemas may be used outside Spotter.
- Trace storage keys, public PWA/nav links, receiver/map overlays, notifications, shared saved-spot data and permissions. Do not delete underlying DB historical records or schema by default. Preserve mobile layout/PWA for the primary radar, and keep device/location permission boundary tests where they protect shared components.

### Batch D — optional 3D radar

- Trace `components/airradar-app.tsx` 3D state/effects/toggles, `components/radar/radar-3d-device-check.tsx`, `lib/radar/aircraft-3d-models-v6.ts`, `lib/radar/aircraft-3d-v6-d.ts`, `lib/radar/terrain-v6-d.ts`, styles, assets and tests.
- Remove only 3D-specific layers and effects, preserve normal MapLibre lifecycle and 2D sources, aircraft controls, map events, standard icons, style-load restoration, selection, and follow-camera 2D behavior.
- Validate 2D map initialization, aircraft markers, zoom/pan, theme/style reload, SSE updates, desktop/mobile browser smoke and visual/performance gates.

### Batch E — Track Fusion Shadow retirement

- Trace `lib/track-fusion/**`, `app/api/admin/track-fusion/**`, `lib/server/aircraft-state.ts`, config, system diagnostics, `docs/TRACK-FUSION-*.md`, `tests/track-fusion-*.test.ts`, and any **non-shadow** fusion consumers.
- Canonical LOCAL-first field merging and network affinity must remain unchanged. Remove shadow allocation/observe/truth/readiness workers, orphan schedulers/maps, shadow-only endpoints and report fields; keep external/public system status serialization safe/backward-compatible where needed. Confirm no extra snapshot work remains.
- Measure CPU/allocations per local snapshot on equivalent workload; zero performance claim without A/B.

### Batch F — modeled wind in Digital Twin

- Trace `lib/server/wind-aloft.ts`, `lib/weather/aircraft-wind-context.ts`, `lib/operational-twin/wind-timing-*`, `lib/server/operational-twin.ts`, `lib/server/aircraft-state.ts` scheduled calibration, `components/aircraft-operational-twin.tsx`, public DTOs, config and all consumers.
- Remove modeled wind fetching/caching, model-level calculations, shadow/promotion and stale UI. Keep real observed aircraft weather/BDS and unrelated surface/runway wind from METAR; preserve non-wind corridor intelligence, PIREPs, SIGMET, aircraft identity and canonical timelines/trajectory. Do **not** remove generic `lib/airport-runway-wind.ts` if needed for METAR crosswind.
- Negative tests must prove no model wind fetch from normal aircraft detail or automatic calibration; positive tests confirm no regression in non-wind Digital Twin, safety/fallback and public data projection.

## Shared mandatory gates, each batch

1. Check fresh origin/main, exact production commit from authorized read-only diagnostics, and concurrent writer/release state. Only one writer; never force push.
2. Audit actual imports/exports/callers and external API clients before deletion; use targeted search, not broad assumptions. Record contract changes as intentional.
3. Update **`docs/features.registry.json`** then run `npm run features:generate`; validate `npm run features:check`. Generated EN/CS FEATURES pages cannot be hand-edited in lieu of regeneration. Update relevant EN/CS authoritative documents, remove dangling links and stale feature references. Keep historical audit evidence and migrations unless separately authorized.
4. Add/adjust regression tests to assert retained behaviors and intentionally absent retired surfaces. Run targeted tests, full suite when shared state changes, `npm run lint`, typecheck, build in isolated non-serving checkout, `npm run docs:check`, `npm run visual:check` and browser/performance gates as relevant. Classify release scope with `scripts/release-scope.mjs`.
5. Inspect full diff and local checks. Push one verified non-force change to `main` only when permitted by AGENTS.md. Monitor that exact SHA's CI, CodeQL, release validation, automated deploy (if triggered) and production SHA; **do not manually deploy**. If any check fails, stop further deploy-bearing commits and investigate.
6. Provide per-batch **DONE / BLOCKED**, exact SHA and CI links, actual deleted paths and changed exports/routes, regression coverage, and measured CPU/RAM/DB/network before/after or **NOT_MEASURED**. Do not equate LOC reduction with runtime gains.

## Stop conditions and outstanding evidence

- No full isolated checkout, dependency install, or local test execution: **runtime deletion BLOCKED**.
- Production flags/integrations cannot be verified read-only: **production state UNKNOWN**, not a removal proof.
- Other agents concurrently writing or unknown auto-deploy status: pause runtime pushes.
- Public consumers not mapped or test coverage missing: block the specific batch, not unrelated work.
- Any production database mutation or manual deploy: requires separate explicit authorization.

Once completed, update this brief with exact commits and verified results; do not leave a future agent to infer that this document itself changed any runtime feature.
