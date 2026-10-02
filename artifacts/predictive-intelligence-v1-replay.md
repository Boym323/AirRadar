# AirRadar Predictive Intelligence V1 — Replay and Safety Evidence

## Verified

- Replay and live evaluation use the same canonical engine.
- Replay filters samples to `observedAt <= evaluation time` before each evaluation.
- Future-sample mutation independence is covered by `tests/predictive-intelligence.test.ts`.
- Two replay executions over the same ordered input are deterministic because the engine is pure over its input and uses no provider/database/filesystem access.
- The targeted predictive suite passed: 5 tests.

## Not yet evidenced

The repository has no exported historical corpus with destination metadata, weather, Airport Operations, landing time, and landing runway snapshots. Consequently the required multi-source future-mutation matrix, live/replay parity over production samples, restart, Time Machine, hold, go-around, and stale-context corpus gates remain open.
