# AirRadar Predictive Intelligence V1 — Historical Calibration & Holdout Gate

## Result

`PARTIAL` — the calibration contract and leakage tests are implemented, but this checkout has no configured read-only historical database or checked-in corpus. No historical metric is claimed.

## Repository freeze

- Task-start HEAD/main/origin/main: `97cd55d434b7864fe5597023e48fa00caad82fc7`
- Working tree at task start: clean.
- Production version/SHA: not available from the checkout; no production query or deployment was performed.
- Canonical engine: `lib/predictive-intelligence/engine.ts`.
- Replay: `lib/predictive-intelligence/replay.ts`, calling the canonical engine.
- Live shadow: `AircraftStateService`, one evaluation per aircraft per 10 seconds.
- Runtime state: bounded 2,000-entry RAM store; no prediction DB/filesystem writes.
- Capability gates: ETA, RUNWAY, RUNWAY_CHANGE, and TRAJECTORY remain `SHADOW`.

## Implemented validation contract

- Calibration version: `predictive-intelligence-v1-calibration-1`.
- Corpus split: stable FNV-1a hash of `flightId + ':' + calibrationVersion`; `mod 10 < 7` is calibration and the remainder is holdout.
- Split overlap is rejected; checkpoint selection uses the latest prediction timestamp `<= T`.
- Simple ETA baseline is current ground speed with a bounded speed/distance guard and no V1 phase correction.
- ETA metrics include N, median, MAE, p90, and signed mean error in minutes.
- Replay accepts destination metadata resolved as-of each evaluation timestamp.
- Generic future-mutation invariant is release-blocking for data after T.

## Data-time contract and current limitations

`FlightPosition.recordedAt` is an observation event time and is eligible only when `recordedAt <= T`; its database availability time is not recorded, so ingestion lag must be treated as an unresolved limitation. `FlightEvent.occurredAt` is ground-truth/event time and must be filtered by occurrence time plus recorded availability when an export provides it. `Flight.destination` is not safe as historical predictor context unless an as-of timeline is available; final-row destination is ground-truth-only until then. Airport/runway metadata is static only when the evaluation policy explicitly freezes its version; Airport Operations is a derived on-demand read model, not a persisted historical table. METAR/aircraft-weather data must be selected by observation/availability time `<= T`. Arrival time and landing runway are ground-truth-only and never predictor inputs.

No production corpus discovery was possible: `DATABASE_URL` and `FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL` were unset. Therefore candidate flights, ground truth, weather, Airport Operations, route coverage, HOLD, GO_AROUND, acquisition, and receiver-loss counts are `NOT AVAILABLE`, not zero.

## Decisions

- ETA: `SHADOW`
- RUNWAY: `SHADOW`
- RUNWAY_CHANGE: `SHADOW`
- TRAJECTORY: `SHADOW`

The holdout gate is not passed. No tuning was performed against holdout data, and no production status was changed.
