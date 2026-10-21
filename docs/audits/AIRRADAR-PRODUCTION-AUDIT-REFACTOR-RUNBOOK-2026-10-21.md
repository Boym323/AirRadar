# AirRadar — production audit, hardening, refactor and safe code reduction
**Execution runbook — 21 October 2026**

> This is an execution specification for a coding agent with access to the GitHub repository and to the *approved* build/test/production verification environment. Creating this document does not authorize or perform code changes, database changes, restarts or deployments. The operator authorizes the normal **non-destructive automated production release** only when deliberately invoking the execution prompt that refers to this runbook. Follow the current repository policy if it is stricter.

**Repository:** https://github.com/Boym323/AirRadar  
**Target:** current default branch main; discover the actual SHA at execution time. Historical review base on 2026-10-21: 4c85fec9ad46cfab9f72452ef987ccf5916fe2a6. Do not assume that this SHA or an earlier audit accurately describes the repository when you execute.  
**Source of truth:** [AGENTS.md](../../AGENTS.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [docs/DATA-FLOWS.md](../DATA-FLOWS.md), [docs/RUNTIME-INVARIANTS.md](../RUNTIME-INVARIANTS.md), [docs/DEVELOPMENT.md](../DEVELOPMENT.md), [docs/RELEASE.md](../RELEASE.md), [docs/features.registry.json](../features.registry.json), [docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json](SELECTED-FEATURE-REVISED-2026-10-21.json), and the canonical KEEP/REMOVE evidence documents. Read only the relevant parts instead of loading the full documentation tree.

## 0. Mission and permissions

Complete the work, not just another high-level audit: verify the current implementation; reproduce or disprove each candidate defect with targeted tests; fix verified defects; remove genuinely unnecessary source, CSS, scripts and assets with dependency evidence; improve runtime efficiency without altering retained behavior; test the complete system; deliver the tested change by the repo's approved CI/CD path; verify production; and report before/after measurements and every changed/removed file.

The execution prompt constitutes permission for normal code/documentation commits, routine GitHub checks and the project's already-established **automated** production deployment to a validated commit, including the deployment's normal service restart. It does **not** authorize force pushes, bypassing failing gates, manual restarts/releases outside that workflow, database resets, destructive migrations, deleting real data, changing secrets or production .env, rewriting reverse-proxy configuration, or changing operating-system settings. If manual privileged intervention or risky database changes are actually required, isolate the blocker and obtain separate approval. Do not ask for confirmation for ordinary implementation choices; finish all safe portions first.

**Production change discipline:** Read-only baseline measurements first. Do not run npm run build in the active production checkout; use the separate non-serving development checkout, isolated CI build and deploy/release.sh as prescribed. Never deploy from an unvalidated SHA. A main push can start an automatic production rollout. Prefer one verified deployment-bearing push after staged local commits and checks. Inspect latest main again immediately before push. Follow the repository's existing direct-main development policy; if a one-off deployment-free release-preview is indispensable to obtain full predeployment security/browser evidence, treat that as a justified exception, not a new routine branching policy.

## 1. Acceptance contract: never lose retained features

Read the latest explicit selection. The documented revised baseline is **79 KEEP / 99 REMOVE** (historically 88/90, with nine more explicitly removed). Treat the current user-approved selection as canonical, not an outdated PR description. Do not resurrect removed behavior. Verify all 79 KEEP IDs against both implementation and real behavior wherever feasible, not just the presence of files. The preserved core includes:

- Local readsb JSON and BEAST ingest, Rust BEAST/CRC acceleration and JS fallback, identity continuity, bounded RAM state, local and extended coverage, graceful provider failover, sampled PostgreSQL flight history.
- Aircraft /api/stream SSE v1 snapshots and v2 deltas, coalescing/backpressure, heartbeat, per-client and global capacity limits, public serialization and client reconnection.
- MapLibre map, flight selection/details/history, aircraft paths, labels/icons, selected-aircraft context and route, responsive navigation, mobile drawer, radar map layers, weather overlay and only the requested ATC/ATS layers.
- Public and intentionally sanitized read-only system/health/performance status; protected privileged diagnostics and ALL admin mutations; correct receiver position privacy.
- Retained CZ ATC, relevant sector polygons and frequencies; required CZ/SK/AT ATS references per feature matrix. Do not confuse removal of SK/AT radio scan channels in a different project with deletion of AirRadar ATS reference data.
- Airports, METAR, SIGMET, CHMI weather sources, relevant navigation data and integrity detection, OGN privacy/DDB/SoftRF semantics, selected optional network providers and RXW integrations.
- Required push subscription transport and durable Pushover delivery state, user-requested diagnostics, release infrastructure and existing persisted records needed by KEEP functionality.

**Never delete** PostgreSQL flight/position/history tables or data, production migrations, retained route/ATC geometry, weather archive, subscription storage, durable Pushover occurrences/deliveries, OGN privacy data or persistence, deployment scripts, Rust fallback, or necessary tests. Do not remove a shared dependency just because the page that originally used it was retired. Preserve dynamic import paths, public endpoints actively used by external clients, worker startup/shutdown hooks and compatibility DTOs if demonstrably needed.

## 2. Establish authoritative current baseline

1. Confirm git HEAD, clean development checkout, current prod /api/version SHA and GitHub Actions status, working branch, production health and recent release. Do not assume prod == main. Record which claims were directly observed and which came from older documentation.
2. Capture baseline metrics with the repository's existing read-only T58 / health / integration instruments: local aircraft and ingestion freshness, BEAST vs JSON behavior, source rates, SSE active connections and queue/coalescing counters, CPU%, RSS, heap, event-loop delay P50/P95/P99/max, major GC, DB write rates/latency, response latency and errors for core endpoints. Do not infer causality from isolated outliers.
3. Run or examine current test matrix, lint, TypeScript, package audit, Prisma migration integrity, CodeQL, release scope, feature registry and browser release gate. Capture actual commands and logs. Audit that GitHub main branch's latest commit can be distinguished from successful checks on an ancestor. Run synthetic 1x/2x/4x radar fixture before claiming performance wins.
4. Inventory all tracked app/components/lib/scripts/styles/data/public files and their import/call/reference graphs. Detect dynamic routes, runtime-loaded assets, standalone worker invocations and indirect import paths. Report source LOC using the project's own metrics; baseline on 2026-10-21 was approximately **86,598 nonempty production LOC and 28,000 test LOC**, not an authoritative future measurement.
5. Verify the real dependency and permission boundaries for live receiver, PostgreSQL, Web Push and upstream integrations. Do not change database/proxy configuration just to complete an audit.

## 3. Fix all confirmed P1 candidates, with tests first

### P1-A: durable notification queue incorrectly marks unsupported channels as sent
Inspect lib/server/alert-delivery-worker.ts, lib/server/alerts-fleets-repository.ts and tests/alert-delivery-worker.test.ts. Current candidate: after conditional PUSHOVER processing, markDeliverySent() is called unconditionally even for non-PUSHOVER channel values. Add a failing test proving the bug, then use an explicit dispatcher for supported channels. Unsupported/invalid channels must remain auditable as unsuccessful (FAILED or an explicit safe state), never SENT without actual delivery. Preserve retry/backoff, idempotency, stale claim recovery, graceful shutdown and existing queued rows. Test provider 200, 4xx, 429, 5xx, timeout, unknown channel, double-worker and restart scenarios. No duplicate deliveries following retry unless documented as unavoidable provider behavior.

### P1-B: correct the admin/public read boundary, not a blanket login wall
Inspect lib/server/watchlist-auth.ts and each app/api/admin/** route, /system API and public serialization. Current candidate: isWatchlistSessionValid returns true when AIRRADAR_ADMIN_AUTH_ENABLED is false. The repo explicitly intends PUBLIC SANITIZED read-only health/system projections; preserve those without login. Sensitive admin-only diagnostics must use a strict administrator session and never expose secrets, precise receiver location, private host identities, provider credentials, raw exception details or internal infrastructure. All mutations must fail closed regardless of legacy opt-out. Produce a route-level public/admin/access matrix and tests for anonymous GET, authenticated GET, missing token, invalid token, same-origin mutation and CSRF rejection. If a read is already safely sanitized and intentionally public, retain its access; fix only real exposure.

### P1-C: make Web Push delivery status truthful
Inspect lib/server/web-push.ts, lib/server/web-push-store.ts, app/api/push/**, lib/server/delivery-health.ts and any durable producer/consumer. Distinguish "transport configured" from "delivery pipeline working". Determine whether the KEEP matrix actually requires Web Push as a current event transport; do not reintroduce removed Alert/Fleet rule engines. If an active permitted producer exists, wire a real tested end-to-end transport and observable queue state. If no producer exists, state this explicitly and accurately reflect that in health/status; do not fabricate successful notifications or silently remove retained subscriptions. Test expected mobile/browser subscription behavior and failure paths.

## 4. Correct P2 and reliability defects

### P2-A: concurrent subscription updates
lib/server/web-push-store.ts writes one shared .tmp after read-modify-write. Reproduce parallel additions/removals; serialize writes with a safe in-process queue/lock, use a unique temp name and atomic replacement, bound endpoint/key lengths and JSON request size, preserve file mode 0600, recover safely from interrupted temp writes. If multi-process writers can exist, choose an appropriate cross-process mechanism rather than assuming an in-process lock is sufficient. Tests must demonstrate no lost update, duplicate endpoint or invalid truncated JSON.

### P2-B: lightweight public system SSE refresh
lib/server/system-status-stream.ts currently invokes readSystemStatus() using the default full detail on its five-second polling interval. Separate bounded, shared PUBLIC status polling from privileged full diagnostics. Never send raw privileged fields to anonymous consumers. Preserve the status SSE contract, abort cleanup, coalescing and ability for admin clients to obtain authorized richer diagnostics. Measure resulting CPU, DB query count and event-loop tails; do not call a reduction a performance gain without matched evidence.

### P2-C: scalable notification health SQL
lib/server/alerts-fleets-repository.ts deliveryHealthSnapshot loads all AlertDelivery rows into JS. Replace with bounded database aggregates or a defensible materialized/rolling summary, preserving all returned health fields and correct null/timestamp handling. Cover empty, 100, 100k+ row fixtures, unusual statuses and concurrent updates. Verify query plan and indexes before adding any new index. No destructive migrations.

### P2-D: navigation-integrity history correctness
lib/server/navigation-integrity.ts currently orders and limits before all temporal filtering. Move applicable from/to overlap filters into the database query, make ordering stable with tie-breaks, introduce bounded pagination/cursor when the contract requires more than 200 rows. Avoid stale/anomaly omissions at the cap; define behavior when DB is offline, and add fixtures with >200 events and overlapping active anomalies. Update callers/API and tests compatibly.

### P2-E: Prisma 8 RC upgrade safety
package.json historically pins @prisma/orm-postgres 8.0.0-rc.9 with Prisma CLI 8.0.0-rc.13; prisma/contract.prisma has many implicit table mappings. Run the existing read-only scripts/audit-prisma-rc-mapping.mjs and inspect actual DB catalog read-only before considering version alignment or explicit @@map. Do not automatically upgrade Prisma. Any schema transition requires explicit verified compatibility, backup/restore and operator approval; otherwise retain current working pinned mapping and document residual risk. Run integration checks with the actual runtime client; never use prisma reset or destructive migration.

### P2-F: API input and load hardening
Inspect /api/ogn/state, /api/ats/routes, /api/push/subscribe and all remaining 52 routes for bounding, unhandled request.json failures, expensive public requests, cache correctness, permission/privacy and unexpected 500s. Apply shared rate limiting where appropriate, document exceptions for SSE, avoid unbounded payloads and verify x-real-ip is trusted only behind a properly configured proxy. Do not alter the reverse proxy unless separately approved. Keep public health checks operable. Preserve necessary CSP for Next/MapLibre; harden unsafe-inline only if browser tests prove compatibility. Prefer practical, low-overhead improvements supported by a failing test.

### P2-G: resilience review
Inspect starvation/timeouts/backoff and cleanup across ingestion, network fallback, history writes, SSE, weather radar, ATC geometry, enrichments, shutdown, OGN and database. Ensure provider failures do not block the live readsb -> RAM -> SSE core. Investigate real CPU hotspots with profiler evidence before changing loops or allocating more caches. Keep coalesced/predictable work, source provenance and fail-closed privacy.

## 5. Systematic dead-code and file reduction — without regression

The objective is a smaller **necessary** codebase, not arbitrary LOC minimization. The 100k *production-source* LOC target was already met in the historical snapshot; do not delete retained features or weaken tests for a numerical target.

1. Run scripts/audit-code-footprint.mjs, scripts/selected-feature-premerge-audit.mjs and features registry checks; cross-reference static import graph, dynamic imports, URL strings, TS symbol use, runtime entry points, server workers, GitHub workflows, startup scripts, migration compatibility, generated assets and user KEEP/REMOVE matrix.
2. Produce a table for every removal candidate: path/symbol, byte/LOC saving, exact inbound references (or proof of none), keep/remove feature ID, dynamic usage risk, test evidence and whether the code is historical data vs executable code.
3. Delete genuinely orphaned components, page CSS, unused imports, dead helper functions, outdated alternate implementations, duplicate serialization, stale comments, obsolete feature flags, old one-off scripts/benchmarks and unreferenced assets ONLY when absence of runtime use is supported. For files merely "apparently unused", do NOT delete if unresolved dynamic or external dependence remains. Do not delete snapshots, evidence, database migrations, persisted runtime files, whole integration lanes or release infra just to reduce repository weight.
4. Consolidate duplicated code when tests establish behavior parity. Retain existing intended public routes and data contracts. If API changes, update registry, feature docs, Czech mirrors where authoritative, client callers and tests. Do not delete an endpoint just because its old page was removed: check direct/external consumers and dependency evidence.
5. Tackle oversized modules incrementally: components/airradar-app.tsx (state/handlers/hooks), app/globals.css (component-specific CSS), lib/server/aircraft-state.ts (ingest/lifecycle/enrichment/notifications), lib/server/history.ts (reads/writes/retention), lib/server/system-status.ts (public/admin builders). Extract cohesive modules rather than rewriting the whole application. Preserve module exports and avoid creating dozens of 5-line wrappers.
6. Reevaluate retired backend paths such as old Flight Story/event surfaces, obsolete smart search types, unused route-intelligence variants, unneeded ATC predictors, obsolete statistics/recap functions, unsupported config switches and expired benchmarks against current scope. Do not remove shared H07/H14/J09 or R11/R17 dependencies.
7. Report exact production LOC, test LOC, tracked file count, deleted bytes and test/runtime deltas before/after. Prefer actual simplification and reducing runtime allocations over cosmetic one-line formatting.

## 6. Test and quality gate

Before any deployment-bearing push or rollout:

- Run npm ci; npm run lint; npm run typecheck; npm run test:full; npm run build in the **non-serving development checkout**; npm audit --omit=dev --audit-level=high; npx prisma migration check; npm run features:check; npm run docs:check; npm run visual:check and relevant icon audits. If current scripts differ, follow the actual repo configuration and state exactly what ran. No bypass by skip flags.
- Run targeted P1/P2 regression tests including concurrency, malformed JSON, denied admin reads, public sanitized reads, unknown notification channel, delivery retry/claim, SSE v1/v2 delta/reconnect/slow consumers, BEAST parser+CRC Rust parity/fallback, OGN privacy, navigation pagination and PostgreSQL integration when available.
- Require release-scope classification, CodeQL clean, all applicable release-validation/release-tests/release-performance jobs green on the **exact release candidate tree/SHA**; run full browser responsive smoke (desktop and mobile, not only screenshots), synthetic 1x/2x/4x load, and compare profiler/runtime metrics. For a broad refactor, do not rely solely on changed-tests optimization.
- Verify the full selected feature suite and public read-only behaviors; no missing routes, broken static assets, failed link navigation, removed map layers, lost recent history, changed source precedence, lost notifications or privacy leaks.
- If failing/unknown tests, stale CodeQL checks or incompatible migration are discovered, stop before deployment, fix/test or document a hard NO-GO. Never claim green based only on historical CI logs.

## 7. Production deployment and validation

1. Confirm current live baseline, current commit/version, receiver freshness and stable errors; capture deploy artifact SHA and immutable rollback build IDs. Read docs/RELEASE.md and inspect CI release plan. Verify the prepared build and any migrations do not change data destructively. For any proposed DB migration require verified restorable backup and schema-compatible rollback; if backup absent, keep schema unchanged and mark any migration as blocked.
2. Push the validated code through the permitted non-force flow, respecting direct-main policy and ensuring no unrelated dirty changes. For risky predeploy CodeQL and browser coverage, use the repo's exceptional deployment-free release-preview gate if necessary. Do not make an untested deployment-bearing push. Do not alter production secrets or proxy.
3. Let existing GitHub Actions deliver the exact pinned artifact via the existing self-hosted deployment workflow. Never manually build over active .next, manually restart the service or run release.sh outside approved workflow to bypass CI. Watch CI and CodeQL completion for the exact source tree and validate deploy job's reported SHA.
4. After release, verify public /api/version SHA, /api/health with database and receiver status, /api/aircraft, local/extended aircraft counts, SSE v1/v2, stream reconnect/backpressure, selected aircraft/detail/history, map tiles and retained layers, airports, weather, ATS, ATC context, system/public sanitization, protected admin operations, OGN/privacy if configured, durable notification health, Pushover/Web Push if actually used, and UI in mobile/desktop browsers.
5. Compare matched-load live T58 telemetry: receiver/source freshness, CPU, RSS/heap, event loop P95/P99/max, DB latencies/writes, SSE latency and error rates. Baseline and post-release must use comparable aircraft counts and windows. Explain uncertainty, outliers and traffic differences rather than claiming unsupported improvement.
6. If critical regression happens, stop subsequent pushes, capture logs and apply only an approved, schema-compatible previous-build recovery documented in deploy/recover-previous-build.sh; do not invoke rollback-native.sh as a replacement for full application rollback. Existing migration rollback is NOT automatic. If automated safe recovery is not authorized or prerequisites fail, report NO-GO and leave existing data intact.
7. If you lack live-server tooling or permissions, finish implementation, tests and GitHub validation as far as actually possible, clearly label production verification **NOT DONE**, and supply operator-ready exact commands; do not pretend deployment happened. Do not leave an inconsistent partial change without a summary.

## 8. Delivery report (mandatory)

Provide a concise but evidence-backed Czech final report with:

1. Scope and exact baseline/latest commit, PR/commit URLs, tests actually run, production version SHA and deployment status.
2. All findings P0/P1/P2/P3: reproduced vs disproved vs mitigated vs blocked, links to precise lines/commits, no unverified claims.
3. Files deleted, modules changed, dead code reasoning, before/after production LOC / test LOC / tracked files, and any added dependencies/migrations (normally none).
4. Security/privacy and functional KEEP/REMOVE coverage; exact list of unverified KEEP IDs and external API compatibility gaps.
5. Quality gates with run URLs: full Vitest, lint, typecheck, npm audit, CodeQL, database integration, browser smoke and synthetic scaling.
6. Before/after production CPU, RSS, event-loop P95/P99, SSE, DB, source freshness under comparable load, or explicit unavailable data.
7. Remaining risks, manual approval blockers and rollback instructions, with explicit GO / NO-GO recommendation.

**Definition of done:** No confirmed P1 bug left unfixed; all changes have regression coverage; no user-selected KEEP regression; unused code is removed only with dependency evidence; no privacy downgrade; all required checks green for the exact release SHA; production deployed and observed healthy with measured comparable baseline—or clearly marked blocked if evidence/authorization is absent. Never invent any gate result or imply production success based solely on merging code.
