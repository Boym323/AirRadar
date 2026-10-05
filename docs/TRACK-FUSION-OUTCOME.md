# Track Fusion Outcome Validation V1

Track Fusion Outcome Validation V1 measures whether the shadow fused state
actually predicts the next observed LOCAL receiver position better than the
existing canonical state.

It is separate from Track Fusion Readiness V1. Readiness measures internal
quality and consistency of the fusion engine. Outcome Validation measures
prospective net benefit against later receiver truth.

## Prospective contract

When Track Fusion Shadow produces a freshly evaluated eligible track, the
validator captures two independent baseline states:

- the current canonical local/network merge;
- the current fused shadow state.

Both baselines must have an observed position plus usable groundspeed and track.
Estimated/LOW-confidence fused position, speed or track is excluded.

For each baseline the validator creates three pending prospective samples:

- +5 seconds;
- +15 seconds;
- +30 seconds.

No result is known at capture time.

When a later LOCAL receiver observation becomes available at or just after the
target time, that observation is used as truth. The canonical and fused
baseline states are propagated independently to the truth timestamp using the
same deterministic constant-velocity geometry. Position error is measured in
NM. When both sides also have altitude state, altitude error is recorded in ft.

The validator therefore compares like with like: the same future LOCAL truth,
the same evaluation timestamp and the same propagation model.

## Winner semantics

A sample is:

- `FUSED` when fused position error beats canonical by more than 0.05 NM;
- `CANONICAL` when canonical beats fused by more than 0.05 NM;
- `TIE` inside that tolerance.

The report exposes:

- FUSED / CANONICAL / TIE counts;
- mean position error for each lane;
- mean fused improvement in NM;
- decisive-sample net win margin;
- optional mean altitude errors;
- separate 5/15/30-second slices;
- steady LOCAL, steady NETWORK and both handover directions.

Source changes bypass the ordinary ten-second baseline throttle so a handover
cannot disappear merely because another validation baseline was created just
before it.

## Truth requirements

Truth is intentionally strict:

- only a later LOCAL receiver aircraft row is accepted;
- the row must still have a usable geographic position;
- its position observation timestamp must be at or after the requested horizon;
- it must arrive within a five-second grace window.

Missing later LOCAL truth expires the pending sample. Expiry is measured in the
same rolling window as successful outcomes so a provider topology with poor
truth availability cannot produce a misleading PASS.

## Bounded runtime

V1 is process-local and RAM-only:

- baseline interval: 10 seconds per aircraft, except source handovers;
- maximum pending samples: 6,000;
- pending retention: 45 seconds;
- outcome window: 24 hours;
- aggregate buckets: 5 minutes.

The validator has no timer. It runs only after the existing Track Fusion Shadow
evaluation path and receives only the tracks that were actually re-evaluated by
that pass. It does not perform a second all-aircraft fusion loop.

It performs no Prisma/database access, history scan, `FlightPosition` read,
upstream request or persistence write.

## Net-benefit decision

The independent outcome decision is `PASS`, `WAIT` or `FAIL`.

Evidence completeness requires:

- at least 120 minutes of process-local evidence;
- at least 600 completed outcomes;
- at least 150 outcomes for each 5/15/30-second horizon;
- at least 30 handover outcomes.

After evidence is complete, PASS requires:

- net fused win margin of at least 5% on decisive outcomes;
- fused overall mean position error no worse than canonical;
- fused handover mean position error no more than 5% worse than canonical;
- missing/expired LOCAL truth rate no higher than 35%.

These thresholds are intentionally conservative and versioned. Outcome PASS
does not automatically promote Track Fusion into public radar or canonical
state. It is evidence for a later graduation decision only.

## Admin surfaces

Authenticated no-store API:

`GET /api/admin/track-fusion/outcome`

The same summary is exposed on `/system` alongside Track Fusion Shadow and
Readiness diagnostics.

## Critical invariants

- Outcome validation never mutates canonical aircraft state.
- Outcome validation never writes fused or projected state to local receiver
  history/statistics.
- Future LOCAL truth is read from current RAM only and is not persisted by this
  feature.
- A validation result cannot alter source affinity or Track Fusion arbitration.
- No result may be labelled ground truth before the future observation actually
  arrives.
