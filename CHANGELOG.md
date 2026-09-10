# Changelog

All notable changes to AirRadar are documented here.

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

## [0.1.10] - 2026-09-09

Changes since v0.1.9:

- feat: implement automatic changelog generation and update release procedure (e36116ef)
- feat: add backfill functionality to changelog generation script and update tests (63d64408)
- fix: correct indentation for fetch-depth in CI workflow (d5471c36)

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

## [0.1.12] - 2026-09-09

Changes since v0.1.11:

- fix: ensure fetch-tags is set to true for changelog tests (69faa806)

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

## [1.0.0-rc.2] - 2026-09-09

Changes since v1.0.0-rc.1:

- fix: cap tar1090 fallback cache by bytes (4a84ee1b)
- test: support release candidate production gates (f45e98c1)

## [1.0.0] - 2026-09-09

Changes since v1.0.0-rc.2:

- No user-facing changes.

## [1.0.1] - 2026-09-09

Changes since v1.0.0:

- feat: integrate Geist font and enhance aircraft detail display (378a8c15)

## [1.0.2] - 2026-09-09

Changes since v1.0.1:

- feat: Add ADS-B LOL provider and integrate network diagnostics (1e34569e)

## [1.0.3] - 2026-09-09

Changes since v1.0.2:

- fix: make ADSB.lol arbitration and polling independent (28fccfec)

## [1.0.4] - 2026-09-09

Changes since v1.0.3:

- fix: retain local aircraft in extended coverage even when position is stale or unavailable (4295f1bc)

## [1.0.5] - 2026-09-09

Changes since v1.0.4:

- fix: handle stale network positions and improve aircraft merging logic (e3fcc215)

## [1.0.6] - 2026-09-09

Changes since v1.0.5:

- feat: add User-Agent header to ADSB.lol requests (5bac7791)

## [1.0.7] - 2026-09-09

Changes since v1.0.6:

- Add new aircraft icons and sync script for tar1090 (47918dc5)

## [1.0.8] - 2026-09-10

Changes since v1.0.7:

- feat(weather): integrate aviation weather functionality and diagnostics (033ab5d4)
- feat: enhance production gate logic to support dynamic build metadata versioning (f556b10a)
- feat(env): expand configuration options for receiver and weather integration (aea8d844)

## [1.0.9] - 2026-09-10

Changes since v1.0.8:

- feat: Enhance SIGMET handling and diagnostics (45930d92)
- Add new aircraft icons and ground symbols in SVG format (d63c8f98)

## [1.0.10] - 2026-09-10

Changes since v1.0.9:

- feat: extend build wait timeout to accommodate longer production builds (98315c29)
- feat: add airports sync script and corresponding tests (043516b6)

## [1.0.11] - 2026-09-10

Changes since v1.0.10:

- feat: enhance OGN DDB handling and improve privacy features (1203fb49)

## [1.0.12] - 2026-09-10

Changes since v1.0.11:

- fix: update OgnStateService to use a fixed timestamp for testing (8e367fae)

## [1.0.13] - 2026-09-10

Changes since v1.0.12:

- docs: update recovery runbook to reflect new migration details and safety checks (1c77b204)
- feat: enhance OGN privacy handling and DDB integration (f0aec448)

## [1.0.14] - 2026-09-10

Changes since v1.0.13:

- feat: optimize release process by running npm ci with local cache and parallelizing lint, typecheck, and tests (d82388e6)
- feat: implement persistent caching for OGN DDB resolutions with file-based storage (85875919)

## [1.0.15] - 2026-09-10

Changes since v1.0.14:

- feat: update weather status logic to prevent premature offline marking for METAR/TAF (6f88feb3)

## [1.0.16] - 2026-09-10

Changes since v1.0.15:

- Add radar-selected image for visual polish at 1440x900 resolution (1aeee23f)
- docs: update release and development guidelines for build consistency and visual changes (96863989)
- feat: finalize visual polish v2 (211298d3)

## [1.0.17] - 2026-09-10

Changes since v1.0.16:

- style: improve layout and responsiveness of history and secondary pages (e189a6c3)

## [1.0.18] - 2026-09-10

Changes since v1.0.17:

- feat: implement isolated build directory for production releases (6c6eb5b3)
- chore: update dependencies and devDependencies in package.json (8c520b43)
- chore: update dependencies and configuration for Next.js 16 and Tailwind CSS 4 (e0f7ecc0)

## [1.0.19] - 2026-09-10

Changes since v1.0.18:

- feat: implement SoftRF metadata validation and checksum verification for emergency whitelist (85b29ad6)

## [1.0.20] - 2026-09-10

Changes since v1.0.19:

- fix: update paths for Next.js release types in tsconfig and import statements (17fd5815)
- feat: add systemd service and timer for SoftRF OGN snapshot updates (fd189b4b)

## [1.0.21] - 2026-09-10

Changes since v1.0.20:

- fix: update paths for Next.js release types to version 21023 (1035203c)

## [1.0.22] - 2026-09-10

Changes since v1.0.21:

- fix: keep release builds from modifying tracked config (f8f73f17)
