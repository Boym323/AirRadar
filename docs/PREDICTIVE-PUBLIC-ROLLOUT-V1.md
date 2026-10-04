# Predictive Public Rollout Completion V1

Predictive Public Rollout Completion V1 gives all four predictive capabilities
the same explicit, fail-closed transition from shadow evidence collection to
public presentation.

The capabilities are:

- `ETA`
- `RUNWAY`
- `RUNWAY_CHANGE`
- `TRAJECTORY`

## Shared decision model

The shared decision engine lives in
`lib/predictive-intelligence/public-rollout.ts`. Capability-specific wrappers
preserve stable versioned contracts:

- `eta-public-rollout-v1`
- `runway-public-rollout-v1`
- `runway-change-public-rollout-v1`
- `trajectory-public-rollout-v1`

Every capability resolves to exactly one rollout state:

- `SHADOW_COLLECTING`
- `READY_FOR_PUBLIC_CONFIG`
- `PUBLIC_ACTIVE`
- `PUBLIC_FAIL_CLOSED`
- `DISABLED`

A readiness `PASS` never changes configuration automatically. A capability in
`SHADOW` becomes `READY_FOR_PUBLIC_CONFIG` only when readiness is `PASS`
and graduation calibration marks it eligible for manual review. An operator
must still explicitly configure `PUBLIC`.

A configured `PUBLIC` capability is `PUBLIC_ACTIVE` only while its effective
policy remains `PUBLIC` and readiness remains `PASS`. If readiness regresses
to `WAIT` or `FAIL`, the existing effective-policy guard downgrades exposure
to `SHADOW` and the rollout state becomes `PUBLIC_FAIL_CLOSED`.

## Boundaries

The rollout engine is pure. It does not:

- mutate environment configuration,
- write to PostgreSQL,
- open a stream,
- perform a network request,
- enable a capability automatically.

Public advisory builders remain the enforcement point for fresh per-aircraft
serialization. The rollout decision is operator-facing state, not a second
public exposure path.

## Administration

The admin-only predictive readiness report now includes a `rollout` decision
for every capability. The `/system` predictive panel displays the version,
rollout state, whether public presentation is active, whether an explicit
configuration change is required, and bounded blocker reason codes.

This information remains behind the existing admin session check on
`GET /api/admin/predictive/readiness`.
