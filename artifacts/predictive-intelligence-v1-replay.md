# AirRadar Predictive Intelligence V1 — Replay and Safety Evidence

## Verified

- Replay and live evaluation use the same canonical engine.
- Replay filters samples to `observedAt <= evaluation time` before each evaluation.
- Future-sample mutation independence is covered by `tests/predictive-intelligence.test.ts` and the release-blocking generic mutation gate in `tests/predictive-intelligence-calibration.test.ts`.
- Historical destination context can be supplied through `destinationAt(at)`; final-row destination must not be used as an as-of predictor input.
- Frozen calibration split, checkpoint, baseline, and metric primitives are covered by `tests/predictive-intelligence-calibration.test.ts`.
- Two replay executions over the same ordered input are deterministic because the engine is pure over its input and uses no provider/database/filesystem access.
- The targeted predictive suite passed: 5 tests.

## Not yet evidenced

The repository has no configured read-only historical corpus with destination metadata, weather, Airport Operations, landing time, and landing runway snapshots. Consequently the required multi-source future-mutation matrix over production samples, live/replay parity over production samples, restart, Time Machine, hold, go-around, and stale-context corpus gates remain open.
# Predictive Intelligence V1 replay

Result: **PARTIAL**

- Read-only source: production PostgreSQL (`192.168.1.55`), transaction and statement safeguards enabled.
- Frozen corpus: 500 completed flights from 2026-10-02 00:00–13:30 UTC; 353 calibration / 147 holdout; overlap 0.
- Extraction: 18,614 ordered FlightPosition rows in bounded 100-flight pages.
- Canonical FlightEvents in the frozen corpus: 0. Source-wide events begin at 2026-10-02 07:01 UTC, all tagged `flight-intelligence-v1`.
- Canonical landing ground truth in the frozen corpus: 0; reliable runway ground truth: 0.

FlightPosition checkpoint filtering and the canonical replay engine ran successfully. Destination availability timestamps, historical airport operations, and flight-linked historical weather are not present in the source, so no look-ahead evidence is claimed for those dimensions beyond the bounded input contract. The 70/30 split is deterministic but the holdout was not used for tuning.

All capabilities remain SHADOW. No deployment, restart, public enablement, or prediction persistence occurred.
