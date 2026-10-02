# Predictive Prospective Ground Truth V1

Result: **PARTIAL — IMPLEMENTED, NOT DEPLOYED**

This change adds sparse prospective instrumentation only. Predictive scoring,
confidence, public predictions, alerts, and all predictive capabilities remain
shadow-only.

## Landing evidence

- Version: `terminal-evidence-v1`.
- Initial evidence is stored in the existing `FlightEvent.metadataJson`.
- Detection preserves observed position, altitude variants, rates, speed,
  track, freshness, source, and origin.
- Recent track is capped at 16 observations and 90 seconds.
- A LANDING detected airborne creates one in-memory pending confirmation, capped
  at 256 entries with an 8-minute TTL. The first compatible on-ground sample
  can perform one idempotent metadata update.
- Existing landing phase transitions, thresholds, confidence weights, event
  keys, runway resolver, and event timing are unchanged.
- Canonical `LANDING.occurredAt` remains an event-detection time, not assumed
  touchdown time: the active detector can emit it with `onGround=true` or
  during the transition into `FINAL` while `onGround=false`.
- Provider runway evidence is copied separately and normalized; inferred and
  reported runway context remain distinct.

## Destination provenance

`Flight.destinationProvenanceJson` is an additive nullable field. Existing
flight snapshot transactions append only semantic destination changes, with a
maximum of eight revisions. Each record contains destination,
`observedAt`, source, and provider retrieval time. Old rows resolve to
UNKNOWN. `getDestinationAsOf` returns the latest observation at or before T.

## Write and hot-path budget

- Normal ADS-B positions: no new database query, transaction, filesystem write,
  or external call.
- LANDING: existing FlightEvent insert plus zero or one confirmation update.
- Destination: piggybacks the existing Flight write; no additional operation
  for repeated values.
- No FlightPosition widening and no backfill.

Schema migration: additive `Flight.destinationProvenanceJson`; no historical
backfill. Production deployment and natural-landing canary are pending.
