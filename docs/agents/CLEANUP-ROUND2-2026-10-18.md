# AirRadar cleanup round 2 — decisions and evidence (2026-10-18)

[Česky](../../cs/agents/CLEANUP-ROUND2-2026-10-18.md)

> Dated, task-specific handoff. Read [AGENTS.md](../../AGENTS.md) first. Fresh code, current deployed SHA, CI and measured evidence supersede this snapshot. This document is not permission to delete database history, public contracts, useful resilience/fallback, or to manually deploy.

## Completed incremental changes

| Scope | Verified change | Runtime/evidence limits |
| --- | --- | --- |
| Retired Digital Twin model-wind docs | [PR #1031](https://github.com/Boym323/AirRadar/pull/1031), main `c8daf6af`. Removed obsolete EN/CZ wind-timing descriptions and non-existent `/api/map-context/wind` documentation. PR and main CI green. | Documentation-only; Weather Fusion model wind remains. No CPU change. |
| Superseded aircraft icon assets | [PR #1032](https://github.com/Boym323/AirRadar/pull/1032), main `fa2a15bf`, [release v1.0.525](https://github.com/Boym323/AirRadar/releases/tag/v1.0.525). Removed 184 legacy files totaling 1,056,990 raw bytes. Maintained tar1090 catalog (378 files), license and renderer preserved. New negative source-reference/asset test. PR CI, CodeQL, scaling, main release/health green. | Production artifact ZIP: v1.0.524 74,766,779 B vs v1.0.525 73,895,942 B: 870,837 B lower (1.16%). The interval also includes the documentation commit. This is not a measured CPU/RAM gain. |
| Radar map builder extraction | [PR #1033](https://github.com/Boym323/AirRadar/pull/1033), main `17c1afc7`. Pure Airport, METAR and aircraft-observed-weather GeoJSON builder functions moved out of `components/airradar-app.tsx`, with parity tests. PR CI, CodeQL and synthetic scaling green. | Functional refactor, not an asserted runtime speedup. Confirm final deploy identity from exact main CI before marking production DONE. |

## Candidates with real consumers — do not delete based on their names

| Candidate | Current code-backed evidence | Decision | Next safe verification |
| --- | --- | --- | --- |
| ATC Shadow Prediction | `lib/server/aircraft-state.ts` maintains bounded per-ICAO queues and calls `lib/server/atc-prediction-validation.ts`; public read-only `/api/atc/validation` consumes the prospective evidence. `isAtcShadowPredictionEnabled()` follows ATC resolution by default unless configured explicitly. | **KEEP / OPTIMIZE AFTER MEASUREMENT**, not dead code. | Compare enabled/disabled matched synthetic replay; measure CPU/event, allocations, event-loop P99, queue depth, and impact on validation quality. Verify effective production configuration through authorized sanitized means. Do not disable ATC sector assignment. |
| Operational Digital Twin outcome and truth validators | Local snapshot invokes five independently timed outcome/truth observers; separate report and calibration consumers exist. A bounded automatic situation sample is scheduled at most once per minute. | **KEEP; PROFILE**. | Capture exclusive per-observer time (nested `measureRuntime` values overlap), allocations and semantic parity. Merge loops only if equivalent and faster on fixed workloads. Preserve quality gates and calibration history. |
| FlightPosition Persistence Shadow | `lib/server/flight-position-persistence-shadow.ts` is explicitly opt-in through `FLIGHT_POSITION_SHADOW_ENABLED=true` and normally short-circuits. System diagnostics surface its bounded estimate; canonical history writer is separate. | **KEEP DISABLED BY DEFAULT** until the write-policy experiment is resolved. | Measure enabled state and read actual diagnostics, then consider retirement with explicit consumer/contract test. Do not alter stored positions or sampling policy based on an estimate alone. |
| ADSBHub / ADSB.lol raw / HTTP fallback | `lib/server/network-failover-provider.ts` coordinates independent sources, freshness and resilience. Overlapping ICAO identity does not prove redundant positions or failover. | **KEEP**. | Read per-lane freshness, exclusive MLAT/position yield, outage evidence, network bytes and processing cost from sanitized diagnostics, then A/B in isolated replay. No production provider flag or licensing change now. |
| Tracked audit artifacts and migration snapshots | 169 artifact files (~4,980,487 raw B) and 48 migration-snapshot files (~6,319,116 raw B) remain. They are historical evidence/schema history, not proof of runtime work. | **KEEP HISTORY**. | Set archival/retention policy before deleting any evidence; do not delete migrations or licenses for repo-size gains. |

## Remaining maintainability work

- `components/airradar-app.tsx` is still large after the safe first extraction. Separate pure map conversions or independent hooks one bounded module at a time, with unchanged 2D source structure, SSE, styling and browser validation.
- `lib/server/aircraft-state.ts`, `lib/server/system-status.ts` and `components/system-status-page.tsx` remain complex; target tested module boundaries, not indiscriminate rewrites.
- CPU, RAM, DB and network savings for these remaining candidates are **NOT_MEASURED**. No new T58 has been performed in this round. Do not confuse a synthetic benchmark pass with proven production savings.
- Do not introduce a second poller/process, manual release, config/secrets change, destructive DB operation or delete public diagnostics without proof and corresponding regression coverage.

## Acceptance gate for further work

Fresh upstream and production SHA → non-serving checkout → concrete consumer graph → fixed A/B workloads (same build/environment; representative sizes, 0/10/100% changes, SSE 0/10/50 as relevant) → p50/p95/p99 + CPU/allocations/RSS/GC → positive and negative safety tests → lint/typecheck/full CI/CodeQL/browser gates → one non-force single-writer merge/push → exact-SHA automated deployment checks. If not reproducible or safe, **NO_CHANGE** is preferable to speculative deletion.
