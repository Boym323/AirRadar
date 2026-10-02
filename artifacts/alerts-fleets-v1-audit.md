# Alerts & Fleets V1 audit

Date: 2026-10-02

## Result

PASS. Corrective release `v1.0.243` was deployed through
`deploy/release.sh` at runtime commit `6c2b06493c0afbc494be247e56caa333e95d63d3`.

## Historical data policy

Production has 8 historical `FLIGHT_EVENT` `AlertOccurrence` rows with
`flightEventId = NULL`. They predate the corrective invariant. Their canonical
relations cannot be reconstructed safely, so they were preserved unchanged.
No backfill, deletion, source-key rewrite, or heuristic relation was done.
They render with neutral fallback context and no fabricated flight link.

## Corrective invariant

New events resolve the persisted numeric `FlightEvent.id` by deterministic
`eventKey` before the occurrence path. The repository rejects missing IDs and
verifies the referenced event inside the transaction. Regression coverage is
in `tests/alert-engine-canonical-id.test.ts`.

## Production evidence

- Natural post-fix events: FlightEvents `6533` and `6556`, both
  `CRUISE_ENTER`, both linked correctly.
- Duplicate occurrence keys: `0`; duplicate delivery keys: `0`.
- Post-release `FLIGHT_EVENT` rows with NULL `flightEventId`: `0`.
- Temporary IN_APP canary rule was removed; Pushover remains not configured.

Process ownership, delivery locking/retry architecture, squawk/geofence
semantics, Pushover isolation, and Flight Intelligence ownership were not
changed.
