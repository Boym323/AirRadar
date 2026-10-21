# Selected feature ID and external contract audit — 2026-10-21

This is a **source/CI audit**, not a production migration or a claim that all 90 individual features are fully gone. Based on PR #1096 HEAD `a8b693bcd75d2fc0d254e10f5acc6eef4d52a259`. The machine-readable [audit manifest](SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json) lists **every one of the 90 REMOVE IDs** and one grouped set of retired endpoints and protected dependencies per family.

## Scope and evidence

- 90 REMOVE IDs, 88 KEEP IDs: no overlapping selections. Only **8 IDs** have explicit item-level descriptions directly established by reduction notes; **82 IDs** currently have **family-level evidence only**, because the original name/path inventory for every ID is not in the checked-in records. Never interpret grouped evidence as a completed per-ID call graph.
- PR diff: 601 files changed; 476 deletions, including **50 API routes**, **21 page entrypoints**, and **174 test files**. Those are GitHub file-change counts, not a count of deleted product features.
- The last successful pre-audit CI, CodeQL and synthetic load runs are captured in the JSON manifest. Both the deleted-route list and current protected endpoint list are checked by `tests/selected-feature-matrix-audit.test.ts`.
- The canonical production LOC comes from `scanCodebase()` in `scripts/code-metrics.mjs`, which counts nonempty tracked source lines and excludes tests/docs/migrations/public assets. The audit test prints `AIRRADAR_AUDIT_CANONICAL_LOC` in CI. A removed-lines PR delta is **not** the production LOC measurement.

## Review by feature family

| Removed IDs | Count | Source outcome | Dependencies / confidence |
| --- | ---: | --- | --- |
| J10 | 1 | Synthetic production fallback retired | Keep isolated test-only receiver fixtures and real readsb/Beast |
| R13 | 1 | Receiver map marker/rings retired | Keep receiver coverage/status; selected map assertions |
| H01–H13 excluding H03/H07 | 11 | Standalone history/Time Machine/Flight Story surfaces retired | FlightPosition/history and H07/H14 preserved; group evidence |
| A03–A12 | 10 | Airport operations/analytics surfaces removed | Actual airport catalog/traffic/weather remain; group evidence |
| T01–T07, T11–T12 | 9 | ATC deep analytics/procedures/planned overlay retired | Published geometry and ATS data remain; **T12 still polls** |
| W05, W10–W14 | 6 | Modeled/fused/avoidance/route analytics UI and APIs removed | METAR/SIGMET/observed weather remain; group evidence |
| P01–P15 | 15 | Prediction and Flight Intelligence endpoints/producer retired | Historical rows/schema and diagnostics placeholder retained |
| D01–D23 | 23 | Digital Twin runtime, API, UI removed | Navigation Integrity and historical data preserved |
| L01–L10, L13–L15 | 13 | AlertEngine/rule/Fleet/Watchlist UI and APIs removed | **Keep L11/L12 Web Push/Pushover and occurrence history** |
| E08 | 1 | Live H1/FPN overlay/API retired | E07 RXW metadata/messages remain |

## Verified canonical source size

GitHub Actions [release CI run 39564699980](https://github.com/Boym323/AirRadar/actions/runs/39564699980) logged the canonical `scanCodebase()` result on the PR test checkout: **91,775 nonempty production lines across 548 tracked source files** (test code: 29,462 lines in 335 files). This is **8,225 lines below the 100,000 target**. The PR was tested with 1,880 Vitest tests passing, 15 skipped; CI including browser/release validation, CodeQL and synthetic 1x/2x/4x load are all green. The result is a source-code measurement only, *not* a production-host performance or release deployment measurement.

## Unresolved findings

**P1 — T12 network work remains:** `MapContextArchiveService.poll()` still executes `pollAup()`, calling `getAirspaceActivity()` and archiving new AUP/UUP data in `lib/server/map-context.ts:409–428`. The public planned-overlay API is removed, but a read-only historical map-context representation and the live archive writer remain. Do not delete archived data; investigate whether new AUP collection is necessary and, if not, retire only that new collection safely.

**P1 — stale architecture guide:** `docs/ARCHITECTURE.md` still describes deleted Flight Story, Predictive, Digital Twin, AlertEngine and mock receiver fallback as active. Bring English and Czech architecture guides in line with the generated feature registry and actual providers.

**P1 — external compatibility unverified:** all 50 deleted API paths will cease serving their previous contracts once deployed. There is no gateway/access-log audit or external client inventory in this review. Inventory API users before rollout; never restore retired endpoints just to make obsolete tests pass.

**P1 — live deployment/performance unverified:** no authenticated production diagnostics, receiver traffic replay on deployment or same-workload T58 before/after comparison could be read in this audit. CI's 1x/2x/4x synthetic benchmarks do not substitute for live A/B telemetry.

**P2 — harmless remnants needing targeted review:** disabled `AlertStatus` / `reloadAlertConfig()` contracts, an empty `predictiveEvaluatedAt` diagnostics map, and unselected `mockWatchlist`/`mockNotifications` visual fixtures in `scripts/production-gates.mjs`. Remove only after reviewing their actual consumers.

## Completion gate

Record an original ID-to-name-to-code-path inventory for the 82 group-level entries, resolve T12's active polling policy, inspect affected external API clients and measure canonical production LOC plus live T58 metrics. Until then **the selected-feature cleanup is not fully signed off**, despite passing source CI. No migration, saved data, main branch or production state is modified by this audit.


## Follow-up implementation — 21 October 2026

T12 planned AUP/UUP polling was disconnected from the periodic map-context service, while historical AUP JSON reads, the archive format and time-resolution DTO remain. The old isolated Czech AIM network implementation is not scheduled and must not be confused with active data ingestion. Browser fixtures for removed Watchlist and Notifications pages were pruned. An unused predictive diagnostic Map allocation was removed, preserving the response field with the fixed value 0. EN/CZ architecture was rewritten. External-client usage for 50 retired HTTP routes is **not verified**, because production reverse-proxy logs were unavailable; the read-only aggregator `scripts/audit-retired-api-access.py` is supplied for authorized execution. The exact original names for 82 selected REMOVE IDs were not recovered; per-ID family evidence is not individual certification. The changes await CI for this follow-up commit.


## Restored original user REMOVE titles — 2026-10-21

All **90/90** original REMOVE names have now been recovered from the user's original 19 October 2026 selection. The missing-title backlog of 73 is **closed**. The complete original ID-to-title source mapping is in `docs/audits/SELECTED-FEATURE-ORIGINAL-REMOVE-NAMES-2026-10-21.json`. **Retirement verification remains distinct:** only 8 IDs have individual notes, 82 remain family-level evidence and are not validated as one-to-one removal of every implementation. Shared modules needed by selected KEEP functions must survive. This restoration does not grant merge/deploy approval.


## Complete verified feature descriptions

The user supplied all 178 exact titles on 2026-10-21. The canonical catalog is `docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json` (88 KEEP, 90 REMOVE). Two titles in the earlier reconstruction are corrected: P01 and L01. This closes name provenance for KEEP as well as REMOVE, but DOES NOT make the 82 group-only REMOVE source-code proofs individual.
