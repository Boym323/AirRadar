# Changelog

All notable changes to AirRadar are documented here.

## [1.0.145] - 2026-09-26

Changes since v1.0.144:

- feat(metrics): add codebase LOC collector (ffae064)
- ci(metrics): automate codebase growth chart (1d0c513)
- docs(metrics): initialize code history (4f1718a)
- docs(metrics): add code growth chart placeholder (7397412)
- chore(metrics): expose code metrics command (71df9d0)
- docs(readme): add codebase growth chart (f1678cd)
- test(metrics): cover LOC classification and chart (18b6dec)
- ci(metrics): follow protected main review flow (2ba24e6)
- docs(metrics): document automated review flow (f8e6ae1)
- feat(intelligence): add flight intelligence v2 lifecycle signals (597164b)
- Merge pull request #140 from Boym323/feat/codebase-growth-metrics (dbf957d)
- chore(metrics): update codebase growth (9cf5f5e)
- fix(metrics): quote workflow summary safely (62c4e15)
- Merge pull request #142 from Boym323/automation/codebase-metrics (0a18fb6)
- Merge pull request #141 from Boym323/feat/flight-intelligence-v2-stage1 (f71483b)
- chore(metrics): update codebase growth (ce16185)
- Merge pull request #143 from Boym323/automation/codebase-metrics (f2d931e)

## [1.0.144] - 2026-09-26

Changes since v1.0.143:

- Add diagnostic script for auditing FlightAware routes (aadf157)

## [1.0.143] - 2026-09-26

Changes since v1.0.142:

- fix(radar): keep WebGL aircraft icons north-up (33ec71f)
- test(radar): guard WebGL icon orientation (fe48330)
- Merge pull request #139 from Boym323/fix/webgl-aircraft-icon-orientation (df46519)

## [1.0.142] - 2026-09-26

Changes since v1.0.141:

- fix(alerts): prioritize critical notifications (c3d62f2)
- test(alerts): cover priority queue preemption (680cd50)
- fix(sse): enforce per-client and channel capacity (e92145c)
- fix(sse): identify aircraft stream clients (837e456)
- fix(sse): isolate intelligence stream capacity (5cbf7c2)
- fix(sse): isolate OGN stream capacity (eac91f7)
- test(sse): cover client and channel fairness (0061910)
- test(sse): assert intelligence stream identity (155ce55)
- fix(intelligence): merge pending events into queries (44cd5c2)
- test(intelligence): cover pending event query race (e496390)
- fix(intelligence): suppress stale weather summary signals (debbc95)
- fix(radar): pass SIGMET freshness into situation summary (27ee5ef)
- test(intelligence): cover stale weather summary (5a1c3cf)
- fix(weather): measure SIGMET entry along remaining route (6519f5d)
- test(weather): verify SIGMET entry distance (ea02e5c)
- fix(alerts): reserve queue capacity for critical events (7506bf3)
- test(alerts): verify reserved critical queue capacity (d32cdac)
- fix(intelligence): replay recent events on SSE connect (b5920f1)
- fix(intelligence): merge REST and SSE event windows (d555211)
- test(intelligence): cover SSE connection replay (32a069e)
- test(sse): isolate shared-cap client identities (bcb4c62)
- Merge pull request #138 from Boym323/fix/code-review-findings (81578be)

## [1.0.141] - 2026-09-26

Changes since v1.0.140:

- feat(alerts): add flight-intelligence alert history types (28b7f60)
- feat(alerts): format flight-intelligence notifications (2f56eee)
- feat(alerts): bridge watchlisted flight-intelligence events (4e4590a)
- feat(intelligence): return detected lifecycle events to state owner (624775a)
- feat(alerts): notify on watchlisted intelligence events (d53a8df)
- feat(alerts): expose intelligence history filter (91bd901)
- feat(alerts): show flight-intelligence alert history (7f16658)
- test(alerts): cover watchlisted intelligence notifications (401832b)
- fix(intelligence): preserve low ATC prediction confidence (e8586df)
- test(alerts): include intelligence metadata in history fixture (d35b2a2)
- chore(alerts): retest against updated main (d9b81d4)
- Merge pull request #137 from Boym323/feature/intelligence-alerts (d0a9fbb)

## [1.0.140] - 2026-09-26

Changes since v1.0.139:

- feat(intelligence): derive deterministic flight situation summary (57bc1d7)
- feat(intelligence): add situation summary copy (0361009)
- feat(intelligence): add situation summary copy (ef21b94)
- feat(intelligence): show deterministic flight situation summary (3cb9180)
- style(intelligence): format flight situation summary (7f53d9d)
- test(intelligence): cover flight situation summary (5ffa97c)
- test(intelligence): require situation summary in radar detail (765a1e7)
- fix(intelligence): preserve low ATC prediction confidence (2cfe3b4)
- test(radar): make mobile close gate resilient to rerender (7b88409)
- Merge pull request #136 from Boym323/feature/flight-situation-summary (524adb2)

## [1.0.139] - 2026-09-26

Changes since v1.0.138:

- feat(weather): correlate reconstructed route with SIGMET (b4172d9)
- feat(weather): add route-weather context API (439460a)
- feat(weather): load route weather for selected aircraft (978ed7a)
- feat(weather): pass route weather into aircraft detail (cbf0daa)
- feat(weather): show SIGMETs along reconstructed route (366b0a6)
- feat(weather): add route-weather copy (df1f697)
- feat(weather): add route-weather copy (8a646ac)
- style(weather): format route-weather context (7eda7e8)
- test(weather): cover SIGMETs along reconstructed route (5bd994d)
- test(weather): require reconstructed-route weather UI (8cdab57)
- fix(weather): keep route context on bounded timeout refresh (2a6c3fd)
- perf(weather): keep route context off enrichment critical path (b164362)
- perf(weather): defer route context until ATC is ready (17d7da6)
- test(weather): fixture reconstructed-route weather in browser gate (24b5c88)
- Merge pull request #135 from Boym323/feature/route-weather-intelligence (b10bcae)

## [1.0.138] - 2026-09-26

Changes since v1.0.137:

- feat(weather): derive wind relative to destination bearing (e836aa4)
- feat(weather): expose destination wind context (4bd14f1)
- feat(weather): derive destination-relative wind (7424571)
- feat(weather): pass destination wind context (073ff3f)
- feat(weather): show destination-relative wind (6c44458)
- feat(weather): add destination-wind copy (73d4e76)
- feat(weather): add destination-wind copy (8b2387c)
- test(weather): cover destination-relative wind (84bba00)
- test(weather): require destination-relative wind UI (eec0ea3)
- test(weather): accept destination-aware wind hook (b1049cc)
- Merge main into feature/weather-destination-wind (8832fd0)
- Merge pull request #134 from Boym323/feature/weather-destination-wind (701af8c)

## [1.0.137] - 2026-09-26

Changes since v1.0.136:

- feat(weather): derive wind profile ahead of aircraft (94b0df9)
- feat(weather): expose wind-ahead profile (f97fb7f)
- feat(weather): pass wind-ahead profile to detail (e0c4fb6)
- feat(weather): pass wind-ahead profile to quick detail (5127d99)
- feat(weather): show wind trend ahead of aircraft (0998ff8)
- feat(weather): add wind-ahead copy (ae7ea06)
- feat(weather): add wind-ahead copy (858ddfc)
- test(weather): cover wind-ahead profile trends (3c03604)
- test(weather): require wind-ahead profile UI (1651a18)
- style(weather): format wind-ahead profile (d000fc7)
- Merge pull request #133 from Boym323/feature/weather-wind-ahead (f3d9d01)

## [1.0.136] - 2026-09-26

Changes since v1.0.135:

- feat(weather): reapply wind intelligence on optimized main (85b42f5)

## [1.0.135] - 2026-09-26

Changes since v1.0.134:

- perf(test): reapply production gate optimization (components/use-dataset-query.ts) (b302baa)
- perf(test): reapply production gate optimization (scripts/production-gates.mjs) (5a1f388)
- perf(test): reapply production gate optimization (tests/dataset-query-retry.test.ts) (469221b)
- perf(test): reapply production gate optimization (tests/production-gates.test.ts) (d1aa5f1)
- perf(test): reapply production gate optimization (tests/radar-context-highlight.test.ts) (70fadd9)

## [1.0.134] - 2026-09-26

Changes since v1.0.133:

- refactor(weather): expose short-horizon position projection (45620a7)
- feat(weather): detect course deviation away from SIGMET (b1136ad)
- feat(weather): derive SIGMET trajectory deviation (5cdc1a7)
- feat(weather): pass trajectory deviation context (93360d8)
- feat(weather): surface course deviation near SIGMET (e28d0af)
- feat(weather): add SIGMET deviation copy (eaacf9e)
- feat(weather): add SIGMET deviation copy (066e073)
- style(weather): highlight SIGMET trajectory deviation (0f82451)
- fix(weather): include vertical trend in current SIGMET projection (6747b86)
- test(weather): cover SIGMET trajectory deviation (db19e13)
- test(weather): require SIGMET deviation UI (1275807)
- test(weather): cover turned track that still intersects SIGMET (d6e4435)
- fix(weather): require vertical evidence for medium correlation (daa37c3)
- test(weather): downgrade unknown vertical correlation (571acb2)
- fix(weather): require horizontal SIGMET avoidance for course signal (c989109)
- test(weather): require horizontal avoidance for course signal (1ce07e5)
- Merge pull request #131 from Boym323/feature/weather-trajectory-deviation (19d8ff4)

## [1.0.133] - 2026-09-26

Changes since v1.0.132:

- feat(weather): correlate aircraft with active SIGMETs (c9d3ced)
- feat(weather): load SIGMET context for selected aircraft (5eacc12)
- feat(weather): derive selected-aircraft SIGMET context (5ba3ece)
- feat(weather): pass SIGMET context to aircraft detail (490b9b1)
- feat(weather): show active SIGMET exposure in flight detail (86f26e5)
- feat(weather): add aircraft SIGMET context copy (2ed3e17)
- feat(weather): add aircraft SIGMET context copy (58d1c8e)
- fix(weather): handle SIGMET boundaries and dateline polygons (68d2b22)
- test(weather): cover aircraft SIGMET context (fc45ebb)
- test(weather): require SIGMET context in aircraft detail (aef8095)
- test(weather): cover selected-aircraft SIGMET loading (9525379)
- refactor(weather): separate SIGMET loading from layer visibility (6cf6a9c)
- refactor(weather): keep SIGMET layer state outside data loader (d50a416)
- style(weather): format aircraft SIGMET context (5f211c3)
- feat(weather): project near-term SIGMET entry (2eaa773)
- feat(weather): show projected SIGMET entry ETA (15e4e67)
- feat(weather): add projected SIGMET copy (9ccbbee)
- feat(weather): add projected SIGMET copy (4e3f18a)
- test(weather): cover projected SIGMET entry (2e9c545)
- test(weather): require projected SIGMET UI (7eed9a1)
- Merge pull request #128 from Boym323/feature/weather-intelligence-sigmet (91551a1)

## [1.0.132] - 2026-09-26

Changes since v1.0.131:

- feat(atc): derive estimated handoff context (9b90a5b)
- feat(atc): surface estimated next-sector handoff (d7cd676)
- feat(atc): add handoff estimate copy (ceed09f)
- feat(atc): add handoff estimate copy (fd89ee3)
- test(atc): cover estimated handoff context (a3ba309)
- test(atc): require handoff estimate in quick detail (98a0adb)
- test(radar): wait for mobile drawer close transition (46811bc)
- test(radar): cover drawer transition gate (464f543)
- perf(sse): rebuild ordering once for dense deltas (28b4f96)
- test(sse): cover dense delta order rebuild (e2749da)
- test(radar): stabilize responsive drawer gate (250a781)
- test(radar): stabilize responsive drawer gate (2a1d065)
- test(radar): sync drawer gate fix with WebGL V2 (6cf7a8c)
- test(radar): sync drawer gate fix with WebGL V2 (822f90a)
- chore(radar): sync WebGL V2 base (9665d6c)
- chore(radar): sync WebGL V2 base (afc8f1f)
- chore(radar): sync WebGL V2 base (be5223a)
- chore(radar): sync WebGL V2 base (6ba7fc6)
- chore(radar): sync WebGL V2 base (599b76b)
- chore(radar): sync WebGL V2 base (bf6437e)
- fix(atc): downgrade uncertain handoff confidence (c1e082f)
- test(atc): cover uncertain handoff confidence (3855209)
- Merge pull request #126 from Boym323/test/stabilize-responsive-drawer-gate (cfa481c)
- Merge pull request #127 from Boym323/perf/sse-v2-dense-delta-order (cfeeb71)
- Merge pull request #125 from Boym323/feature/atc-handoff-v1 (a859c16)

## [1.0.131] - 2026-09-26

Changes since v1.0.130:

- perf(radar): add direct indexed WebGL hit testing (fafc454)
- perf(radar): route pointer hits directly to WebGL runtime (552b227)
- test(radar): cover indexed WebGL pointer picking (46bf67b)
- test(radar): gate direct WebGL picking contract (19901e4)
- test(radar): wait for direct WebGL picking runtime (81f8242)
- Merge pull request #124 from Boym323/perf/webgl-direct-hit-testing (141cb6c)

## [1.0.130] - 2026-09-26

Changes since v1.0.129:

- fix(radar): render real aircraft icons in WebGL (d1d1f2c)
- test(radar): require classified WebGL silhouettes (90cf301)
- fix(radar): respect WebGL texture-array limits (c7db8ba)
- Merge pull request #123 from Boym323/fix/webgl-real-aircraft-icons (62feaa5)

## [1.0.129] - 2026-09-26

Changes since v1.0.128:

- perf(radar): add WebGL bulk aircraft runtime (8c3c5a1)
- perf(radar): wire WebGL bulk aircraft layer (6088173)
- perf(radar): split bulk WebGL and special HTML rendering (67e2674)
- perf(radar): gate WebGL bulk renderer through 5000 aircraft (62ea931)
- perf(radar): benchmark WebGL and HTML render paths separately (98af698)
- perf(radar): soak WebGL renderer through 5000 aircraft (d8e6b33)
- test(radar): validate WebGL bulk performance budgets (aea3e5b)
- test(radar): cover WebGL headroom through 5000 aircraft (5c73e67)
- test(radar): update WebGL soak scenarios (2227e84)
- test(radar): cover WebGL aircraft hybrid renderer (781af4a)
- chore(radar): keep WebGL budget lint-clean (46d3bc8)
- perf(radar): preserve bulk motion state across full syncs (14261c9)
- perf(radar): retain WebGL interpolation across full map syncs (784e214)
- perf(radar): decouple bulk labels from motion cadence (07c1436)
- fix(radar): address WebGL review findings (3c0cb4e)
- fix(radar): keep WebGL hit targets on rendered positions (b5377ed)
- test(radar): update production gate for WebGL bulk markers (895cda3)
- test(radar): restore browser smoke state after marker selection (fe8d842)
- Merge pull request #122 from Boym323/perf/webgl-aircraft-layer-v1 (0ce5418)

## [1.0.128] - 2026-09-26

Changes since v1.0.127:

- perf(radar): add 1000-2000 aircraft scenarios (2ba2421)
- perf(radar): capture p95 frame and collision diagnostics (30b25e5)
- perf(radar): report p95 and browser footprint (261c4f3)
- perf(radar): soak realistic 1600-aircraft load (345a5af)
- test(radar): cover 1600-aircraft performance audit (f7714f9)
- test(radar): update expanded performance scenarios (4c967d2)
- test(radar): update 1600-aircraft soak expectation (fb003ee)
- fix(radar-perf): snapshot timings before forced GC (f8a1dc3)
- Merge pull request #120 from Boym323/perf/radar-1600-audit (5a979b7)

## [1.0.127] - 2026-09-26

Changes since v1.0.126:

- docs: sync changelog through v1.0.126 (c3bd29d)
- ci: tolerate changelog PR permission in ci.yml (58b7c3e)
- ci: tolerate changelog PR permission in changelog-sync.yml (4d008c6)
- Merge pull request #118 from Boym323/automation/changelog-sync (653c6d2)
- Merge pull request #119 from Boym323/fix/changelog-sync-pr-permission (04cab03)
## [1.0.126] - 2026-09-26

Changes since v1.0.125:

- test(perf): add radar soak mode (ced271a)
- test(perf): report soak footprint and SSE churn (390d55c)
- chore: add radar soak benchmark command (367bda0)
- chore: ignore radar soak reports (d5ded68)
- ci: add scheduled radar soak workflow (877a616)
- test: cover scheduled radar soak contract (5a6b117)
- test(intelligence): add deterministic history replay core (ea31316)
- test(intelligence): add history replay CLI (ef84e79)
- test(intelligence): cover deterministic replay scoring (bca4030)
- chore(intelligence): add replay command (3a10190)
- test(intelligence): report sampled replay input (4f3697f)
- fix(analytics): remove airport traffic row truncation (36a8f1e)
- test(analytics): cover complete airport traffic sets (116bf36)
- feat(intelligence): aggregate replay quality metrics (4f339c6)
- feat(intelligence): add replay quality report CLI (a502d91)
- chore: add intelligence quality command (9d315ee)
- test(intelligence): cover replay quality metrics (8783bf2)
- perf(analytics): page complete airport traffic reads (37a866d)
- test(analytics): exercise paged airport traffic reads (12fd289)
- perf(history): batch retention cleanup and expose metrics (4b08300)
- test(history): cover batched retention cleanup (3b2f366)
- refactor(radar): extract aircraft motion runtime (9f5a05f)
- refactor(radar): delegate aircraft interpolation lifecycle (0004017)
- refactor(radar): remove legacy animation job reference (7bc7233)
- test(radar): enforce motion runtime boundary (4f26492)
- refactor(radar): extract weather context data lifecycle (6f74d40)
- refactor(radar): delegate weather context lifecycle (17d45c1)
- fix(radar): keep weather image rendering in map boundary (b8608ea)
- fix(radar): remove duplicate SIGMET state (74f11e9)
- test(radar): enforce weather context boundary (91c35ac)
- test(intelligence): use canonical confidence level (58f8cdc)
- feat(runtime): persist bounded telemetry history (fb6f30f)
- feat(runtime): start telemetry with node runtime (6a8597a)
- feat(runtime): flush telemetry during shutdown (be0bf73)
- security(runtime): rate limit telemetry history (acfe0aa)
- feat(runtime): expose admin telemetry history (bf35f5a)
- test(runtime): cover telemetry persistence and bounds (3780870)
- test(runtime): cover telemetry startup (c97b623)
- test(runtime): protect telemetry history endpoint (d6a2595)
- test(runtime): flush telemetry before service shutdown (7ba418e)
- refactor(system): extract status projections (11352c8)
- refactor(system): extract diagnostic state mapping (0c11e56)
- refactor(system): delegate projection and diagnostic mapping (f3ab6ab)
- test(system): enforce status module boundaries (0e5eb1c)
- fix(history): keep retention diagnostics backwards compatible (bd06e5e)
- test(history): use bounded retention fixtures (26124cd)
- test(history): remove obsolete retention constants (7e4d845)
- refactor(system): extract status contract types (0ccd1ff)
- refactor(system): consume extracted status contract (e20a81f)
- refactor(system): remove diagnostics barrel cycle (e8370db)
- refactor(system): remove projection barrel cycle (89607c6)
- refactor(system): remove obsolete extracted type imports (7d5d2d1)
- fix(system): restore extracted type dependency (cd9c617)
- perf(analytics): aggregate airport traffic per page (ab63c44)
- feat(runtime): trend database and provider health (b49d54b)
- test(runtime): cover persisted health telemetry (896c6b1)
- test(runtime): expose health telemetry to admin (6210db8)
- refactor(radar): extract ATC map time context (cff233c)
- refactor(radar): move map-time polling out of app (d75998b)
- test(radar): cover global map-time boundary (3d9338b)
- feat(system): expose history retention diagnostics (b9e01d5)
- feat(system): sanitize history retention metrics (201c5d9)
- security(system): keep retention metrics admin-only (a0adbac)
- test(system): cover admin retention diagnostics (d60750f)
- Merge pull request #101 from Boym323/test/radar-soak (5e89162)
- chore: sync replay branch with main package scripts (284406c)
- Merge pull request #103 from Boym323/fix/airport-traffic-completeness (e5edacb)
- Merge pull request #106 from Boym323/perf/history-retention-v2 (ee2b983)
- Merge pull request #107 from Boym323/refactor/aircraft-motion-runtime (7b2bc14)
- Merge pull request #109 from Boym323/feat/runtime-telemetry-history (bafa45c)
- Merge pull request #110 from Boym323/refactor/system-status-modules (116d858)
- merge main into flight intelligence replay (c8ea9bf)
- merge main into radar weather context (25b7d8b)
- test(radar): follow extracted motion runtime boundaries (43e1ee0)
- test(radar): align runtime animation assertion (2b3be6e)
- test(radar): sync extracted runtime invariants (bcdf673)
- test(radar): sync extracted runtime invariants (d4f0cb0)
- Merge pull request #115 from Boym323/fix/radar-ui-refactor-invariants (779b4a7)
- Merge pull request #102 from Boym323/test/flight-intelligence-replay (681167a)
- chore: sync intelligence quality scripts with main (118c94d)
- merge main into flight intelligence quality (262bf65)
- Merge pull request #104 from Boym323/test/flight-intelligence-quality (885ca27)
- Merge pull request #114 from Boym323/refactor/radar-map-context-clock (eb7e35e)
- chore(release): sync .github/workflows/ci.yml (295dcae)
- chore(release): sync package.json (b232e62)
- chore(release): sync scripts/changelog.mjs (68ffdcc)
- chore(release): sync CHANGELOG.md (d9caf6c)
- chore(release): add changelog sync workflow (fb51756)
- Merge pull request #108 from Boym323/refactor/radar-weather-context (588796a)
- Merge pull request #116 from Boym323/chore/release-metadata-sync-v2 (ba28cac)
- test(weather): follow extracted radar weather context (430b13f)
- test(radar): follow extracted ATC map context (b0dec8a)
- Merge pull request #117 from Boym323/fix/post-merge-radar-refactor-tests (7f3a410)

## [1.0.125] - 2026-09-26

Changes since v1.0.124:

- security: add public system status projection (10a2063)
- security: protect detailed system diagnostics (cb63c70)
- security: share admin session with diagnostics (5f11a64)
- ui: hide admin-only system diagnostics (36082ba)
- test: cover public diagnostics redaction (2de0b88)
- test: cover shared admin session cookie scope (9cf1b5c)
- fix: preserve system status softRf shape (4db4454)
- Merge pull request #100 from Boym323/fix/public-system-diagnostics (c80956a)

## [1.0.104] - 2026-09-20

Changes since v1.0.103:

- fix: update aircraft marker styles and diagnostics integration (4c34230)
- Merge pull request #74 from Boym323/fix/aircraft-marker-anchoring (4610e95)

## [1.0.103] - 2026-09-20

Changes since v1.0.102:

- fix: restore tar1090 aircraft icon heading (fc9badf)

## [1.0.102] - 2026-09-20

Changes since v1.0.101:

- docs: update changelog for v1.0.101 (e0174ae)

## [1.0.100] - 2026-09-20

Changes since v1.0.99:

- perf: cache live snapshots and public SSE serialization (7d83152)
- perf: apply aircraft deltas incrementally in the browser (82a5817)
- perf: split secondary radar panels from initial bundle (1c134b8)
- Merge pull request #71 from Boym323/perf/large-runtime-optimization (0adbe91)

## [1.0.99] - 2026-09-20

Changes since v1.0.98:

- perf: lazy-load secondary radar data (af42f7f)
- Merge pull request #69 from Boym323/perf/data-loading-round-2 (54df60c)
- feat: add function to determine renderable aircraft motion and update motion history handling (86866e3)
- fix: enhance visibility checks for secondary tools in compact and expanded sidebar (9fb4d1d)
- fix: start aircraft state during server startup (309ef0f)
- test: cover eager aircraft startup (b3937cc)
- test: match ATS map query in production gate (368f72b)
- docs: clarify eager aircraft startup lifecycle (3b4a5eb)
- Merge pull request #70 from Boym323/fix/eager-aircraft-state-startup (9983218)

## [1.0.98] - 2026-09-20

Changes since v1.0.97:

- fix: maintain local position authority over network updates in aircraft observation (e4fc29f)

## [1.0.97] - 2026-09-20

Changes since v1.0.96:

- perf: remove route intelligence from live radar (5714cf7)

## [1.0.96] - 2026-09-20

Changes since v1.0.95:

- perf: reduce optional data loading and radar hot-path work (f6f89d4)
- test: reflect lazy ATS route loading (3d015f4)

## [1.0.95] - 2026-09-20

Changes since v1.0.94:

- refactor: update CI workflows to use manual triggers and remove scheduled runs (c448835)
- feat: enhance trail handling by introducing empty trail initialization and refactoring trail selection logic (025b8b8)
- refactor: update CI workflows to remove scheduled runs and adjust trigger conditions fix: reduce maximum trail speed to prevent cross-map segments test: add case to reject implausible cross-map history jumps (5f28764)
- fix: update selected trail handling in radar UI tests for accurate visibility checks (da5b746)

## [1.0.94] - 2026-09-20

Changes since v1.0.93:

- feat: improve animation handling by refining motion selection and prediction logic (97f69ad)
- fix: prevent false cross-map aircraft trail segments (15fe7a5)

## [1.0.93] - 2026-09-20

Changes since v1.0.92:

- feat: enhance motion handling by preventing out-of-order position updates and ensuring continuous heading during turns (ceea2ae)

## [1.0.92] - 2026-09-20

Changes since v1.0.91:

- feat: enhance aircraft radar quick detail with new tabs and filters (7cf46ca)
- fix: correct URL parameter encoding for re-api.adsb.lol endpoint (04ebbe8)

## [1.0.90] - 2026-09-20

Changes since v1.0.89:

- fix: reduce maxWorkers to 2 for improved stability in test configurations (96b1dae)

## [1.0.89] - 2026-09-19

Changes since v1.0.87:

- feat: add receiver polar coverage component and related styles, tests, and utility functions (fbe4950)
- fix: polish radar UI and ATC translations (226197e)
- feat: update CI workflow to conditionally run tests and add unit/integration test configurations (430afec)
- fix(i18n): update aircraft count formatting and improve localization tests (f4c307f)
- chore(release): prepare v1.0.88 (9c5f5bd)
- test: make changed test selection PR-safe (f1399e4)

## [1.0.85] - 2026-09-19

Changes since v1.0.84:

- fix(aircraft): adjust icon rotation for correct visual alignment (7666641)

## [1.0.83] - 2026-09-19

Changes since v1.0.82:

- fix(system): clarify lazy provider health states (19e9d6c)
- Merge pull request #64 from Boym323/fix/system-status-semantics (3eaf05a)

## [1.0.80] - 2026-09-19

Changes since v1.0.79:

- fix: update network provider status handling and improve track data structure (ed634dc)

## [1.0.77] - 2026-09-19

Changes since v1.0.76:

- feat: implement ATC prediction validation and integrate with aircraft context (19de4be)

## [1.0.76] - 2026-09-19

Changes since v1.0.75:

- feat: add next sector prediction to ATC context with distance and ETA estimates (806f290)

## [1.0.75] - 2026-09-19

Changes since v1.0.73:

- feat: enhance UI components and improve status handling in AirRadarApp (55aa68a)
- feat: add active filter chips and enhance filter functionality in AirRadarApp feat: integrate status badge for emergency squawk in AircraftRadarQuickDetail feat: update Czech and English translations for filter and search functionalities (69169bb)
- feat: add RouteSection component to improve route display in AircraftRadarQuickDetail (c94bf8c)
- Add new weather radar images for September 19, 2026 (f7818f7)
- feat: add UI icons for navigation buttons and enhance ATC traffic labels in multiple languages (58e3111)
- feat: add weather radar archive directory to production gate configuration (9dab8d8)
- docs: update changelog for v1.0.74 (fad29bc)
- refactor: remove unused class from expectedQuickOrder in assertBrowserSmoke function (93d21e5)

## [1.0.73] - 2026-09-19

Changes since v1.0.72:

- feat: add benchmark script for ATC A/B correctness audit (f066f16)
- feat: implement sector candidate retrieval and integrate with ATC sector service (c5a657c)

## [1.0.71] - 2026-09-19

Changes since v1.0.70:

- feat: Enhance ADSB.lol integration with raw data support and failover mechanism (680b1c8)

## [1.0.70] - 2026-09-19

Changes since v1.0.69:

- feat: enhance sector traffic processing with test configuration options and improve streaming tests (7fd3feb)

## [1.0.69] - 2026-09-19

Changes since v1.0.58:

- feat: use Beast stream as local ADS-B primary (b15f389)
- Merge pull request #59 from Boym323/feature/local-beast-stream (69acf3b)
- docs: update changelog for v1.0.59 (a20b3cf)
- fix: classify Mode-S frames in Beast diagnostics (c2df232)
- Merge pull request #60 from Boym323/fix/beast-diagnostics (3126295)
- docs: update changelog for v1.0.60 (b99c4d5)
- fix: count valid Beast transport frames (247b656)
- Merge pull request #61 from Boym323/fix/beast-frame-counter (76f5e64)
- docs: update changelog for v1.0.61 (ea8bbc4)
- fix: keep valid Beast frames out of error counter (3301d58)
- Merge pull request #62 from Boym323/fix/beast-decoder-metric (d2e8a4a)
- docs: update changelog for v1.0.62 (6c8079c)
- fix(beast): parse short Mode-S frame length (8fde1ee)
- Merge pull request #63 from Boym323/fix/beast-short-frame-length (6646cfd)
- docs: update changelog for v1.0.63 (1a54124)
- feat: implement sector traffic context retrieval and API endpoints (4f61b98)
- feat: add sector transitions API and update documentation (6c64c09)
- fix: validate geographic coordinates for sectors, airports, and transmitters (84396a4)
- docs: update changelog for v1.0.64 (baa76dc)
- fix: update release script to use FETCH_HEAD for branch resolution (d221255)
- feat: add application icon and update metadata for better PWA support (f174a3d)
- docs: update changelog for v1.0.65 (1db08e1)
- feat: add sector traffic data handling and visualization in AirRadarApp (62bd728)
- feat: implement ATC sector traffic handling and visualization in AirRadarApp (cab8d32)
- fix: prevent service worker html fallback for runtime assets (6a16240)
- fix: restore radar detail order and bounded polling (65fd8eb)
- feat: add sector traffic history API endpoint and validation logic (c2e18dc)
- fix: reject invalid map bounds coordinates (deb0609)
- docs: update changelog for v1.0.66 (19ee6db)
- fix: skip non-finite aircraft marker coordinates (7c1757e)
- docs: update changelog for v1.0.67 (ad7aee2)
- fix: ignore numeric emergency state as map alert (d4b0b9b)
- docs: update changelog for v1.0.68 (1cc8bcd)
- feat: add GET endpoint for sector traffic history with validation (d48ef54)
- feat: implement traffic history UI with lazy loading and historical API integration (9f9c8ae)
- fix: validate numeric fields in aircraft snapshot recording to prevent malformed data (59616b4)
- docs: add performance characteristics section to ATC sector traffic documentation (facace1)
- feat: enhance traffic history processing with coverage details and add benchmark script (68f68b4)
- feat: optimize traffic history processing by releasing raw FlightPosition rows and improving accumulator management (882b816)
- feat: add synthetic benchmark for ATC sector traffic processing and enhance streaming correctness tests (13bdcd6)

## [1.0.58] - 2026-09-19

Changes since v1.0.57:

- feat(intelligence): enhance UI and add event summary with localization support (742fd33)

## [1.0.57] - 2026-09-19

Changes since v1.0.56:

- feat(flights): add synchronized Flight Story (1ba0f60)
- Merge pull request #57 from Boym323/feature/flight-story-v1 (70fe485)
- fix(deploy): recover stale generated Next files (b3eeb31)
- Merge pull request #58 from Boym323/feature/flight-story-v1 (adbb098)

## [1.0.56] - 2026-09-19

Changes since v1.0.55:

- feat(time-machine): add global map time and historical context (c9aa6b7)
- Merge pull request #56 from Boym323/feature/map-context-v2-global-time (f1cad60)

## [1.0.55] - 2026-09-18

Changes since v1.0.54:

- feat(map): add weather and operational context layers (2b0c33f)
- fix(ci): allow MapLibre data image placeholder (2ddf50d)
- fix(map): use valid radar placeholder image (477c011)
- Merge pull request #55 from Boym323/feature/map-context-v1 (f1d19fd)

## [1.0.54] - 2026-09-18

Changes since v1.0.53:

- fix: add allowPublicationDateMismatch option to parseCzEaipEnr21 for flexible date handling (e369d11)

## [1.0.53] - 2026-09-18

Changes since v1.0.52:

- fix: enhance polygon parsing to support both flat and GeoJSON formats for improved data handling (74a1d8a)
- fix: enhance aircraft animation handling with predictive positioning and correction logic for improved accuracy (a4413a3)

## [1.0.52] - 2026-09-18

Changes since v1.0.51:

- fix: refactor procedure visualization to merge consecutive geometry and improve feature generation (b50874e)
- fix: add automatic fitting of ATC layer bounds to improve visibility of sectors (f7a8938)
- fix: update event row structure to include flight callsign and refine aircraft registration handling (3c9f0e3)
- fix: optimize aircraft animation handling for improved performance and visibility during tab changes (5ae9e46)

## [1.0.51] - 2026-09-18

Changes since v1.0.50:

- fix: improve route data handling in aircraft detail components (81fdab9)
- fix: add descending order support for time machine queries (f72e737)

## [1.0.50] - 2026-09-18

Changes since v1.0.49:

- fix: enhance procedure visualization and coordinate extraction logic (7b67f6f)

## [1.0.49] - 2026-09-18

Changes since v1.0.38:

- fix: harden airport movement inference and queries (73da420)
- fix: correct ATC validity and airport visibility (37269c0)
- test: strengthen map layer and migration production gates (5d6a47a)
- fix: avoid runway label for airport overflights (88a3912)
- Merge pull request #17 from Boym323/automation/harden-movement-atc-gates (af78331)
- Improve airport movement intelligence UX (8643082)
- Merge pull request #18 from Boym323/feature/airport-movement-ux (5236afe)
- style: establish visual system v2 (ccaa4c2)
- polish shared visual shell and secondary layouts (b500a1e)
- style: finish visual system v2 mobile polish (46c26d0)
- Merge pull request #19 from Boym323/feature/visual-system-v2 (ab01830)
- docs: update changelog for v1.0.39 (37353dc)
- refactor: improve diagnostics handling in computeAtcContext function (9eda63c)
- refactor: clean up tsconfig.json by removing unnecessary type includes (2724067)
- feat: make desktop radar map-first (e4e6e36)
- fix: clarify traffic drawer trigger (59708aa)
- chore: add 1280 drawer layer review (f812608)
- fix: refine traffic drawer accessibility (d996edc)
- fix: keep radar layers clear of desktop drawer (918b77e)
- test: refresh frontend ux review captures (74d07f1)
- fix: keep mobile traffic sheet above map (9d4ae48)
- chore: remove temporary ux review artifacts (bd980f6)
- fix: address frontend ux v3 review feedback (871915e)
- fix: address final frontend ux review feedback (7b3f489)
- fix: preserve OGN search shortcut focus (c7149c3)
- Merge pull request #20 from Boym323/feature/frontend-ux-v3 (5fe864f)
- fix: enhance live state snapshot to include public aircraft metadata (9890982)
- docs: update changelog for v1.0.40 (a473e04)
- fix: implement retry logic for ADSBDB failures with exponential backoff (fcfc262)
- fix: keep layers menu above map content (c62f00d)
- fix: keep layers menu above map content (8831c17)
- Merge pull request #21 from Boym323/feature/frontend-ux-v3 (1eada41)
- fix: add public metadata serialization for live state snapshots (43e879a)
- Merge remote-tracking branch 'origin/main' (6c31d64)
- ci: validate every public AirRadar domain (9b97c8a)
- ci: restore configured production health domain (2ea0891)
- fix: add turbopackIgnore comment to runtime state path function (37da2f4)
- fix: update CI workflow for concurrency and simplify deployment steps feat: enhance public serialization for aircraft data and improve test coverage (2462d70)
- docs: update changelog for v1.0.41 (18ed19a)
- test: finalize FlightAware release coverage (64d42c5)
- docs: update changelog for v1.0.0-rc.3 (d539439)
- feat: show additional FlightAware flight plan details (691bab9)
- docs: update changelog for v1.0.0-rc.4 (8bc8246)
- feat: add FlightAware usage data JSON file (8e88ac6)
- feat: enhance aircraft detail page with new layout and data sources (5bb0e22)
- docs: update changelog for v1.0.42 (ed30aa2)
- feat: update FlightAware usage data with new timestamps and request details (84ec575)
- feat: finish aircraft detail v3 visual hierarchy (48a8898)
- docs: update changelog for v1.0.43 (ca164a8)
- style: simplify radar aircraft detail panel (fa8dda8)
- style: load radar aircraft panel polish (fa198ec)
- fix: preserve mobile aircraft drawer controls (26a24a5)
- fix: align aircraft drawer close controls with responsive gate (0c88a97)
- Merge pull request #23 from Boym323/ui/radar-aircraft-panel-polish (69f33d1)
- chore: ignore FlightAware usage runtime state (ab01b00)
- chore: add data/flightaware-usage.json to .gitignore (1e2224d)
- Merge branch 'main' of https://github.com/Boym323/AirRadar (5728cf1)
- docs: update changelog for v1.0.44 (13982bf)
- fix: update RouteIntelligencePanel rendering conditions to exclude NO_ROUTE and NO_ATS_DATA statuses (a1aae78)
- fix: update AirRadarApp to set selected ATC context and display additional details when available (fa76466)
- fix: update AirRadarApp and AirspaceCard to improve ATC context handling and live tracking display (364a9fd)
- fix: update aircraft trail handling to retain complete trails while aircraft are live (3753d34)
- fix: add trail points and memory metrics to system status page and diagnostics (262e675)
- fix: update global search to include aircraft focus and adjust href generation (589e3df)
- fix: update href generation for aircraft search results to use a new path format (1b161c4)
- fix: include registration in cache key for aircraft photo retrieval (677e7b3)
- fix: enhance photo retrieval by prioritizing larger thumbnails from Planespotters API (1d4d282)
- fix: update build lock file path to /var/lib/airradar/build.lock in scripts and documentation (e63b93a)
- fix: improve OGN loading logic to ensure proper snapshot handling and prevent race conditions (7040631)
- fix: add escape key functionality to close UI elements in various components (c11dc62)
- fix: implement reduced motion preferences for smoother animations in AirRadarApp (a6232f2)
- fix: enhance drawer action handling and keyboard shortcut event listener for improved UI responsiveness (417bc33)
- fix: update legend line styles and translations for improved clarity in route visualization (81ef86e)
- fix: update aircraft drawer layout for improved visual clarity and interaction (11eb37f)
- fix: remove effective date display from ATC details for improved clarity (5d0c787)
- fix: enhance SIGMET popup content with detailed information and improve translations for clarity (009bb69)
- fix: update GeoJSON type references for improved type safety and consistency (4527353)
- fix: add @types/geojson for improved type definitions and compatibility (0da0564)
- fix: add timeout to SoftRF test suites for improved stability (1961edb)
- Refactor radar aircraft quick detail (0b2e144)
- Fix compact weather browser gate (0dd4a77)
- Stabilize desktop shortcut browser gate (9747c18)
- Stabilize traffic search focus (5cdaa31)
- Retry traffic search focus after drawer render (2ac991d)
- Avoid flaky repeated search focus assertion (7c5faa7)
- Merge pull request #24 from Boym323/refactor/radar-aircraft-quick-detail (bb582bb)
- Přidání watchdog služby a časovače pro sledování ADSB.lol polling (e6cdf63)
- test: prove quick aircraft flow skips FlightAware (9529789)
- Merge remote-tracking branch 'origin/main' (51d9e62)
- perf: optimize CI test and production gates (7fb9d15)
- perf: parallelize independent CI validation (737034e)
- perf: speed up CI and production validation (d375262)
- feat: add flight intelligence events (f9d5ce9)
- fix: satisfy intelligence lint checks (7e4f715)
- fix: chain flight intelligence migration (94a723c)
- test: include flight intelligence migration (7b8fe82)
- Merge pull request #28 from Boym323/feat/flight-intelligence (e74447d)
- docs: update changelog for v1.0.45 (4aae461)
- Merge pull request #29 from Boym323/chore/changelog-v1.0.45 (8ad173d)
- feat: implement Route Intelligence V2 contracts and associated tests (96fc39a)
- fix: align flight intelligence migration indexes (ebd36f7)
- Merge branch 'main' into feat/route-intelligence-v2 (700d210)
- Merge pull request #31 from Boym323/fix/flight-intelligence-migration (50a0307)
- Merge branch 'main' into feat/route-intelligence-v2 (934bf2a)
- Merge pull request #30 from Boym323/feat/route-intelligence-v2 (138756c)
- feat(route-intelligence): unify runway context (1fc7858)
- feat: add Route Intelligence V2 agent scripts and tasks (f1f310d)
- Merge pull request #32 from Boym323/feat/route-intelligence-v2-agent-scripts (6246ce5)
- Merge remote-tracking branch 'origin/main' into ri-v2/runway (0d7218a)
- feat(route-intelligence): add terminal procedure pipeline (3d22cac)
- Merge remote-tracking branch 'origin/main' into ri-v2/procedures (11afc5e)
- feat(route-intelligence): add v2 static route engine (5d5dc2a)
- Merge origin/main into ri-v2/static-engine (d9549c9)
- feat(route-intelligence): add v2 static route engine (e8711ab)
- feat(route-intelligence): add dynamic route analysis (52a2f61)
- feat(route-intelligence): add v2 route UI and visualization (988fb62)
- Merge remote-tracking branch 'origin/main' into ri-v2/dynamic (35f9f1e)
- Merge remote-tracking branch 'origin/main' into ri-v2/ui (2322aac)
- Merge branch 'main' into ri-v2/procedures (b047e40)
- Merge branch 'main' into ri-v2/runway (c58e2dc)
- fix(route-intelligence): complete empty dynamic snapshot (b1befcf)
- Merge pull request #33 from Boym323/ri-v2/procedures (4f328cd)
- Merge branch 'main' into ri-v2/runway (baa65e9)
- Merge branch 'main' into ri-v2/dynamic (1a3908f)
- Merge branch 'main' into ri-v2/ui (79915ac)
- Merge pull request #35 from Boym323/ri-v2/runway (a1e7e6b)
- Merge branch 'main' into ri-v2/ui (ed9d441)
- merge: integrate latest main into dynamic route intelligence (4171962)
- Merge remote-tracking branch 'origin/ri-v2/dynamic' into ri-v2/dynamic (e1ab680)
- Merge pull request #37 from Boym323/ri-v2/ui (9fe094f)
- Merge branch 'main' into ri-v2/dynamic (41ed539)
- Merge remote-tracking branch 'origin/main' into ri-v2/dynamic (2977fba)
- Přidání podmínky pro zobrazení rozsahu kroužků na základě dostupnosti pozice přijímače (09c442b)
- fix(route-intelligence): complete view DTO contract (ef9ed93)
- Merge remote-tracking branch 'origin/ri-v2/dynamic' into ri-v2/dynamic (ed3820e)
- Merge pull request #36 from Boym323/ri-v2/dynamic (05354c7)
- Merge branch 'main' into fix/receiver-range-availability (b7c89f4)
- Merge pull request #38 from Boym323/fix/receiver-range-availability (737b171)
- fix(enrichment): reject stale route destinations by position (4a44b73)
- Merge pull request #39 from Boym323/fix/route-enrichment-position-gate (808c453)
- docs: update changelog for v1.0.46 (da6e356)
- Merge pull request #40 from Boym323/chore/changelog-v1.0.46 (fea01ba)
- feat(map): add independent SID STAR procedure layers (45ceabd)
- Merge branch 'main' into feat/procedure-map-layers (7bb878e)
- Merge pull request #41 from Boym323/feat/procedure-map-layers (ec0b4cd)
- docs: update changelog for v1.0.47 (9dce1b2)
- feat(intelligence): complete route and flight intelligence integration (4a6c750)
- fix(intelligence): remove duplicate procedure import (06c3416)
- feat(time-machine): add historical traffic playback (c32db9a)
- Merge pull request #42 from Boym323/chore/changelog-v1.0.47 (a7734fa)
- fix(procedures): fail soft when dataset is unavailable (b3c1dc9)
- test(procedures): cover unavailable dataset fallback (1698692)
- fix(procedures): preserve existing procedure fixture (d684204)
- feat(coordinates): add parsing for compact DMS coordinates and integrate into EAIP semantic HTML parsing (c723992)
- Merge main into hardening/intelligence-integration (8d562bf)
- Merge pull request #43 from Boym323/hardening/intelligence-integration (c06419e)
- Merge branch 'main' into feat/coordinates-compact-dms (6095d9d)
- Merge pull request #45 from Boym323/feat/coordinates-compact-dms (961f1c6)
- fix(ui): show all route intelligence phases and sources (bde9dc3)
- fix(i18n): label route departure and arrival phases (5ded0c4)
- fix(i18n): add route phase labels (c65e3e8)
- fix(radar): load aviation data needed by selected routes (6c1d754)
- test(radar): cover route intelligence data loading (493b5e4)
- test(i18n): cover dynamic route phases (b70b26c)
- test(ui): cover route intelligence display semantics (5ef093a)
- fix(ui): expose available receiver technical data (10608c4)
- test(ui): cover receiver telemetry display (2f2aa46)
- Merge pull request #46 from Boym323/fix/data-display-audit (f98ec3f)
- merge main into feature/time-machine-v1 (f5cc221)
- Merge pull request #47 from Boym323/feature/time-machine-v1 (c339746)
- fix: use release-generated Next route types (dd3486c)
- Merge pull request #48 from Boym323/fix/release-route-types (2b109c4)
- fix: allow automated release from shared checkout branch (7dead24)
- Merge pull request #49 from Boym323/fix/automated-release-branch (590be77)
- fix: improve airport validation and streamline procedure fetching logic (c357386)
- Merge pull request #50 from Boym323/fix/airport-validation-procedure-fetch (a39a82c)
- fix: update CI workflow to create GitHub release notes and change permissions to write (2b0946d)
- Merge branch 'main' into fix/github-release-notes-workflow (4f9f4b7)
- Merge pull request #51 from Boym323/fix/github-release-notes-workflow (a70798b)
- feat: add aviation data synchronization scripts and systemd service/timer (e44f3de)
- fix: keep automated release checkout synchronized (8d6161d)
- Merge branch 'main' into fix/automated-release-sync (6f2b270)
- Merge pull request #52 from Boym323/fix/automated-release-sync (06e448e)
- fix: resolve release version from production checkout (ea22eb7)
- Merge pull request #53 from Boym323/fix/release-notes-production-version (ccb092d)
- fix: remove fragile release workflow heredoc (4ae4049)
- Merge pull request #54 from Boym323/fix/release-workflow-heredoc (f71fdd0)
## [1.0.124] - 2026-09-26

## What's Changed
* fix(release): keep production build and GitHub release identity aligned by @Boym323 in https://github.com/Boym323/AirRadar/pull/98
* ci: verify production release identity after deploy by @Boym323 in https://github.com/Boym323/AirRadar/pull/99


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.123...v1.0.124

## [1.0.123] - 2026-09-23

## What's Changed
* feat(intelligence): Flight Intelligence V2 by @Boym323 in https://github.com/Boym323/AirRadar/pull/97


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.122...v1.0.123

## [1.0.122] - 2026-09-23

## What's Changed
* Add production radar performance baseline by @Boym323 in https://github.com/Boym323/AirRadar/pull/96


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.121...v1.0.122

## [1.0.121] - 2026-09-23

## What's Changed
* Refactor AirRadarApp into focused radar UI boundaries by @Boym323 in https://github.com/Boym323/AirRadar/pull/94
* Fix post-refactor CI boundary assertions by @Boym323 in https://github.com/Boym323/AirRadar/pull/95


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.120...v1.0.121

## [1.0.120] - 2026-09-23

## What's Changed
* Decouple live aircraft deltas from React rendering by @Boym323 in https://github.com/Boym323/AirRadar/pull/93


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.119...v1.0.120

## [1.0.119] - 2026-09-23

## What's Changed
* Optimize dense radar rendering and add performance diagnostics by @Boym323 in https://github.com/Boym323/AirRadar/pull/92


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.118...v1.0.119

## [1.0.118] - 2026-09-23

## What's Changed
* fix: align aircraft icons with rendered motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/91


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.117...v1.0.118

## [1.0.117] - 2026-09-23

## What's Changed
* Optimize live radar frontend rendering by @Boym323 in https://github.com/Boym323/AirRadar/pull/90


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.116...v1.0.117

## [1.0.116] - 2026-09-23

## What's Changed
* Remove stop-go jitter from live aircraft motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/89


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.115...v1.0.116

## [1.0.115] - 2026-09-23

## What's Changed
* Replace live dead reckoning with confirmed-position interpolation by @Boym323 in https://github.com/Boym323/AirRadar/pull/86
* Update radar UI invariant for confirmed-position motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/87
* Fix stale confirmed-position marker snaps by @Boym323 in https://github.com/Boym323/AirRadar/pull/88


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.114...v1.0.115

## [1.0.114] - 2026-09-23

## What's Changed
* Enable subpixel positioning for moving map markers by @Boym323 in https://github.com/Boym323/AirRadar/pull/85


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.113...v1.0.114

## [1.0.113] - 2026-09-22

## What's Changed
* Stabilize live aircraft motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/84


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.112...v1.0.113

## [1.0.112] - 2026-09-22

## What's Changed
* Polish responsive radar layout and drawer geometry by @Boym323 in https://github.com/Boym323/AirRadar/pull/83


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.111...v1.0.112

## [1.0.111] - 2026-09-22

## What's Changed
* Fix stale aircraft correction after motion polish by @Boym323 in https://github.com/Boym323/AirRadar/pull/82


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.110...v1.0.111

## [1.0.110] - 2026-09-22

## What's Changed
* Polish aircraft motion and radar map visuals by @Boym323 in https://github.com/Boym323/AirRadar/pull/81


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.109...v1.0.110

## [1.0.109] - 2026-09-22

## What's Changed
* Remove GitHub release test lint warnings by @Boym323 in https://github.com/Boym323/AirRadar/pull/80


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.108...v1.0.109

## [1.0.108] - 2026-09-22

## What's Changed
* Fix post-merge AirRadar audit findings by @Boym323 in https://github.com/Boym323/AirRadar/pull/77
* Fix production release publishing after successful deploy by @Boym323 in https://github.com/Boym323/AirRadar/pull/78
* Fix deep audit correctness, privacy and runtime findings by @Boym323 in https://github.com/Boym323/AirRadar/pull/79


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.107...v1.0.108

## [1.0.107] - 2026-09-22

## What's Changed
* Fix runtime regressions from AirRadar audit by @Boym323 in https://github.com/Boym323/AirRadar/pull/76


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.106...v1.0.107

## [1.0.106] - 2026-09-20

Changes since v1.0.105:

- fix: implement source affinity to prevent aircraft feed switching during outages (afb16f9d)

## [1.0.105] - 2026-09-20

Changes since v1.0.104:

- fix: correct tar1090 icon rotation to maintain north-up orientation (9b4702bf)
- Merge pull request #75 from Boym323/fix/aircraft-marker-heading (3465cf47)

## [1.0.101] - 2026-09-20

Changes since v1.0.101:

- No user-facing changes.

## [1.0.91] - 2026-09-20

Changes since v1.0.90:

- feat: enhance browser smoke tests with detailed error handling and mobile navigation checks (16fa7a29)
- feat: implement aircraft icon classification logic and corresponding tests (48349d67)
- feat: enhance aircraft icon classification logic and add comprehensive tests (ee86284d)
- feat: enhance browser smoke tests with deterministic viewport matrix and API response handling (65b64206)
- test(browser): stabilize production smoke gate (07cdb863)
- feat: enhance aircraft motion logic with history tracking and update tests (925bd6f2)
- feat: enhance aircraft trail logic with plausibility checks and update tests (687113df)
- feat: add live tail source and layer for selected trail in AirRadarApp (72040c28)
- feat: enhance network failover provider to support concurrent data sources and deduplication (ce622840)
- fix: increase timeout for browser smoke test to accommodate CI context effects (a46cecff)
- feat: update AdsbLolProvider to support re-api circle queries and enhance response validation (645da0a8)
- feat: enhance browser smoke test with detailed diagnostics and fixture request tracking (11d06bdf)
- fix: improve browser smoke test context handling and layer validation (ade2c616)
- fix: refine browser smoke test viewport handling and error logging (9123ff65)

## [1.0.88] - 2026-09-19

Changes since v1.0.87:

- feat: add receiver polar coverage component and related styles, tests, and utility functions (fbe49506)
- fix: polish radar UI and ATC translations (226197e1)
- feat: update CI workflow to conditionally run tests and add unit/integration test configurations (430afec6)
- fix(i18n): update aircraft count formatting and improve localization tests (f4c307f3)

## [1.0.87] - 2026-09-19

Changes since v1.0.86:

- feat: add receiver coverage API and page components (c1ce1ad6)
- fix(coverage): use receiver timezone for historical periods (d72c8cd7)

## [1.0.86] - 2026-09-19

Changes since v1.0.85:

- Add tests for receiver coverage eligibility and aggregation logic (385ae918)
- feat: enhance aircraft motion handling and add coverage analytics diagnostics (4acdd69b)

## [1.0.84] - 2026-09-19

Changes since v1.0.83:

- feat: add source-aware live radar coverage (7e2e3d3c)

## [1.0.82] - 2026-09-19

Changes since v1.0.81:

- Fix ADSBHub position freshness and bound network trails (b30247fd)

## [1.0.81] - 2026-09-19

Changes since v1.0.80:

- fix: make ATC validation attempt outcomes explicit (11d0616d)

## [1.0.79] - 2026-09-19

Changes since v1.0.78:

- fix: bound concurrent ATC shadow evaluations (5f19f473)

## [1.0.78] - 2026-09-19

Changes since v1.0.77:

- feat: add ADSBHub support for enhanced network aircraft tracking (e1c05b4f)
- feat: enhance ATC prediction validation with classification logic and shadow prediction evaluation (19dcf98d)

## [1.0.74] - 2026-09-19

Changes since v1.0.73:

- feat: enhance UI components and improve status handling in AirRadarApp (55aa68a5)
- feat: add active filter chips and enhance filter functionality in AirRadarApp feat: integrate status badge for emergency squawk in AircraftRadarQuickDetail feat: update Czech and English translations for filter and search functionalities (69169bb2)
- feat: add RouteSection component to improve route display in AircraftRadarQuickDetail (c94bf8cd)
- Add new weather radar images for September 19, 2026 (f7818f75)
- feat: add UI icons for navigation buttons and enhance ATC traffic labels in multiple languages (58e3111d)
- feat: add weather radar archive directory to production gate configuration (9dab8d87)

## [1.0.72] - 2026-09-19

Changes since v1.0.71:

- feat: refactor caching mechanism to use lru-cache and update related tests (50a42f0b)
- feat: replace console error logging with logger in aircraft state service tests (fe58f49a)

## [1.0.68] - 2026-09-19

Changes since v1.0.67:

- fix: ignore numeric emergency state as map alert (d4b0b9b3)

## [1.0.67] - 2026-09-19

Changes since v1.0.66:

- fix: skip non-finite aircraft marker coordinates (7c1757ec)

## [1.0.66] - 2026-09-19

Changes since v1.0.65:

- feat: add sector traffic history API endpoint and validation logic (c2e18dc8)
- fix: reject invalid map bounds coordinates (deb06097)

## [1.0.65] - 2026-09-19

Changes since v1.0.64:

- fix: update release script to use FETCH_HEAD for branch resolution (d2212553)
- feat: add application icon and update metadata for better PWA support (f174a3dd)

## [1.0.64] - 2026-09-19

Changes since v1.0.63:

- feat: implement sector traffic context retrieval and API endpoints (4f61b985)
- feat: add sector transitions API and update documentation (6c64c09d)
- fix: validate geographic coordinates for sectors, airports, and transmitters (84396a4f)

## [1.0.63] - 2026-09-19

Changes since v1.0.62:

- fix(beast): parse short Mode-S frame length (8fde1ee3)
- Merge pull request #63 from Boym323/fix/beast-short-frame-length (6646cfd2)

## [1.0.62] - 2026-09-19

Changes since v1.0.61:

- fix: keep valid Beast frames out of error counter (3301d58c)
- Merge pull request #62 from Boym323/fix/beast-decoder-metric (d2e8a4af)

## [1.0.61] - 2026-09-19

Changes since v1.0.60:

- fix: count valid Beast transport frames (247b656f)
- Merge pull request #61 from Boym323/fix/beast-frame-counter (76f5e648)

## [1.0.60] - 2026-09-19

Changes since v1.0.59:

- fix: classify Mode-S frames in Beast diagnostics (c2df232b)
- Merge pull request #60 from Boym323/fix/beast-diagnostics (3126295b)

## [1.0.59] - 2026-09-19

Changes since v1.0.58:

- feat: use Beast stream as local ADS-B primary (b15f3895)
- Merge pull request #59 from Boym323/feature/local-beast-stream (69acf3b8)

## [1.0.47] - 2026-09-17

Changes since v1.0.46:

- Merge pull request #40 from Boym323/chore/changelog-v1.0.46 (fea01ba8)
- feat(map): add independent SID STAR procedure layers (45ceabd7)
- Merge branch 'main' into feat/procedure-map-layers (7bb878ec)
- Merge pull request #41 from Boym323/feat/procedure-map-layers (ec0b4cd3)

## [1.0.46] - 2026-09-17

Changes since v1.0.45:

- Přidání podmínky pro zobrazení rozsahu kroužků na základě dostupnosti pozice přijímače (09c442bd)
- Merge branch 'main' into fix/receiver-range-availability (b7c89f42)
- Merge pull request #38 from Boym323/fix/receiver-range-availability (737b171d)
- fix(enrichment): reject stale route destinations by position (4a44b733)
- Merge pull request #39 from Boym323/fix/route-enrichment-position-gate (808c453f)

## [1.0.45] - 2026-09-17

Changes since v1.0.44:

- fix: update RouteIntelligencePanel rendering conditions to exclude NO_ROUTE and NO_ATS_DATA statuses (a1aae780)
- fix: update AirRadarApp to set selected ATC context and display additional details when available (fa764664)
- fix: update AirRadarApp and AirspaceCard to improve ATC context handling and live tracking display (364a9fd3)
- fix: update aircraft trail handling to retain complete trails while aircraft are live (3753d34d)
- fix: add trail points and memory metrics to system status page and diagnostics (262e675f)
- fix: update global search to include aircraft focus and adjust href generation (589e3df6)
- fix: update href generation for aircraft search results to use a new path format (1b161c43)
- fix: include registration in cache key for aircraft photo retrieval (677e7b36)
- fix: enhance photo retrieval by prioritizing larger thumbnails from Planespotters API (1d4d2822)
- fix: update build lock file path to /var/lib/airradar/build.lock in scripts and documentation (e63b93a5)
- fix: improve OGN loading logic to ensure proper snapshot handling and prevent race conditions (7040631c)
- fix: add escape key functionality to close UI elements in various components (c11dc626)
- fix: implement reduced motion preferences for smoother animations in AirRadarApp (a6232f25)
- fix: enhance drawer action handling and keyboard shortcut event listener for improved UI responsiveness (417bc339)
- fix: update legend line styles and translations for improved clarity in route visualization (81ef86e9)
- fix: update aircraft drawer layout for improved visual clarity and interaction (11eb37f2)
- fix: remove effective date display from ATC details for improved clarity (5d0c7872)
- fix: enhance SIGMET popup content with detailed information and improve translations for clarity (009bb69f)
- fix: update GeoJSON type references for improved type safety and consistency (45273537)
- fix: add @types/geojson for improved type definitions and compatibility (0da0564a)
- fix: add timeout to SoftRF test suites for improved stability (1961edba)
- Refactor radar aircraft quick detail (0b2e1447)
- Fix compact weather browser gate (0dd4a772)
- Stabilize desktop shortcut browser gate (9747c18b)
- Stabilize traffic search focus (5cdaa318)
- Retry traffic search focus after drawer render (2ac991d7)
- Avoid flaky repeated search focus assertion (7c5faa73)
- Merge pull request #24 from Boym323/refactor/radar-aircraft-quick-detail (bb582bb9)
- Přidání watchdog služby a časovače pro sledování ADSB.lol polling (e6cdf63a)
- test: prove quick aircraft flow skips FlightAware (95297895)
- Merge remote-tracking branch 'origin/main' (51d9e622)
- perf: optimize CI test and production gates (7fb9d154)
- perf: parallelize independent CI validation (737034e6)
- perf: speed up CI and production validation (d375262c)
- feat: add flight intelligence events (f9d5ce94)
- fix: satisfy intelligence lint checks (7e4f715a)
- fix: chain flight intelligence migration (94a723c9)
- test: include flight intelligence migration (7b8fe829)
- Merge pull request #28 from Boym323/feat/flight-intelligence (e74447db)

## [1.0.44] - 2026-09-15

Changes since v1.0.43:

- style: simplify radar aircraft detail panel (fa8dda8d)
- style: load radar aircraft panel polish (fa198ec9)
- fix: preserve mobile aircraft drawer controls (26a24a5a)
- fix: align aircraft drawer close controls with responsive gate (0c88a978)
- Merge pull request #23 from Boym323/ui/radar-aircraft-panel-polish (69f33d1f)
- chore: ignore FlightAware usage runtime state (ab01b00b)
- chore: add data/flightaware-usage.json to .gitignore (1e2224d5)
- Merge branch 'main' of https://github.com/Boym323/AirRadar (5728cf13)

## [1.0.43] - 2026-09-15

Changes since v1.0.42:

- feat: update FlightAware usage data with new timestamps and request details (84ec5758)
- feat: finish aircraft detail v3 visual hierarchy (48a88981)

## [1.0.42] - 2026-09-15

Changes since v1.0.0-rc.4:

- feat: add FlightAware usage data JSON file (8e88ac6d)
- feat: enhance aircraft detail page with new layout and data sources (5bb0e22b)

## [1.0.0-rc.4] - 2026-09-15

Changes since v1.0.0-rc.3:

- feat: show additional FlightAware flight plan details (691bab9a)

## [1.0.0-rc.3] - 2026-09-15

Changes since v1.0.41:

- test: finalize FlightAware release coverage (64d42c50)

## [1.0.41] - 2026-09-15

Changes since v1.0.40:

- fix: add turbopackIgnore comment to runtime state path function (37da2f42)
- fix: update CI workflow for concurrency and simplify deployment steps feat: enhance public serialization for aircraft data and improve test coverage (2462d707)

## [1.0.40] - 2026-09-15

Changes since v1.0.39:

- refactor: clean up tsconfig.json by removing unnecessary type includes (27240678)
- feat: make desktop radar map-first (e4e6e366)
- fix: clarify traffic drawer trigger (59708aac)
- chore: add 1280 drawer layer review (f8126086)
- fix: refine traffic drawer accessibility (d996edce)
- fix: keep radar layers clear of desktop drawer (918b77e5)
- test: refresh frontend ux review captures (74d07f13)
- fix: keep mobile traffic sheet above map (9d4ae489)
- chore: remove temporary ux review artifacts (bd980f68)
- fix: address frontend ux v3 review feedback (871915e7)
- fix: address final frontend ux review feedback (7b3f4896)
- fix: preserve OGN search shortcut focus (c7149c32)
- Merge pull request #20 from Boym323/feature/frontend-ux-v3 (5fe864fe)
- fix: enhance live state snapshot to include public aircraft metadata (98909827)

## [1.0.39] - 2026-09-14

Changes since v1.0.38:

- fix: harden airport movement inference and queries (73da4203)
- fix: correct ATC validity and airport visibility (37269c07)
- test: strengthen map layer and migration production gates (5d6a47ac)
- fix: avoid runway label for airport overflights (88a39122)
- Merge pull request #17 from Boym323/automation/harden-movement-atc-gates (af783315)
- Improve airport movement intelligence UX (86430821)
- Merge pull request #18 from Boym323/feature/airport-movement-ux (5236afe9)
- style: establish visual system v2 (ccaa4c2c)
- polish shared visual shell and secondary layouts (b500a1ef)
- style: finish visual system v2 mobile polish (46c26d08)
- Merge pull request #19 from Boym323/feature/visual-system-v2 (ab018303)

## [1.0.38] - 2026-09-12

Changes since v1.0.37:

- feat: add ATS point search functionality and update related components (28d12b5b)

## [1.0.37] - 2026-09-12

Changes since v1.0.36:

- fix: enable production Austrian ATC ATS sync (61e64830)

## [1.0.36] - 2026-09-12

Changes since v1.0.35:

- feat: enhance ATC data structure with airspace type and class; improve runtime state directory handling (17307733)
- feat: add Austria ATC and ATS coverage (021b7dc9)

## [1.0.35] - 2026-09-12

Changes since v1.0.34:

- feat: add scripts for syncing and fetching Slovak air traffic data (8889e794)

## [1.0.34] - 2026-09-12

Changes since v1.0.33:

- feat(changelog): add normalization and version sorting functionality (a3dc4513)
- feat(animation): replace animation frame with low-frequency timer for smoother aircraft movement (13c178d0)

## [1.0.33] - 2026-09-12

Changes since v1.0.32:

- feat(animation): implement aircraft animation job management and optimize rendering (9cb1e8d8)


## [1.0.32] - 2026-09-12

Changes since v1.0.31:

- feat(geo): add distanceToGreatCircleSegmentKm function and coordinate validation (de67b36b)
- feat(adsbdb): persist enrichment cache across restarts (8925da5c)

## [1.0.31] - 2026-09-12

Changes since v1.0.30:

- feat(weather): persist aviation weather cache across restarts (8fa9a07a)

## [1.0.30] - 2026-09-12

Changes since v1.0.29:

- fix(map): configure MapLibre worker for GeoJSON overlays (8729f806)

## [1.0.29] - 2026-09-12

Changes since v1.0.28:

- fix(ui): harden responsive map controls and mobile layout (31d53386)

## [1.0.28] - 2026-09-12

Changes since v1.0.27:

- fix: make aviation map layers recover reliably (b2cb2785)
- feat: add airport movement intelligence v2 (99ca4068)
- chore: remove obsolete visual polish images (5a8cd334)
- feat: add map radius configuration and filter airports within radius (dbfd1355)

## [1.0.27] - 2026-09-12

Changes since v1.0.26:

- feat: enhance airport visibility filtering and add related tests (814db0e7)

## [1.0.26] - 2026-09-12

Changes since v1.0.25:

- fix: keep release checkout free of generated Next files (51ef21f5)
- fix: keep release checkout free of generated Next files (1f7be7df)
- fix: release tested main commit (4adf67ab)
- fix: release tested main commit (ad8b85b1)
- feat: add Czech airspace activity types (c6a3e567)
- feat: parse Czech AUP UUP and actual activations (b409fdf6)
- feat: add Czech airspace activity provider (30900ab9)
- feat: rate limit airspace activity endpoint (572e94d9)
- feat: expose Czech airspace activity API (05fd9c88)
- test: cover Czech airspace activity parsing (4e6d83ba)
- docs: document Czech airspace activity feed (afe471b5)
- Merge main into feature/airspace-activity-aup-uup (e6bcb919)
- Merge pull request #12 from Boym323/feature/airspace-activity-aup-uup (4f65be04)
- fix: add FlightAware upstream cost guard (2a0a54d5)
- fix: make FlightAware enrichment on-demand only (71b7f7b0)
- fix: require explicit FlightAware enablement (358529a1)
- fix: load FlightAware only from aircraft detail (c06a131d)
- refactor: expose FlightAware budget limit safely (d122ef8d)
- test: enforce FlightAware on-demand enrichment (5745be36)
- test: cover FlightAware request budget and pagination (5a831376)
- docs: document FlightAware double opt-in cost guard (5ec09512)
- fix: avoid caching rate-limited partial FlightAware plans (afb9b5d6)
- test: cover FlightAware double opt-in configuration (c8200931)
- feat: add airspace activity map matching (8f2d4771)
- test: cover airspace activity map joins (d991b03d)
- fix: keep airspace map joins country-safe (705e74ac)
- test: reject foreign airspace designators (0074dd07)
- feat: add airspace activity map translations (88dfeb13)
- fix: match embedded Czech TRA TSA names safely (f6b25a82)
- chore: add temporary airspace map UI patcher (9aa1d731)
- chore: add temporary branch UI patch workflow (6b948098)
- feat: visualize planned airspace activity on radar map (d659489e)
- chore: remove temporary airspace map patch workflow (5c9da30e)
- chore: remove temporary airspace map patch helper (b709c1c4)
- test: cover published Czech airspace names (c9e42581)
- docs: describe AUP UUP map semantics (732d5067)
- test: account for lazy airspace activity fetch (f0dfe2f7)
- Merge pull request #14 from Boym323/feature/airspace-activity-map (8291bd32)
- fix: harden FlightAware cost guard (967acfd0)
- merge: update FlightAware cost guard with main (165b6957)
- test: fix FlightAware fetch mock typing (c82754ab)
- test: align FlightAware provider expectations with cost guard (fd3006ab)
- test: clean FlightAware cost guard lint warning (72059430)
- Merge pull request #13 from fix/v1.5c1-flightaware-cost-guard (208b8654)
- fix: enrich direct aircraft detail on demand (c3ef9993)
- fix: expose bounded airport traffic truncation (fdc7dbfc)
- perf: bound SoftRF snapshot loading memory (13f95b6a)
- perf: upsert receiver altitude coverage cells (2c675d57)
- fix: make route intelligence retryable and deterministic (400a5467)
- docs: document route and airspace intelligence (43ba588c)
- chore: apply final review follow-up codemod (5c8a8722)
- fix: complete reviewed radar resilience fixes (c4b82cd4)
- chore: remove temporary review codemod workflow (35ad552e)
- test: type aircraft enrichment fixture as Aircraft (4e495df4)
- Merge pull request #15 from fix/review-followups-20260911 (5a5bfd06)
- docs: update deployment and recovery instructions for clarity and best practices (32c43744)
- refactor: isolate radar live stream hook (70c87391)
- chore: reduce next build tracing warnings (4498f35c)
- feat: add backwards-compatible SSE delta v2 (8648b71c)
- docs: define future airport movement intelligence (4e99545f)
- Merge pull request #16 from Boym323/automation/overnight-sse-delta-v2 (57acf27b)

## [1.0.25] - 2026-09-10

Changes since v1.0.24:

- feat: enhance airport traffic classification logic and add related tests (626ff809)

## [1.0.24] - 2026-09-10

Changes since v1.0.23:

- feat: Enhance air traffic and weather features (c820306b)

## [1.0.23] - 2026-09-10

Changes since v1.0.22:

- feat: add squawk detail to AircraftDetailV2 component (1af6fad5)
- feat: enhance aircraft detail view with flight plan and altitude chart features (0f17e0f7)

## [1.0.22] - 2026-09-10

Changes since v1.0.21:

- fix: keep release builds from modifying tracked config (f8f73f17)

## [1.0.21] - 2026-09-10

Changes since v1.0.20:

- fix: update paths for Next.js release types to version 21023 (1035203c)

## [1.0.20] - 2026-09-10

Changes since v1.0.19:

- fix: update paths for Next.js release types in tsconfig and import statements (17fd5815)
- feat: add systemd service and timer for SoftRF OGN snapshot updates (fd189b4b)

## [1.0.19] - 2026-09-10

Changes since v1.0.18:

- feat: implement SoftRF metadata validation and checksum verification for emergency whitelist (85b29ad6)

## [1.0.18] - 2026-09-10

Changes since v1.0.17:

- feat: implement isolated build directory for production releases (6c6eb5b3)
- chore: update dependencies and devDependencies in package.json (8c520b43)
- chore: update dependencies and configuration for Next.js 16 and Tailwind CSS 4 (e0f7ecc0)

## [1.0.17] - 2026-09-10

Changes since v1.0.16:

- style: improve layout and responsiveness of history and secondary pages (e189a6c3)

## [1.0.16] - 2026-09-10

Changes since v1.0.15:

- Add radar-selected image for visual polish at 1440x900 resolution (1aeee23f)
- docs: update release and development guidelines for build consistency and visual changes (96863989)
- feat: finalize visual polish v2 (211298d3)

## [1.0.15] - 2026-09-10

Changes since v1.0.14:

- feat: update weather status logic to prevent premature offline marking for METAR/TAF (6f88feb3)

## [1.0.14] - 2026-09-10

Changes since v1.0.13:

- feat: optimize release process by running npm ci with local cache and parallelizing lint, typecheck, and tests (d82388e6)
- feat: implement persistent caching for OGN DDB resolutions with file-based storage (85875919)

## [1.0.13] - 2026-09-10

Changes since v1.0.12:

- docs: update recovery runbook to reflect new migration details and safety checks (1c77b204)
- feat: enhance OGN privacy handling and DDB integration (f0aec448)

## [1.0.12] - 2026-09-10

Changes since v1.0.11:

- fix: update OgnStateService to use a fixed timestamp for testing (8e367fae)

## [1.0.11] - 2026-09-10

Changes since v1.0.10:

- feat: enhance OGN DDB handling and improve privacy features (1203fb49)

## [1.0.10] - 2026-09-10

Changes since v1.0.9:

- feat: extend build wait timeout to accommodate longer production builds (98315c29)
- feat: add airports sync script and corresponding tests (043516b6)

## [1.0.9] - 2026-09-10

Changes since v1.0.8:

- feat: Enhance SIGMET handling and diagnostics (45930d92)
- Add new aircraft icons and ground symbols in SVG format (d63c8f98)

## [1.0.8] - 2026-09-10

Changes since v1.0.7:

- feat(weather): integrate aviation weather functionality and diagnostics (033ab5d4)
- feat: enhance production gate logic to support dynamic build metadata versioning (f556b10a)
- feat(env): expand configuration options for receiver and weather integration (aea8d844)

## [1.0.7] - 2026-09-09

Changes since v1.0.6:

- Add new aircraft icons and sync script for tar1090 (47918dc5)

## [1.0.6] - 2026-09-09

Changes since v1.0.5:

- feat: add User-Agent header to ADSB.lol requests (5bac7791)

## [1.0.5] - 2026-09-09

Changes since v1.0.4:

- fix: handle stale network positions and improve aircraft merging logic (e3fcc215)

## [1.0.4] - 2026-09-09

Changes since v1.0.3:

- fix: retain local aircraft in extended coverage even when position is stale or unavailable (4295f1bc)

## [1.0.3] - 2026-09-09

Changes since v1.0.2:

- fix: make ADSB.lol arbitration and polling independent (28fccfec)

## [1.0.2] - 2026-09-09

Changes since v1.0.1:

- feat: Add ADS-B LOL provider and integrate network diagnostics (1e34569e)

## [1.0.1] - 2026-09-09

Changes since v1.0.0:

- feat: integrate Geist font and enhance aircraft detail display (378a8c15)

## [1.0.0-rc.2] - 2026-09-09

Changes since v1.0.0-rc.1:

- fix: cap tar1090 fallback cache by bytes (4a84ee1b)
- test: support release candidate production gates (f45e98c1)

## [1.0.0-rc.1] - 2026-09-09

Changes since v0.1.13:

- fix: bound aircraft metadata catalog memory (6b32fe38)
- perf: optimize recap queries (d1a7d48d)
- perf: compact live stream and bound SSE clients (82088886)
- fix: scope public rate limits per client (9e4167ad)
- fix: protect watchlist mutations (49774910)
- feat: expose bounded runtime diagnostics (91402c90)
- fix: bound alert ledger growth (f687960f)
- chore: prepare stable release metadata (14d4e32e)
- fix: improve PWA and accessibility basics (f55b1af2)
- test: add production stability gates (c91a8d13)
- ops: document backup and recovery (dfb480e9)
- chore: mark production builds with stable channel (8ffb5f8c)
- test: report production payload measurements (35b73966)
- fix: report metadata catalog diagnostics (2a237a47)
- test: stabilize release channel fixture (5e3f0f67)
- fix: bound tar1090 metadata fallback cache (f201265c)
- fix: report process cgroup memory diagnostics (def27a1c)
- test: cover SSE cleanup and client rate isolation (24f24d96)
- docs: document bounded metadata and memory diagnostics (c246715d)
- test: stabilize browser accessibility gate (33b6ef0e)
- feat: support release candidate deployments (b07ecf4c)

## [1.0.0] - 2026-09-09

Changes since v1.0.0-rc.2:

- No user-facing changes.

## [0.1.13] - 2026-09-09

Changes since v0.1.12:

- feat: enhance backfillChangelog to support release dates and commits (eefc3360)
- feat: persist product alert events (df19de6d)
- feat: explain interesting live aircraft (24c21923)
- feat: add daily and weekly receiver recaps (c3cae270)
- feat: expand system source status (7bab251e)
- fix: polish application UX (e72b3146)
- fix: make record alerts restart safe (9e394397)
- docs: document batch 4 product flows (fdebe871)
- fix: bound alert event deduplication (6a8e10c3)
- fix: persist runtime alert state outside source tree (8898a796)

## [0.1.12] - 2026-09-09

Changes since v0.1.11:

- fix: ensure fetch-tags is set to true for changelog tests (69faa806)

## [0.1.11] - 2026-09-09

Changes since v0.1.10:

- feat: add nearby airports (96db59a6)
- feat: add airport traffic heatmap (d3991c93)
- feat: add receiver range rings (541e7ba4)
- feat: add aircraft map color modes (3dc6bc2f)
- feat: improve radar labels (f364c227)
- feat: improve history playback (30b7eeee)
- feat: sync flight profiles with playback (1f83f61b)
- feat: compare receiver statistics periods (9e3efcba)
- fix: keep period comparison at response boundary (d3f64cd9)

## [0.1.10] - 2026-09-09

Changes since v0.1.9:

- feat: implement automatic changelog generation and update release procedure (e36116ef)
- feat: add backfill functionality to changelog generation script and update tests (63d64408)
- fix: correct indentation for fetch-depth in CI workflow (d5471c36)

## [0.1.9] - 2026-09-09

Changes since v0.1.8:

- feat: add observed aircraft fleet (f86c995f)
- feat: add lifetime aircraft statistics (da57af7f)
- feat: detect first-time aircraft observations (65273932)
- feat: classify rare and returning aircraft (39b1c05f)
- feat: add receiver reception records (95fc0dbc)
- feat: add dashboard logbook summary (ca0bf9ef)
- fix: restore statistics test fixtures (c08f5803)

## [0.1.8] - 2026-09-08

Changes since v0.1.7:

- feat: add standalone flight detail (b5eca01e)
- feat: add flight performance profiles (fc766c62)
- feat: add bounded statistics csv export (de9a31ce)
- feat: add radar keyboard shortcuts (248c5463)

## [0.1.7] - 2026-09-08

Changes since v0.1.6:

- docs: organize token-efficient project documentation (9bcc9430)
- feat: add airport traffic summary (40d88454)

## [0.1.6] - 2026-09-08

Changes since v0.1.5:

- feat: add aircraft history summary feature with localization support (e667ac20)

## [0.1.5] - 2026-09-08

Changes since v0.1.4:

- fix: add degree labels to coverage polar chart (61b33e30)

## [0.1.4] - 2026-09-08

Changes since v0.1.3:

- feat: enhance coverage statistics with detailed analysis and summary features (aafc0f80)

## [0.1.3] - 2026-09-08

Changes since v0.1.2:

- feat: add optional aircraft photos (07df353e)

## [0.1.2] - 2026-09-08

Changes since v0.1.1:

- feat: implement ATC frequency validation and update related logic (46cc8c95)

## [0.1.1] - 2026-09-08

Changes since v0.1.0:

- feat: add map aircraft filters (6968cd66)

## [0.1.0] - 2026-09-08

- Initial commit (18c5a6fb)
- feat: add AirRadar ADS-B radar MVP (05af4e5c)
- migrate AirRadar to Prisma 8 (376e9ab9)
- feat: add aircraft state service tests and ATC sector matching tests (b79d880e)
- Add tests for ADSBDB and FlightAware flight plan providers (091e1b68)
- feat: enhance configuration and improve ATC data handling (3cad8ebd)
- feat: add aircraft enrichment merging logic and enhance tests for metadata handling (8b22a1a9)
- feat: enhance aircraft state management and receiver handling (435500ae)
- feat: add timezone configuration and enhance date handling in aircraft state service (9ab87059)
- Add initial database schema and tables for aviation data (d28384aa)
- feat(i18n): add Czech and English translations, update receiver name to use translations (78838628)
- feat: integrate Temporal API and update date handling across the application (95ba8d64)
- feat: enhance aircraft history management with deduplication and retry logic (e8f1fe77)
- feat: refactor git command usage in release script for improved consistency and error handling (2a211735)
- feat: update service and proxy configurations to use production LAN address (962f54e0)
- feat: implement public receiver position handling and rate limiting for API endpoints (2f56a197)
- feat: add ATC import script and validation tests (172a4beb)
- feat(atc): add Czech ATC synchronization and status scripts (2d79c3f9)
- feat: update LOCAL_HEALTH_URL to use production LAN address for Nginx Proxy compatibility (c8c53440)
- feat: Implement ČÚZK Data50 state boundary provider and associated features (d9b18d1e)
- Add initial contract snapshot for PostgreSQL schema with aircraft and flight models (08630614)
- feat: Enhance aircraft metadata and boundary handling with new attributes and validation (ec15a397)
- feat: Add airport data fetching and integrate with route display (9d680de0)
- feat: enhance boundary handling and airport import functionality (52698ebb)
- feat: streamline upsert operations by removing redundant where clauses and adding conflict resolution (38c4f8ab)
- Add Open Sans Semibold font files and README documentation (228e5b7f)
- feat: update aircraft marker styles and SVG paths for improved visuals (6ffb8599)
- feat: use licensed aircraft silhouette icons (2cc35c27)
- fix: thicken aircraft marker strokes (5dc1252a)
- fix: size aircraft markers for map readability (8f32e837)
- feat: enhance aircraft identifier normalization and improve related documentation (c9abf5f0)
- feat: add altitude, ground speed, and track to aircraft trail points and history (21bdc6ea)
- test: use fake timers for observation metadata test (590bad20)
- feat: enhance aircraft history persistence with partial failure reporting (f5819a9b)
- feat: implement aircraft motion timing and animation targets for smoother transitions (ea9e347f)
- feat: enhance flight history functionality with new API endpoints and playback features (89b6d089)
- feat(atc): enhance aviation coordinate parsing and add altitude confidence (b04ea6c5)
- feat(atc): implement relevant ATC frequency panel and associated logic (9c5899bd)
- feat(atc): make summaries prop optional and enhance compatibility with older servers (b5c76812)
- feat: add dynamic export to enable forced dynamic rendering (16be68d8)
- feat: implement server alerts system with Pushover integration (4763b757)
- feat(atc): enhance ATC dataset status management and add comprehensive tests (83e9f03a)
- feat: implement diagnostic policy for Czech eAIP parsing (57882442)
- Add receiver statistics tests and implement persistence mock (4838fe3f)
- feat: implement airport resolver with database fallback and normalization functions (36e772fc)
- feat: add on-demand weather API for airports with METAR/TAF data (d58a35a2)
- feat: add tests for AirportWeatherDisclosure component and its behavior (85e3c759)
- feat: implement shutdown coordinator with cleanup phases and tests (b5998023)
- feat: implement shutdown coordinator with signal handling and production start script (d0c37c51)
- feat: enhance airport visibility and UI controls (e7216598)
- feat: add systemd unit deployment and validation in release process (126e884c)
- feat: add targeted and changed test scripts for improved development workflow (5f116f23)
- feat: add Playwright for testing and enhance radar UI tests for marker positioning (b2c3dbda)
- feat: implement build lock mechanism for production builds and add related tests (53eb09dc)
- feat: add airport detail page with weather and map components, enhance airport navigation (7157af51)
- feat(statistics): add support for statistics range queries and trend charts (b165f668)
- feat: implement aircraft detail page with recent flights and API integration (25228691)
- feat(trail): implement trail point management and selection logic for aircraft history (f2ae4c9c)
- feat(route): add route visualization v2 (5a5b0b0a)
- feat(search): add global aircraft and airport search (1b1b3208)
- test: cover live track route and search integration (a5ce0bbc)
- fix(ci): update GitHub Actions to use checkout and setup-node v5 (c501cb35)
- feat: implement watchlist management API and UI (088c40c3)
- feat: add system status API and frontend page (fad9afc3)
- feat: add versioning API and build metadata management (db0b013f)
