# AirRadar cleanup round 3 — radar map sources (2026-10-18)

[Česky](../cs/agents/CLEANUP-ROUND3-2026-10-18.md)

> Dated task record; not a new global rule. Consult [AGENTS.md](../../AGENTS.md) and current main/production identity before reusing this evidence.

## Completed and automatically deployed

| Batch | Exact commit and release | Change | Checks |
| --- | --- | --- | --- |
| Hidden ATC fast path and map source isolation | [992f636e](https://github.com/Boym323/AirRadar/commit/992f636e761fec45836d9fb3b7b90f5aa16ead9a), [PR #1037](https://github.com/Boym323/AirRadar/pull/1037), [v1.0.527](https://github.com/Boym323/AirRadar/releases/tag/v1.0.527) | Extracted pure ATC/Navigation Integrity 2D GeoJSON builders to `lib/radar/airspace-geojson.ts`. When ATC layer is hidden, return the same empty FeatureCollection without indexing planned activity windows. | [PR CI](https://github.com/Boym323/AirRadar/actions/runs/39162247482), [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39162247544), [1×/2×/4× scaling](https://github.com/Boym323/AirRadar/actions/runs/39162247589), [main CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/39162525477). |
| Shared ATC sector metadata | [0eddfcf4](https://github.com/Boym323/AirRadar/commit/0eddfcf474c7cc33265b1a9df3073c9d4029ef05), [PR #1038](https://github.com/Boym323/AirRadar/pull/1038), [v1.0.528](https://github.com/Boym323/AirRadar/releases/tag/v1.0.528) | Validate polygons first, then format sector service, altitude bounds, primary/alternate frequencies, plan state and traffic lookup once per sector, not per polygon. Each polygon retains its own GeoJSON properties object and unchanged metadata. | [PR CI](https://github.com/Boym323/AirRadar/actions/runs/39162817936), [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39162817994), [1×/2×/4× scaling](https://github.com/Boym323/AirRadar/actions/runs/39162817927), [main CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/39163113649). |

The release process verified the exact deployed SHAs, local and public health checks and production artifacts. Neither change modified receiver ingest, canonical aircraft merges, ATC sector assignment, SSE, source failover, authentication, configuration, or the database.

## Proven, unproven and not measured

- **PROVEN:** Hidden ATC does not access even a throwing proxy activity object. The visible sector regression preserves valid polygons and fields. A multi-polygon test verifies one shared traffic lookup and one frequency-field read per sector.
- **PROVEN:** Full CI, CodeQL, synthetic load scaling and automatic release/health passed for each change.
- **ARTIFACT SIZE (NOT SPEED):** Production build ZIP v1.0.527 = 73,922,258 B; v1.0.528 = 73,923,249 B (+991 B).
- **NOT MEASURED:** Production CPU, RSS, GC, DB/network traffic, event-loop P95/P99 and map browser responsiveness before/after. No causality claim about runtime performance.

## Next evidence-driven candidates

1. **ATC Shadow Prediction:** `lib/server/aircraft-state.ts` and `lib/server/atc-prediction-validation.ts` have a live validation API consumer. Measure enabled/disabled matched replay, at different aircraft densities and source mixes, separately from canonical ATC assignment. KEEP until semantic parity and a repeatable gain are proven.
2. **Digital Twin outcome/truth observers:** Five independent local snapshot observers and scheduled calibration consume current local state. Measure exclusive per-lane CPU, allocation and tail effects; overlapping inclusive timing cannot be summed. KEEP until validated.
3. **FlightPosition Persistence Shadow:** Explicit opt-in experiment. Preserve historic data and the canonical writer; do not retire without reviewing diagnostics and the contract.
4. **ADSBHub / ADSB.lol provider lanes:** Preserve coverage and failover; compare unique aircraft positions/MLAT, freshness, network bytes and CPU on controlled replay before changing any lane.
5. **Further radar UI decomposition:** Small pure module extractions with no new poller, SSE client or MapLibre source ownership; require browser and screenshot parity.

Do not launch an unapproved production T58/forced GC, change production secrets, manually deploy or destroy historical DB data. Reconfirm upstream/production SHAs and use the single-writer, non-force, tested process.
