# AirRadar V2 → V1 consolidation and retirement gate (2026-10-27)

**Target:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar), the existing production radar. **Reference:** [Boym323/AirRadarV2](https://github.com/Boym323/AirRadarV2), an independent DEV implementation. This is a **source review**, not a runtime acceptance, benchmark, deploy approval or permission to delete V2. See the [Czech version](../../docs/cs/audits/AIRRADAR-V2-RETIREMENT-GATE-2026-10-27.md).

## Verified source inventory

V2's `contracts/feature-matrix.json` describes 45 active feature IDs; the current V2 matrix marks **18 TESTED/ACCEPTED** and **27 NOT_STARTED**. Its G-05 live MapLibre UI and G-04 SQLx history writer are DEV-stage, not production substitutes for V1. V1 independently has production implementations for most capabilities of the 18, and for many items that V2 has not started. Equivalent user-visible behavior does **not** prove ingest/storage parity.

| V2 capability | V1 owner / source | Decision |
| --- | --- | --- |
| J01/J02/J05/J11 local readsb, BEAST, RAM, continuity | `lib/server/aircraft-state.ts`, `beast-local-provider.ts`, `aircraft-continuity.ts` | Existing V1; verify reconnect/identity/performance parity before deleting V2 source |
| J03/J04 Rust parser/CRC and automatic BEAST↔JSON failover | `native/airradar-native`, `lib/server/beast-decoder.ts`, V1 provider runtime | **Open evidence gate**: compare BEAST/JSON failover, CRC/CPR, CPU tails and sustained load; do not transplant a second live engine |
| J06/J07/J08 HTTP and SSE snapshot/delta | `app/api/aircraft/route.ts`, `app/api/stream/route.ts`, `lib/server/sse-delta.ts`, `lib/aircraft/sse-v2.ts` | Existing V1; compare sequence-gap/reconnect/fanout contract |
| J09 sampled PostgreSQL history | V1 aircraft history/sampling pipeline | Existing V1 with different schema/ORM; **do not** deploy V2 SQLx writer or run migrations on V1 DB |
| R01/R04/R06/R08/R09/R12/R14 map, labels, traffic, trail, follow, airports, styles | `components/radar/`, `lib/radar/`, `lib/server/airport-catalog.ts` | Already present; check visual parity on 320px/mobile and live load |
| R03 category-specific aircraft silhouettes | `lib/aircraft/icon-classification.ts` and existing tar1090 assets | **Ported incrementally in this change**: category-only fallbacks A1–A6/B4 without extra API/DB/marker layers; exact type assets keep priority |
| R03 V2 original Path2D silhouette artwork | `apps/web/src/radar/aircraft-icons.ts` in V2 | Keep source in an external archive if desired; V1 already has a substantially richer asset family. Do not replace artwork merely to move code |
| G-05.11 selective GeoJSON `updateData` | V1 `lib/radar/aircraft-webgl-layer.ts`, `live-aircraft-changes.ts` | **Not transplantable as-is**: V1 aircraft use a custom WebGL layer, not V2's GeoJSON aircraft source. Only reconsider after matched render benchmarks |
| G-06 draft static OurAirports catalog | `lib/airports/ourairports.ts`, `lib/server/airport-catalog.ts` | Existing V1 catalog/airport API is richer; importing V2's static copy would duplicate data |
| V2 Vite frontend, Rust Axum server and DEV systemd/SQLx deploy | V1 Next.js production release/runtime | Keep V1 architecture. Never switch deployment or attach two ingest owners as part of UI migration |

The 27 **NOT_STARTED** V2 features (airport detail/NAVAID, weather, push/Pushover, statistics, system health, PWA/i18n/search, emergency codes) are a **backlog**, not 27 migrations. V1 already implements a substantial subset; reconcile each with `docs/features.registry.json` if needed, without restoring features deliberately retired from V1.

## Verified migration and archive status

- **PR [#1115](https://github.com/Boym323/AirRadar/pull/1115) merged** to V1 `main` as `6a8f5dea`. [Production workflow #40514851874](https://github.com/Boym323/AirRadar/actions/runs/40514851874) passed, including the Deploy production job. This is not a physical-GPU benchmark.
- **PR [#1117](https://github.com/Boym323/AirRadar/pull/1117) merged** as `8b62549f`. DF18 CF0/CF1 identity isolation passed PR CI, BEAST native parity, CodeQL and synthetic load tests. Check the separate production release.
- **Complete V2 Git history bundle was made and restoration-tested**: isolated V1 [`archive/airradarv2-complete-history-20261027` branch](https://github.com/Boym323/AirRadar/tree/archive/airradarv2-complete-history-20261027) holds `AirRadarV2-full-history.bundle` (1,664,501 bytes, SHA-256 `12d3c50172cf3e51e5bde50e3f1c667cbba2bfc0153895128e102a474ddd7c36`), 158 refs including 34 branches and 63 tags, original V2 `main` `7f0ad16bc7a4577a4348b188941a07c8f18b01c1`. [Archival workflow #40516350354](https://github.com/Boym323/AirRadar/actions/runs/40516350354) verified `git bundle verify`, exact refs parity after a mirror clone, and pushed the bundle into a separate archival branch. It was **not added to V1 production main**.
- After obtaining the bundle and checksum from the archival branch: `sha256sum -c SHA256SUMS.txt`, then `git clone --mirror AirRadarV2-full-history.bundle AirRadarV2-restored.git`. A GitHub-hosted archive **is not an independent offline backup**; download an additional off-GitHub copy before deleting V2.
- **External DEV LXC remains unmodified**. Before retirement, inventory and stop verified `airradarv2*` systemd services/timers, repo-scoped runner, reverse proxy/DNS and V2-only DEV PostgreSQL role/database, after checking consumers and needed data. No admin connection to those hosts was available here. **Nothing was stopped or deleted on DEV infrastructure or PostgreSQL.**

## Gates before deleting V2

1. **Source preservation:** export a full V2 Git mirror outside the repository/GitHub, including tags/history; retain relevant ADRs, contract fixtures, original icon license/provenance, DEV runbooks and benchmark evidence. A branch or link into V2 is not a durable backup once V2 is deleted.
2. **Behavior parity:** exercise V1 real receiver BEAST/JSON reconnect and failover, CRC/CPR, non-ICAO/ICAO identity, stale positions, category trust, SSE epoch/gap recovery, 5,000-aircraft load, and historical sampling. Record explicit passing CI and production acceptance evidence.
3. **Performance:** compare V1 before/after CPU p95/p99, event-loop latency, RSS, SSE bytes, frame latency and PostgreSQL write rate. V2 SwiftShader results are not hardware GPU benchmarks and must not be copied into V1 claims.
4. **Operational cleanup:** identify and disable V2's DEV runner, auto-deploy workflows, systemd services/timers, reverse-proxy routes/DNS/TLS, and its isolated PostgreSQL database/role, only after preserving required data and confirming no consumers remain. **No action taken by this change.**
5. **Sign-off:** inspect merged V1 feature work, verify green CI/CodeQL/release and browser smoke and decide deliberately which V2-only experiments are archived rather than ported. Delete the GitHub V2 repo only as a separate explicit administrative action after a restorable mirror exists.

## Scope of the first port

The V1 BEAST identification decoder also previously used incorrect `A${typeCode}` metadata. The V2 G-05/ADR-0015 contract is now applied: **TC4=A, TC3=B, TC2=C**, with the low three identification bits representing the subtype, and only A1–A7, B1/B2/B4/B6, C1/C2 allowed after frame CRC verification. Only DF17 and ordinary-ICAO DF18 CF=0 are currently eligible for this category trust. Reserved codes do not overwrite a previously known category. A separate follow-up implements DF18 CF=0 as ICAO, CF=1 as non-ICAO using the existing `~HEX` identifier, and rejects CF=2–7 until TIS-B/ADS-R source and IMF validation exists. Synthetic tests ensure CPR never combines ICAO and non-ICAO tracks sharing the same 24-bit address. Real-world runtime parity and performance remain **open acceptance gates**, not claimed complete. CRC and reserved-category regression tests are included.


The category fallback reads the existing `AircraftView.category` from the current readsb/BEAST-derived pipeline and selects **already bundled** category SVGs, only when no exact type-specific tar1090 SVG exists. It adds no network calls, polling, SQL, threads or React/MapLibre mounts. Unsupported/reserved categories remain at the pre-existing fallback. The special rotorcraft/glider/UAV and ground classifications stay unchanged. Category-only presentation does not suppress initial type metadata enrichment.

**Verification:** PR #1115 CI and production release workflow passed, and PR #1117 passed its PR CI, BEAST parity, CodeQL and synthetic load tests. Hardware/mobile benchmarks still require separate field measurements.
