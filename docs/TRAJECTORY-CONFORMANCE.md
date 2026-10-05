# Trajectory Conformance V1

Trajectory Conformance V1 classifies how the observed selected aircraft is
moving relative to the reconstructed filed-route corridor. It is an inferred
product layer over Route Intelligence V2 and Route Corridor Intelligence V1,
not a new route authority.

## Runtime boundary

The feature runs only for the selected aircraft in the existing radar client.
It consumes the already-built route and corridor snapshots and retains one
bounded in-memory tracker. It adds:

- no EventSource;
- no polling timer;
- no upstream provider;
- no database table or write;
- no Flight Intelligence event persistence.

The tracker resets when the selected aircraft or filed route identity changes.

## States

- `ROUTE_UNKNOWN`: no filed/reconstructed route exists.
- `ROUTE_UNCERTAIN`: route coverage or dynamic matching is insufficient.
- `ON_ROUTE`: the Route Corridor state is stably on route.
- `OFFSET`: a non-persistent route offset is visible.
- `DEVIATING`: Route Corridor has already confirmed persistent cross-track
  deviation.
- `REJOINING`: an aircraft previously in `DEVIATING` has returned to the
  corridor, but recovery confirmation is still pending.
- `PROBABLE_DIRECT`: a later route element has been reacquired after a
  meaningful forward skip with enough prior deviation/offset evidence.

## Rejoin confirmation

Trajectory Conformance does not convert one on-route sample after a deviation
directly to `ON_ROUTE`. Recovery requires two distinct on-route observations
spanning at least five seconds. A renewed deviation cancels recovery.

## Probable direct inference

A forward element jump alone is never enough.

After confirmed `DEVIATING`, a candidate requires:

- reacquisition on an `ON_ROUTE` corridor state;
- at least two skipped resolved en-route elements;
- at least 10 NM of fully resolved skipped route geometry.

From a mere `OFFSET` state, the candidate requires at least three skipped
resolved en-route elements and 20 NM.

Only `PUBLISHED_ATS`, `FILED_DCT` and `FILED_ROUTE` en-route/connector
elements count toward the skip. SID/STAR procedure legs do not. Missing skipped
geometry fails closed instead of guessing distance.

A confirmed probable direct is held for 30 seconds while the aircraft remains
on-route so the transition is visible in the product UI. The inference includes
the previous element, reacquired element, skipped element IDs, resolved skipped
distance, confidence and the most useful available rejoin label.

## Coverage and confidence

Reconstruction coverage below 50 percent or unavailable dynamic-route precision
produces `ROUTE_UNCERTAIN`. The classifier does not make a route-conformance
claim through a geometry gap.

Confidence is derived from reconstruction coverage, Route Corridor confidence
and the evidence supporting a probable direct. A probable direct following a
confirmed deviation can reach HIGH confidence only with at least three skipped
elements and at least 80 percent reconstruction coverage. Offset-origin
probable directs remain MEDIUM.

## Shadow diagnostics

The selected-aircraft tracker keeps non-persistent counters for observations,
deviation transitions, rejoin candidates/confirmations, direct candidates,
probable directs, rejected jump candidates and route-uncertain observations.
These counters are intentionally not written to Flight Intelligence or
PostgreSQL in V1.

## Safety boundary

Trajectory Conformance is informational receiver-derived intelligence.
`PROBABLE_DIRECT` is not evidence of an ATC clearance or controller
instruction. `DEVIATING` is not a certified navigation alert, separation
warning or safety determination.
