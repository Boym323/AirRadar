# AirRadar Predictive Intelligence V1 — Audit

Status: PARTIAL (repository evidence complete; historical and production evidence unavailable in this checkout)

## Frozen implementation

- Start/local `main`/`origin/main`: `68d29e6d525fd1c4fd1bd8aeeb3ef07f453fa9be`
- Working tree at audit start: clean.
- Canonical engine: `lib/predictive-intelligence/engine.ts`.
- Replay calls the same engine as live shadow evaluation.
- Live evaluation is gated to one evaluation per aircraft per 10 seconds in `AircraftStateService`.
- Runtime state is bounded to 2,000 entries and is RAM-only.
- No Prisma, filesystem, or per-evaluation HTTP call exists in the predictive path.
- Model version is `predictive-intelligence-v1`.

## Release boundary

The read-only `/api/aircraft/:hex/prediction` route reads the last bounded runtime prediction and never recomputes it. All capabilities default to `SHADOW`; public exposure requires explicit status configuration and is independently gated for ETA, RUNWAY, RUNWAY_CHANGE, and TRAJECTORY.

## Blocked evidence

No checked-in historical corpus/export or production shadow window was available. Therefore no historical calibration, holdout metrics, baseline comparison, browser prediction fixtures, production CPU/RSS comparison, or production I/O measurement is claimed here. No release or production deployment was run.
