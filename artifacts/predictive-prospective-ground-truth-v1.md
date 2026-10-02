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

## Corrective release gate — 2026-10-02

- Candidate: `d4249629a360c4ccfe70fc2a129f7b9efaa49122`; resolved release
  version `1.0.250`; package version remains `1.0.0`.
- ICAO and active lifecycle identity are required before delayed ground
  confirmation. A single observation selects at most the newest compatible
  pending event.
- Confirmation requires both the existing 5 km event-point bound and a 5 km
  airport bound from the already-loaded airport index; unknown airport geometry
  fails closed.
- Terminal evidence is measured with UTF-8 `Buffer.byteLength`; oldest
  optional track observations are reduced first, and oversized required
  evidence is not persisted.
- Destination history is timestamp-validated, chronologically ordered, adjacent
  semantic states are collapsed, same-time conflicts are rejected, and as-of
  lookup selects the maximum timestamp at or before the query time.
- Isolated validation: `npm ci` passed; full suite passed with 201 files, 1,415
  tests passed, 10 skipped, and zero worker errors. Typecheck, lint, feature,
  localization, visual, migration, production build, and desktop/mobile browser
  gates passed. Lint retained seven existing warnings.
- Disposable PostgreSQL: **BLOCKED**. No local PostgreSQL binaries or safe
  container runtime are available; production PostgreSQL was not used.
- Production deployment and canary: not performed because the mandatory real
  PostgreSQL gate is unresolved.
