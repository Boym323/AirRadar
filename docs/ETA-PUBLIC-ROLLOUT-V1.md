# ETA Public Rollout V1

ETA Public Rollout V1 turns the existing ETA readiness, graduation calibration and fail-closed effective policy into one explicit operational decision contract.

## States

- `SHADOW_COLLECTING` — ETA remains shadow-only because readiness or calibration is not yet eligible for manual review.
- `READY_FOR_PUBLIC_CONFIG` — readiness is `PASS` and graduation calibration is manually reviewable, but configured policy is still `SHADOW`. Nothing is public yet.
- `PUBLIC_ACTIVE` — configured policy is explicitly `PUBLIC`, effective policy remains `PUBLIC`, and readiness is still `PASS`.
- `PUBLIC_FAIL_CLOSED` — configured policy requests `PUBLIC`, but the runtime readiness guard has downgraded effective policy to `SHADOW` or readiness is no longer `PASS`.
- `DISABLED` — ETA capability is explicitly disabled.

## Safety invariant

The rollout decision never changes configuration and never promotes ETA automatically. `READY_FOR_PUBLIC_CONFIG` is only an operator signal. Public ETA remains controlled by the existing two-key contract: configured ETA policy must be `PUBLIC` and runtime readiness must be `PASS`. The existing ETA advisory additionally requires a fresh, non-expired prediction with calibrated uncertainty.

If readiness regresses after an operator configures `PUBLIC`, the effective policy remains fail-closed and the rollout state becomes `PUBLIC_FAIL_CLOSED`. No new persistence, stream, prediction input or database query is introduced.

## Operator sequence

1. Keep ETA configured as `SHADOW` while evidence is collected.
2. Review graduation calibration until ETA reports `READY` / `manualReviewEligible=true`.
3. Confirm rollout decision `READY_FOR_PUBLIC_CONFIG`.
4. Explicitly set `AIRRADAR_PREDICTIVE_ETA_STATUS=PUBLIC` through the normal deployment configuration path.
5. After deployment, require rollout state `PUBLIC_ACTIVE` and continue relying on the runtime readiness guard for automatic fail-closed fallback.

This contract is intentionally ETA-specific. Runway, runway-change and trajectory rollout should reuse the same pattern only after their own product/advisory layers and evidence are ready.
