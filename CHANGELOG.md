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
