# V2-01: Architecture boundaries and evidence (2026-10-21)

**Baseline:** main 53f137d8a3b43766d2125a1bca87a4e7c13d0bd9.
**Isolation:** GitHub branch v2/01-contract-boundaries-2026-10-21. No main push, release, production restart or DB operation.
**Status:** PARTIAL pending exact-commit CI, workload measurements and per-feature parity.

## Actual dependency / ownership graph

    readsb JSON + Beast -> lib/server/providers.ts
                        -> lib/server/aircraft-state.ts (one global state owner)
                        -> RAM snapshots
                           |-> lib/server/history.ts -> sampled local PostgreSQL history
                           |-> app/api/stream/route.ts
                                -> lib/server/public-serialization.ts
                                -> bounded SSE V1/V2
                                -> components/radar/use-radar-live-aircraft.ts
                                -> components/airradar-app.tsx

This is an ownership-level diagram, not a claim about synchronous call order. Network ingest shares the same AircraftStateService; optional OGN/weather/ATC probes may not introduce an independent live poller.

| Event/side effect | Existing owner | Required contract |
| --- | --- | --- |
| Local snapshots, stale guard, source affinity | lib/server/aircraft-state.ts | Single poller, ICAO identity |
| Receiver source and failover | lib/server/providers.ts | Provider port does not start polling on import |
| Public DTO and coordinates | lib/server/public-serialization.ts | Sanitized receiver coordinates and provider data |
| Live transport | app/api/stream/route.ts | SSE, 15s heartbeat, slow-client coalescing, capacity 503 |
| Local history | lib/server/history.ts | Sampled local records, fail soft on DB failure |
| Client map | components/airradar-app.tsx | No server runtime bundle dependency |
| Weather radar map extent | lib/contracts/weather-radar.ts | Original CHMI extent retained |
| OGN privacy | lib/server/ogn-state.ts | Never bypass DDB privacy or write ADS-B history |
| Diagnostics | lib/server/system-status.ts | Public safe GET without warming provider |
| Delivery | lib/server/alert-delivery-worker.ts | Async, no extra local ingest work |

## Concrete code changes

1. lib/contracts/history.ts: HistoryResponse, AircraftDetailMetadata, AircraftQuickEnrichment and AircraftQuickDetailResponse moved to a pure shared type module. Legacy lib/server/history.ts re-exports the original names; UI now imports from the pure contract.
2. lib/contracts/weather-radar.ts: CHMI geographic bounds moved without changing their values. The old server module re-exports the exact same object. UI imports browser-safe bounds directly.
3. lib/ports/aircraft-provider.ts: local AircraftProvider and ExternalAdsbProvider interfaces extracted from the concrete server provider registry; legacy types are re-exported.
4. scripts/v2-architecture-graph.mjs parses TypeScript/JavaScript imports, resolves relative and @/ edges, distinguishes type-only from runtime, finds runtime cycles, computes browser reachability, and identifies protected layer violations. Run npm run architecture:check and npm run architecture:graph. For full strict debt assessment run node scripts/v2-architecture-graph.mjs --strict --json. Literal dynamic imports are recognized; computed dynamic paths/external module internals are not.
5. tests/v2-architecture-boundaries.test.ts verifies compatibility and fixtures for layered graphs, forbidden port-to-server coupling, server-to-client edges, cycles and client-reachable server modules. CI adds check and before/after graph evidence.

Pure normalization and calculations already live under lib/aircraft, lib/radar and lib/geo.ts. No new persistence API, message bus, framework or runtime owner is introduced. Extraction of persistence interfaces and further separation of live normalization/provider wiring requires later verified tasks rather than an unused abstraction.

## KEEP matrix

The V2 task document says **79 KEEP / 99 REMOVE**; the current canonical file docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json lists **88 KEEP / 90 REMOVE**. The V2-01-KEEP-DEPENDENCY-MATRIX-2026-10-21.json contains all 88 canonical KEEP IDs and candidate owning architecture lanes. These are family-level candidate paths only, explicitly tagged NOT_VERIFIED_PER_ID. There is no proof of individual 88/88 (or 79/79) behavior in this task, and no KEEP functionality is intentionally removed.

## Reproducible measurement

Pull-request CI creates a merge-base Git archive without contacting the production runtime. It runs the same import analyzer with --json on the base and branch tree, emitting artifacts/v2-01/before.json, after.json and after.dot. The static graph metrics are files, runtime/type import edges, cross-layer imports, strongly connected runtime components, and browser reachable server modules.

| Metric | Before | After | Evidence |
| --- | --- | --- | --- |
| Browser import of history server types | Present | Replaced with pure DTO import | Source diff |
| Browser value import of server weather bounds | Present | Replaced with shared contract import | Source diff |
| Runtime cycles | 0 | 0 | First CI graph sample at 3904c114 only |
| Cross-layer edges | 722 | 730 | First CI graph sample at 3904c114 only |
| Server modules reachable from client runtime | 1 | 0 | First CI graph sample at 3904c114 only |
| Typecheck CPU/wall/RSS | NOT VERIFIED | NOT VERIFIED | No isolated full checkout |
| ADS-B CPU/RSS/event-loop P95/P99, SSE size | NOT VERIFIED | NOT VERIFIED | No production or equivalent replay; do not claim speedup |
| Lint, typecheck, test, build, CodeQL | NOT VERIFIED | NOT VERIFIED | First CI architecture gate PASS, subsequent docs:check BLOCKED by 3 pre-existing missing Czech translations plus this report; the report translation was added in the branch. Await exact-SHA CI |

A relocated type has no runtime payload by itself; no performance benefit is claimed without evidence. No changes are made to Prisma models/migrations, history data, provider behavior, SSE wire format, public routes or security. Existing tests need to demonstrate runtime equivalence; static compilation alone is insufficient.

## Risk, release and rollback

Outstanding: existing cycles and legacy cross-layer references, nonliteral dynamic imports invisible to the scanner, full per-ID KEEP parity, CI and production-like measured performance. Any red gate blocks integration. Release is V2-15 only, not part of this PR. Revert the isolated V2-01 branch commits for rollback; no DB operations are necessary.
