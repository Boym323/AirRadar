# AirRadar — data-source and feature retirement audit (2026-10-18)

[Česky](../cs/agents/DATA-FEATURE-RETIREMENT-AUDIT-2026-10-18.md)

> **Task-specific brief, not a global policy.** Read [AGENTS.md](../../AGENTS.md) first, then [CODEX-CONTEXT.md](../CODEX-CONTEXT.md). The live implementation and the latest verified commit outrank this dated inventory. Do not preload all docs. This task differs from the [redundant runtime-work brief](RUNTIME-REDUNDANT-WORK-2026-10-18.md): its goal is to identify obsolete data products and genuinely unused functionality, not just speed up existing paths.

## Objective and authorization boundary

Audit the complete chain **upstream/source → ingestion/decoding → normalization → memory/cache → persistence → API/SSE → UI/alerts/analytics/history/fallback**. Find data that AirRadar gathers, transforms, stores, retains, transmits, or calculates **without a justified consumer or resilience purpose**. For proven dead code and harmless unused artifacts, implement small validated removals autonomously. For a still-consumed product feature, provider, fallback, public contract, or retained historical dataset, do not assume retirement is authorized: explain the impact and mark **NEEDS_PRODUCT_DECISION** before changing semantics.

Primary outcomes: lower CPU, RSS/heap, GC, network requests/bytes, DB I/O/storage and maintenance burden **without** breaking core ADS-B/MLAT/ACARS/VDL2, histories, public interfaces, weather features that remain in use, or diagnostic safeguards. Favor deletion of demonstrated dead paths over speculative Rust/C++ rewrites.

No destructive production DB operation, live environment change, manual deploy/restart, or unsanctioned provider probing. Production is read-only where already permitted. Changing code on main can trigger automatic CI/CD; obey the exact-SHA gates and the single-writer rules in root AGENTS.md.

## Prove that data is genuinely unused

For each candidate, establish:
1. **Owner and trigger:** precise source file/function, feature flag/default and actual invocation schedule (startup, per decoded frame, 1 s poll, timed task, page request, admin action, CI-only).
2. **Consumers:** direct and indirect imports, dynamic imports, re-exports, background workers, public API callers, SSE schemas, UI, mobile clients, alerts, historic replay, forecast validation, recovery, observability, tests, integrations and external clients. A missing internal import is insufficient evidence for a public API being unused.
3. **Storage:** RAM, checkpoints, logs, files, PostgreSQL tables/indexes, retention/cleanup and migration contract. Separate data created for recovery/failover from redundant data.
4. **Production evidence:** configured and enabled/disabled lanes (sanitized only), hit/miss, reads/writes, unique output value, frequency, CPU/allocations, network bytes, DB rows and storage size. If unavailable, mark **NOT_MEASURED**.
5. **Safety:** feature parity, source provenance/affinity, stale handling, ICAO identity, local-vs-network separation, privacy, licenses, security, fallback and failure modes.

Decision categories for the inventory: **REMOVE** (proven unreachable/obsolete with no contract), **OPTIMIZE** (needed but wasteful), **DISABLE_CANDIDATE** (potential runtime-off switch, not a production config change), **KEEP** (needed including fallback/recovery), **NEEDS_PRODUCT_DECISION** (user-facing or external contract), **UNKNOWN** (insufficient evidence). Label assertions **PROVEN / HYPOTHESIS / NOT_VERIFIED**. Distinguish expected gain from measured gain.

## Priority investigations

### P0 — finish the retired model-wind chain

The 2026-10-18 wind UI/API deletion did **not** prove the model wind pipeline is dead. In the inspected code, lib/server/operational-twin.ts still calls defaultWindAloftProvider.getWind for corridor levels, builds weatherCorridor and windTimingShadow and computes wind-timing promotion. A timed Digital Twin calibration path in lib/server/aircraft-state.ts can invoke the same builder. Its UI may still expose a wind profile. Inspect at least:
- lib/server/wind-aloft.ts; lib/weather/aircraft-wind-context.ts; lib/weather/corridor-intelligence.ts
- lib/server/operational-twin.ts; lib/operational-twin/wind-timing-shadow.ts and wind-timing-promotion.ts; lib/operational-twin/event-outcome.ts
- lib/server/aircraft-state.ts, components/aircraft-operational-twin.tsx, feature flags, public DTOs and documentation.

Determine whether model wind is a deliberately retired product or a still-required Digital Twin function. If removal is explicitly supported by current product intent, remove the complete model-wind call chain and dependent, no-longer-consumed fields safely, preserving unrelated SIGMET/PIREP, canonical trajectory, BDS weather observations and all non-wind Digital Twin behavior. Otherwise mark NEEDS_PRODUCT_DECISION, do not silently drop displayed features or change public DTOs. Test that no hidden model-wind fetch remains on scheduled calibration or detail requests. Do not conflate modeled ICON-EU/ALADIN wind with directly observed aircraft BDS/weather data.

### P1 — redundant network sources and polling

Inspect lib/server/network-failover-provider.ts, network-source-value.ts, providers, ADSBHub and ADSB.lol raw/HTTP lanes, config and diagnostics. Use per-lane reported/fresh/exclusive/overlap values, failover tests, actual enabled production flags and outages. Derive real unique position yield and processing/network cost; the existing once-per-minute identity-free diagnostics can help. Do not disable lanes merely because most ICAOs overlap: source resilience, MLAT, freshness, priority, provenance and license rules matter. Suggest DISABLE_CANDIDATE with explicit impact; never change production flags as part of this audit.

### P1 — background shadow/validation computation

Inspect lib/server/aircraft-state.ts and the predictive, navigation-integrity, operational-twin and track-fusion validators. Trace each periodic observation and calibration writer to the actual admin/report/UI consumer, release gate and evidence-retention requirement. Identify calculations continuing without a possible downstream use or when an entire feature is disabled; benchmark conditional short-circuits instead of bluntly removing evidence-producing features. Preserve readiness and replay/ground-truth integrity.

### P2 — persistence and cache overproduction

Audit FlightPosition/Flight/FlightEvent, AircraftWeatherObservation, PredictiveObservation, navigation-integrity, route/ADSBDB and aviation weather caches, map-context archives and calibration data. Compare record production to read patterns, freshness and retention. Check the existing flight-position persistence *shadow policy* before any activation; do not replace history precision without demonstrated route/flight-story parity. Prefer stopping unnecessary future writes to deleting history. Do not DROP/TRUNCATE/delete production records or rewrite migrations. Treat archive, replay and recovery consumers as legitimate.

### P2/P3 — metadata, assets and historical artifacts

Inspect the concurrent ADSBDB/tar1090 metadata merge and whether fields fetched twice really contribute. Review old aircraft SVGs, audit artifacts and generated snapshots for production-bundle references and legal/license obligations. Removing assets from the deployment bundle is distinct from deleting migration history or audit evidence. Never delete required Prisma migration snapshots or licenses on size alone.

## Procedure

1. Capture fresh main SHA, production SHA only by permitted read-only diagnostics, relevant flags, owner files and latest changes. Record initial inventory and highest-value candidates. Do not work in serving /var/www/airradar.
2. In an isolated non-serving checkout, map candidate-specific call graphs using targeted rg/search and tests. Trace first-party AND external consumers. Record deletion risks and rollback path.
3. For each candidate with runtime cost, collect comparable baseline with workload/version/flags/seed/sample size, CPU/event, allocations, heap/RSS/GC, event-loop p50/p95/p99/max, network request/bytes, DB writes/reads/duration, queue growth as appropriate. Historical T58 is context only. Zero reads or imports must be corroborated.
4. Implement one **proven safe** logical change at a time. Remove obsolete fetchers, schedulers, caches, serializers, tests and documentation together where appropriate. Keep backward-compatible public contracts or explicitly surface NEEDS_PRODUCT_DECISION. Add negative tests proving removed external calls no longer occur and positive parity/fallback tests.
5. Run targeted tests, relevant typecheck/lint/build and applicable feature, docs, security, visual and release-scope gates per AGENTS.md. For route changes regenerate docs/features.registry.json + FEATURES.md. Keep authoritative EN/CS documentation paired. Validate equivalent output and repeat same-workload A/B; accept only meaningful gain without safety/tail regressions.
6. Recheck fresh origin/main, full diff, single-writer lease, and exact commit. Make small non-force direct-main commits only for verified routine changes permitted by AGENTS.md; do not create routine PRs. Since even a docs-only main push may trigger CI/CD, verify the exact SHA CI/CodeQL/release state before any further deploy-bearing push. No manual deploy or T58 run without separate approval.
7. On blocker (unproven consumer safety, broken parity, tests, release checks, unstable benchmark, DB or provider permission), stop that candidate, retain safety and report it. Continue to another independent safe candidate only when consistent with the single-writer/release rules.

## Required handoff report

Provide a compact Czech report with one row per candidate: **priority; source and exact code path; trigger; existing consumer/fallback; observed runtime/DB/network impact; evidence link; REMOVE/OPTIMIZE/DISABLE_CANDIDATE/KEEP/NEEDS_PRODUCT_DECISION/UNKNOWN; regression risk; proposed change; measured A/B gain or NOT_MEASURED**. Separate **DONE / NOT_DONE / BLOCKED**. Include exact changed files, commit SHA, CI/CodeQL/release links and rollback instructions for each implemented change. Identify what was intentionally kept and why. Never state production is updated without verifying its matching deployed SHA.
