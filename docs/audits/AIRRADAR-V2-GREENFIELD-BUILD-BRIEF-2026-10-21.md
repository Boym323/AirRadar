# AirRadar V2 — greenfield build specification

**Date:** 2026-10-21  
**Status:** build brief / implementation contract, not an implemented project or a production authorization  
**Target repository:** https://github.com/Boym323/AirRadar — new isolated `v2` development branch with a clean source tree, while `main` remains V1 production.
**V1 archive:** `archive/v1-before-v2-2026-10-21` (snapshot of V1 main before V2 work; retain existing release tags).  
**Existing reference system:** https://github.com/Boym323/AirRadar  
**Previous plan:** `docs/audits/AIRRADAR-V2-REWRITE-OPTIMIZATION-TASKS-2026-10-21.md` — superseded as the primary strategy for V2; keep as historical comparison, do not execute it simultaneously  
**Current product scope:** 79 KEEP capabilities, 99 intentionally removed capabilities, as recorded in the existing repository's `docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json` and its feature descriptions.

## 1. Mission and operating principles

Build **AirRadar V2 as a new, operationally independent system on a clean-tree `v2` branch of the existing repository**, based on the lessons learned from AirRadar V1. This does not require a separate GitHub repository; it must have independent code, build workflow, services, credentials and database. Do **not** transplant the old project tree, database schema, gigantic React components, API architecture or accumulated legacy abstractions. Reimplement the desired product capabilities on a deliberately simple and observable architecture.

Keep **AirRadar V1 on `main` fully operational and unchanged** throughout development. Do not reuse V1's application database, secrets, deployment path, systemd service, ports, CI deployment target or mutable runtime files. Initially use synthetic fixtures and recorded/sanitized traffic; a read-only secondary feed is permissible only after proving that V1 ingest is unaffected. V2 must not send or relay feeder output, duplicate real alerts, or pollute V1 data. A production cutover is an explicit separate operation.

### Product-level contract, not source-level compatibility

- **All 79 KEEP IDs are target V2 product capabilities.** Implement them with new source and test them individually. An initial MVP may expose a subset, but no feature is silently declared complete. A `feature-matrix.json` tracks `NOT_STARTED / IN_PROGRESS / TESTED / ACCEPTED`.
- The 99 REMOVE IDs **are out of scope** and must not be re-created simply because a library or old module contains them.
- The implementation may have a **different internal API, different database schema and different UI component architecture**. Existing wire APIs are not automatically binding, but where V1 client behavior is reused or compared, explicitly document the compatibility boundary and provide meaningful contract tests.
- Existing historical flight/position/statistics data **need not be migrated**. Start V2 with a **new empty flight-history store**. Reference catalogs may be imported afresh from documented public/approved data sources; retain valid licenses, attributions and source provenance.
- Preserve expected behavior: readsb and BEAST data ingestion, ICAO identity/continuity, local vs extended provenance, live aircraft map, bounded SSE full/delta streams, history collected *from V2 launch onward*, receiver statistics, navigation layers, weather, OGN privacy rules, administration, diagnostics and notifications as defined by KEEP.
- Simplify features when useful, but changes to user-visible product behavior are explicit acceptance decisions, not accidental omissions.

## 2. Preferred technology stack (baseline, not a dogma)

| Responsibility | Default technology | Reason and boundary |
|---|---|---|
| Live ingest, BEAST/Mode-S/CRC, local & network track fusion, authoritative RAM state, SSE service | **Rust (Tokio + Axum)** | Predictable hot-path memory/CPU, direct stream parsing and one canonical state owner |
| Domain algorithms such as spatial ATC lookup, vectorized transformations, deduplication | **Rust**, only where the algorithm belongs in the engine | Bounded processing; profile before hand-optimizing |
| Database, history, SQL aggregations, indexes, retention | **PostgreSQL 17+**, migration-controlled SQL; use **SQLx** from Rust if compatible | Set-based data operations, typed queries, no dependency on preview Prisma behavior |
| Public web, MapLibre map, panels, PWA, accessibility, i18n | **TypeScript, Next.js, React, MapLibre** | Best fit for browser UI and interaction architecture |
| Shared API types | Versioned **OpenAPI / JSON Schema** contract with generated TS client | Avoid manually duplicated Rust/TS DTO definitions; explicit versions |
| Offline imports/data cleaning, deterministic fixture tooling | **Python or Rust** where justified | No Python process on the live ingest path |
| Telemetry | Structured logs, OpenTelemetry-compatible traces and Prometheus-style metrics | Measure service boundaries, latency tails, backlog and errors |
| CI/quality | Cargo tests/clippy/fmt/audit, TypeScript lint/typecheck/Vitest, Playwright, CodeQL/SAST, load/soak/security tests | Test the exact release artifact |

Do not introduce Go, Python services, Kafka, Redis, Kubernetes, microservices or a second database by default. Additional languages and processes are permitted **only if measured benefit exceeds build, operational, IPC and recovery costs**. Record language choices as ADRs. Avoid duplicate internal orchestration across Rust and Next.js.

### Runtime composition

Start with **two deployable executables** and one isolated database:

1. `airradarv2-engine`: Rust backend with one live-state authority; supports readsb/BEAST/network adapters, bounded tracks, subscription delivery, read APIs and optional background maintenance. The engine never depends on Next.js availability to keep the ingest loop alive.
2. `airradarv2-web`: Next.js UI and minimal authenticated BFF/proxy when required. It does **not** poll receivers, independently own aircraft state, or write sampled flight history.
3. `airradar_v2`: separate PostgreSQL **database and least-privilege role**, not an extra production PostgreSQL cluster unless real isolation measurements justify one. V1 data and credentials remain separate.

`readsb / BEAST (read-only) ─→ Rust ingest/normalization ─→ canonical RAM tracks ─→ Rust SSE/HTTP ─→ Next.js / MapLibre`

`canonical RAM tracks ─→ bounded asynchronous sample queue ─→ SQLx/PostgreSQL`

Reference/enrichment/weather/ATC/OGN operate as optional, isolated modules and fail soft. All public DTOs are projections that omit secrets, sensitive identifiers and unapproved exact receiver coordinates.

**Important choice:** Only the Rust engine owns live track state; do not resurrect the former requirement that the owner must be Node.js. Retain the *single-owner invariant*, not V1's implementation language.

## 3. Database V2: clean start, high throughput and inexpensive retention

### Independent schema

Design the actual V2 schema after enumerating required queries, data longevity, ownership and KEEP acceptance. Suggested logical groups, **not required legacy table names**:

- `reference`: aircraft identity metadata, airports, runways, frequencies, navaids, ATC and ATS datasets, provenance/version and import status.
- `flight`: flight instances, sampled positions and compact event records *created after V2 starts*. Keep callsign as observed metadata rather than permanent identity; use normalized ICAO and timestamps.
- `stats`: lightweight daily/hourly aggregates, fixed 36-sector receiver coverage (if required by product spec), 7/30 day summaries and capped logbook outputs.
- `navigation`: bounded Navigation Integrity observations and anomalies, including time-window queries.
- `delivery`: notification subscriptions, occurrences, durable queue state, claims/retry/audit metadata.
- `ops`: **bounded** performance history and operational samples, separated from telemetry export and live state.

Only introduce data actually needed by the 79 KEEP set. Prefer a handful of well-indexed query patterns over maximal schema generality. Avoid writing every ADS-B message to disk.

### Required optimization work

1. Estimate write volume and table growth from representative captured input. Implement **sampling/coalescing**, bounded queues and batch inserts with explicit transaction limits, flush intervals and crash behavior.
2. Measure representative reads using `EXPLAIN (ANALYZE, BUFFERS)` on **DEV** data, not intrusive production queries; optimize time/ICAO composite indexes, query pagination, insert/upsert patterns, aggregation, N+1 and data transfer.
3. Choose retention by **access pattern and expected storage**, independently for positions, flight metadata, navigation samples, operational diagnostics and aggregated stats. Initial values are proposed and benchmarked, not guessed as unchangeable product rules.
4. Consider BRIN, partitioning or hypertable-like structures **only after empirical evidence** and an operations cost review. PostgreSQL-native features should suffice initially; don't install an extension without justification.
5. Track write-amplification, WAL throughput, autovacuum/bloat, index size, connection pool depth, lock waits, query p50/p95/p99, CPU/RSS and disk trend. Tune DB settings with documented reversible changes.
6. Use SQLx migrations as reviewed source; all new V2 schema changes run on V2 DEV/staging DB first. Validate backups and restore on V2 before any deployment. No destructive migrations against V1.
7. Ensure history loss/DB outage never stops live radar. Histories, profiles and summaries must show an honest empty state when V2 has not accumulated enough data.

**Not migrating V1 history is permission to omit the migration, not permission to erase V1 history.** Any future cleanup of old V1 PostgreSQL is a separate explicitly authorized task after cutover and verified recovery.

## 4. Service contracts and correctness

### Aircraft identity and provenance

- ICAO hex is the primary airborne aircraft identity, with documented special non-ICAO readsb identifiers. Callsign and registration can change and must be time-bound observations.
- Every track reports original provider provenance: `local` vs `network`. Local measurements remain authoritative for local tracks; network-only tracks are RAM-only unless explicitly permitted by the new product specification.
- Bounded stale windows, source-affinity arbitration, mass-drop guard, position validity (no 0/0 fallback), source time semantics and continuity rules must be specified by tests.
- Offline providers, history DB, weather or enrichment must not stop live ingest.

### API/SSE

- Define versioned `/api/v1/aircraft`, `/api/v1/aircraft/:id`, `/api/v1/stream` (full snapshot SSE), `/api/v1/stream?mode=delta` (sequence-aware initial + changes/deletions), history, stats, aviation, weather and system status. Actual endpoints must be finalized in OpenAPI before implementation. The URL suggestion is not a promise of exact V1 compatibility.
- SSE must use event-stream content-type, heartbeat, abort cleanup, per-client bounded/coalesced queue, admission limit/503, reconnect correctness, slow consumer isolation, no per-client provider polls and no credentials/private receiver coordinates in public DTO.
- Avoid work proportional to **subscribers × all aircraft × update frequency**. Coalesce canonical projections and serialize once per compatible audience/tick if benchmarked beneficial.
- Admin writes and private status require authentication/authorization, CSRF/origin protection as appropriate and safe request validation. Sanitized public system/health diagnostics stay publicly readable.

### OGN/ATC/Weather

- OGN privacy is a hard gate: noTracking and DDB opt-out excluded; unresolved identity fails closed; public anonymous targets must not leak the original address/metadata. OGN tracks are separate from ADS-B history, alerts and receiver statistics.
- ATC represents probable geometry/altitude/time matches, never a verified radio frequency tuned by the aircraft. Handle AGL/MSL uncertainty explicitly.
- Weather providers have independent TTL/stale-if-error caches and strict validity intervals. All weather and archive work is isolated from the live receiver poll loop.

## 5. Suggested new repository layout

```text
AirRadarV2/
  AGENTS.md
  README.md
  Cargo.toml
  Cargo.lock
  package.json
  package-lock.json
  .github/workflows/
  apps/
    engine/
      Cargo.toml
      src/
        main.rs
        api/
        ingest/
        tracks/
        sse/
        history/
        aviation/
        weather/
        ogn/
        notifications/
        diagnostics/
    web/
      app/
      components/
      features/
      hooks/
      lib/
      public/
      tests/
  crates/
    domain/
    beast/
    geometry/
    contracts/
  database/
    migrations/
    queries/
    fixtures/
  contracts/
    openapi.yaml
    feature-matrix.json
    public-dto-snapshots/
  tools/
    importers/
    replay/
    benchmarks/
  tests/
    fixtures/
    integration/
    load/
    browser/
  deploy/
    systemd/
    scripts/
    smoke/
  docs/
    adr/
    architecture/
    api/
    runbooks/
    plans/
    reports/
```

The initial scaffold must be **smaller** than this proposal if modules aren't implemented yet; avoid empty package/abstraction proliferation. Each new crate must have a documented reason and stable ownership boundary.

## 6. Greenfield work packages, one at a time

Each `G-XX` is separately executable. Finish its tests and evidence before starting an unrelated package. Stages G-00..G-14 must **not deploy to or replace production V1**.

### G-00 — New repository, baseline and build infrastructure

Create a clean-source **`v2` branch in `Boym323/AirRadar`**, preserve the V1 archive and unchanged default `main`, decide licensing as appropriate, and add README, AGENTS.md, architecture diagram, ADRs, **V2-only CI (push/PR on `v2`, with no deploy job)**, secret scanning, Cargo workspace, Next.js app, code-style rules and deterministic build. An orphan-history branch is desirable but a complete replacement source tree with inherited Git ancestry is acceptable if connector Git APIs cannot create an orphan commit; disclose the difference. Set up isolated DEV database and fixtures. Confirm no reused V1 deploy secrets, DB or ports.

**Acceptance:** fresh checkout builds/tests from pinned lockfiles; lint/typecheck/Cargo checks green; CI artifact identified by exact SHA; no V1 deployment can be triggered from `v2`; production V1 untouched. If lockfile or toolchain validation cannot run, record G-00 as PARTIAL and do not claim a completed build.

### G-01 — Contracts, fixtures and feature acceptance matrix

Copy the **product ID/title/selection inventory**, not source implementation. Create detailed acceptance scenarios for 79 KEEP and explicit exclusions for 99 REMOVE. Capture safe, deterministic readsb JSON and BEAST, V1 SSE/API samples and navigation/weather examples, scrub private coordinates and provider secrets. Version all public DTOs. Use property-based tests for parsers and track transitions.

**Acceptance:** machine-readable acceptance matrix, OpenAPI baseline, replay fixtures, old/new semantic comparisons and documented deliberate deviations.

### G-02 — Rust core: local ADS-B reception and state (MVP backend)

Implement read-only readsb JSON and BEAST adapters, Mode-S/CRC parser and tests, normalized aircraft model, ICAO identity, current RAM track table and bounded lifecycle with an explicit single owner. Include fallback across sources, receiver health, cadence, error recovery and no database dependency on live output. Reuse only small **verified algorithms/fixtures** from V1 if licensing and parity checks allow; no bulk code copying.

**Acceptance:** repeatable replay, Rust parser parity against fixtures, recovery after provider failure and constant/bounded memory at expected track counts.

### G-03 — Rust network ingestion, origin arbitration and Continuity Guard

Add ADSBHub SBS, ADSB.lol raw and HTTP fallback behind independent timeouts/backoff. Normalize timestamps, field merging, source affinity, local/extended union and mass-drop continuity guard. Bound all per-provider maps.

**Acceptance:** network-only tracks remain correctly labeled, local authority preserved, deduplicated tracks and failure isolation proven by 1×/2×/4× replay.

### G-04 — Rust public REST and SSE full/delta

Implement OpenAPI endpoint set and both full/delta SSE protocols, per-client admission, heartbeat, backpressure, bounded fanout and safe DTO. Generate client types for TS. Expose engine metrics without expensive per-client work.

**Acceptance:** 1/10/100 simulated clients, slow clients, reconnect, cleanup, no information leak and measured P95/P99/CPU/RSS.

### G-05 — PostgreSQL V2 fresh schema, history and retention

Build the **new isolated `airradar_v2` DB**. Implement only referenced tables and SQLx migrations. Sample positions and flight instances, bounded async writes, history/profile/summary reads, indexed range queries, aggregates and storage retention. **No V1 history import.** Never copy data automatically from V1 or connect V2 writer to V1.

**Acceptance:** DB outage does not stop radar; real replay shows bounded WAL/IO and CPU; tests cover flight identity, DST, pagination, failed batches, recovery, retention and 7/30 day empty/new-data behavior.

### G-06 — New frontend: live map and essential UX (MVP)

Build Next.js/React/MapLibre UI from clean components: map lifecycle, live stream hook, aircraft symbols/labels, LIVE/EXTENDED toggle, list/search, detail, trail, follow and mobile layout. Do not copy a giant map monolith or global CSS. Stable map instance; batch style data updates; measure React commit count and frame latency.

**Acceptance:** usable desktop/mobile air radar against replay; no map remount on selection, no unbounded UI caches, Playwright visual & interaction smoke.

### G-07 — Airports, ATC/ATS/NAVAID and Navigation Integrity

Rebuild airport catalog/search/detail and proven eAIP/CZ/SK/AT ATS providers as selected, plus spatial index for ATC, NAVAIDs and Navigation Integrity anomaly/history. Geometry index in Rust if benchmarks justify; versioned catalogs, explicit provenance, atomic swaps and retained original aviation source licenses.

**Acceptance:** parity of chosen visible features, stable spatial query P95/P99 and event-loop-independent processing, valid altitude semantics, no non-approved transmitter location invention.

### G-08 — Weather and historical map context

Implement current METAR/TAF, CHMI radar timeline, SIGMET/AirSIGMET, aircraft weather BDS and optional necessary archive projections. Each provider has isolated bounds/cache and valid-time semantics; no server weather polling solely to satisfy live ADS-B ticks.

**Acceptance:** correct time slider, stale-if-error semantics, no upstream storm, and live ingest unaffected by weather outage.

### G-09 — OGN, DDB, SoftRF, RXW and enrichment

Separate OGN ingest/RAM/SSE from ADS-B and implement strict DDB privacy, targeted lookup/cache, SoftRF emergency whitelist and privacy tests. Add RXW Hub, FlightAware/ADSBDB/Planespotters metadata only when used on demand and within provider budgets.

**Acceptance:** no-tracking/unresolved targets never leaked; optional providers fail softly; no metadata request amplifies ingest.

### G-10 — Notifications and administration

Implement subscription and Web Push/Pushover delivery with one durable claim/retry state machine. Unknown channels never become SENT; avoid duplicate sends where provider semantics allow, document external exactly-once limitations. Set up secure admin login, public sanitized health, rate limits and user authorization. Never send actual customer alerts from shadow V2.

**Acceptance:** two workers/restart/stale claim tests; negative provider 2xx/429/5xx tests; public/admin separation; no shadow duplicate notifications.

### G-11 — Statistics, receiver coverage, system health and T58

Deliver daily/7/30 day rollups, receiver coverage 36 sectors, counters, logbook, CPU/RSS/heap diagnostics, DB write queue and integration health. Implement low-overhead observability and real T58 read-only sampled soak, periodic 1×/2×/4× benchmarks.

**Acceptance:** statistically comparable replay and real safe read-only observations; diagnostic endpoints never issue eager provider calls; bounded telemetry retention.

### G-12 — Product polish: accessibility, PWA and interaction completeness

Implement clean semantic UI, dark/light theme if desired, CZ/EN localization, command search, keyboard shortcuts, offline last-known snapshot, screen-reader/keyboard checks and responsive layouts. Do not build 99 REMOVE pages.

**Acceptance:** Playwright desktop/tablet/mobile, i18n completeness, offline security and versioned cache invalidation.

### G-13 — Feature closure and nonfunctional hardening

Test all 79 KEEP product scenarios end-to-end; record per-ID actual evidence links and accepted intentional deviations. Run fuzz/property tests, security audit, CodeQL, concurrency/resource soak, backpressure, malicious inputs, database outages, receiver feed loss, misconfigured secrets and user browser flows. Document runbooks and recoverability.

**Acceptance:** no KEEP ID silently omitted; all selected features are tested/accepted or explicitly blocked; critical security, privacy or corruption issues = NO-GO.

### G-14 — Parallel shadow trial

Run AirRadar V2 in a **separate isolated environment**; use read-only mirrored feed only if approved and technically safe, otherwise deterministic replay. No V2 external alert dispatch or producer uploads. No shared DB/ports/configs. Compare old/new receiver snapshots and high-level output, track freshness, CPU/RSS/network, SSE reconnect and browser UX over a representative period. Use actual measurements; adjust candidate without affecting V1.

**Acceptance:** versioned shadow trial report, comparable input, known intentional differences and no impact on V1.

### G-15 — Explicit cutover decision and independent V2 production deployment

**This is the only stage potentially authorized to replace live V1 service; it still requires the user's explicit permission to perform actual cutover and any infrastructure change.** Prepare new systemd units, dedicated release directories, staging/production secrets and reversibility. Verify V2 database backup **and restore**, exact build commit, real load tests and known-good V1 rollback. Avoid accidental DNS/proxy reconfiguration; any reverse-proxy cutover must be explicitly authorized. Cut over traffic only after passing public UI, readsb/BEAST, history writes, database, OGN privacy, source attribution, weather, notifications and T58.

**Acceptance:** unambiguous GO/NO-GO report. V1 stays available as rollback and remains untouched until independent retention/decommission authorization.

## 7. Build quality, performance budgets and evidence

Track at least these as **measurements**, not invented improvement percentages:

| Metric | How measured | Gate |
|---|---|---|
| Ingest to public map freshness | timestamped replay + real read-only shadow capture | No material delay/regression against valid baseline |
| CPU usage | same workload 1×/2×/4×, per-process and combined engine+web | Demonstrable overhead cost/benefit; no unexplained tails |
| RSS/heap and alloc rate | steady state + multi-hour soak | Bounded, no progressive memory growth |
| SSE fanout | 1, 10, 100 subscribers; full vs delta | Bounded buffering, loss/reconnect handling, stable P95/P99 |
| Database write amplification | WAL bytes, inserts/batches, I/O, query P95/P99 | Within measured resource budget; no hot-path DB coupling |
| Rust parser/canonical state | fixed BEAST/JSON golden fixtures & property tests | 100% correctness on known cases |
| 79 KEEP feature tests | feature-matrix links to tests, UI captures and contract cases | All requirements either accepted or blocking documented |
| Security & privacy | CodeQL, cargo audit, secret scan, OGN tests, anonymous/admin cases | No critical leaks or unauthorized admin actions |
| Recovery | kill/restart, DB offline, upstream loss, backup restore | Automated or documented safe recovery, no V1 impact |

Set concrete performance budgets **after G-01/G-02 baseline**. Favor meaningful P95/P99 and real user interaction metrics over synthetic throughput claims. Preserve all test output references and exact git SHAs in `docs/reports/`. A polished redesign or fewer lines of code alone is not a success criterion.

## 8. Data import, licensing and legacy-reference rules

- V1 is a read-only reference implementation; no mutations, hot reloads, code deployment, health-workflow changes or database cleanup there.
- V2 may read **sanitized exported fixtures**; any old proprietary/sensitive runtime data and provider credentials stay out of GitHub. Capture access logs/diagnostics only with authorization and sanitization.
- Aviation data catalogs (airports, ATC, ATS, NAV, regional restrictions, CHMI, weather) are imported from documented sources in compliance with attribution and licensing. Do not invent factual frequency/ATC station data.
- V2 database starts with no historic flights. Reference catalogs are not "historical flights" and must be populated to support selected capabilities. Daily/7/30/full period stats start when V2 observations start.
- Do not delete historical data in V1: skipping migration already achieves the requested greenfield history reset.

## 9. Definition of done and user-visible result

For each package, show: Git SHA, edited/added files, public API contract changes, which KEEP IDs were implemented, test report with counts and skipped cases, before/after performance under same fixture, risk register and next dependency. If blocked, state what specific missing permission/source makes it blocked and leave working modules in a runnable state.

G-15 overall success requires V2 is a genuine stand-alone application with no **runtime** dependencies on V1 despite sharing GitHub repository history; all 79 chosen product capabilities have individually verified evidence; no 99 removed modules reintroduced without explicit scope change; independent DB and safe live data feed; public UI is stable on desktop/mobile; observability and recovery verified; operator explicitly approves safe cutover.

---

## 10. Copyable kick-off prompt for Codex

> Create the brand-new implementation on isolated **`v2` branch of `Boym323/AirRadar`** according to this specification:
>
> https://github.com/Boym323/AirRadar/blob/main/docs/audits/AIRRADAR-V2-GREENFIELD-BUILD-BRIEF-2026-10-21.md
>
> **Start with stage G-00 only**, then G-01 if G-00 is fully verified. Build from a new empty V2 source tree, not by refactoring the existing AirRadar; preserve V1 on `main` and the V1 archival ref. Read the V1 feature inventory and runtime constraints as product requirements, not as architecture to copy. Use Rust/Tokio/Axum for the live engine, TypeScript/Next.js/MapLibre for UI, PostgreSQL/SQLx for a new database, and add other languages only where justified.
>
> Do not change or deploy V1, share its database or ports, or import old flight history. The existing V1 automatic deployment on `main` must not be reused by the `v2` CI. Implement production-grade CI, tests, deterministic local development, API contracts and a real first runnable skeleton. Report commits, verification evidence, deployment safety and next stages. Do not perform production cutover without separate authorization.
