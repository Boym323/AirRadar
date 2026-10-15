# AirRadar: reduce redundant Operational Twin truth identities and SSE wire work

Date: 2026-10-15. Baseline: `main` at `08b009f79ad761315618513333349b6f3d3b9a90`.

## Scope and evidence

This is a **code and reproducible regression optimization**, not a production speedup claim.
The finalized T57 production baseline (`1.0.454 / ca25f52b`) observed 842
`twin.eventOutcome.local` invocations with 439,837.391 attributed CPU ms,
event-loop worst stall 5,662.310 ms and median 15 pending event outcomes.
It predates merged #885, so those values cannot be assumed to represent the
current optimized code. The first T58 run, GitHub Actions #38728523860,
stopped at preflight (`t58_operational_twin_forensics_disabled`). No new
post-#885 performance measurement has completed.

## 1. Truth-point identity reuse

`OperationalTwinEventOutcomeValidator.getTruthState()` already parses each
changed trajectory once and shares the truth points across pending events,
but the incremental spatial matching loop still rebuilt a multi-field string
fingerprint for **every point of every pending static event**.

Store the point identity vector together with its existing canonical
`TruthTrailState`. Each newly built version computes its points' identities
once, reuses them to detect corrections and uses them for per-pending
deduplication. On unchanged source trail or equal canonical input,
the identical vector is reused. All correction, expiry, timestamp-cursor and
event-evaluation rules remain unchanged. The lifetime of the extra vector is
bounded by the already-bounded truth-state map.

Computationally, for `P` pending static outcomes sharing `T` truth points,
point fingerprint formatting changes from approximately `P*T` to `T`
per changed truth version. The pending **matching work itself remains O(P*T)**,
so this is not a claim that the entire validator becomes O(T).
The production win depends on live pending distribution and churn.

## 2. Shared SSE wire frames

The service already shares public snapshot identities and V2 changed-array
identities between subscribers. Previous framing still performed
`JSON.stringify` and `TextEncoder.encode` independently per client.

`encodeAircraftSseFrame()` caches UTF-8 framed bytes by the trusted public
snapshot identity for legacy V1 and V2 initial frames, or by the shared V2
changed-array identity for a delta. A separate key includes the V2 event
type and **per-client sequence number**. Only identical transitions at
identical sequence numbers share bytes. Clients with dropped/coalesced
snapshots retain independent delta state and cannot receive each other's
sequence. Cache entries are weakly keyed and capped at eight encoded variants
per identity; no extra timers, I/O, routes, or DB calls.

The cache requires snapshot payload immutability for the lifetime of
a generation. The existing public-snapshot/delta caches have the same
contract. Framed buffers are used read-only after encoding.

## Validation requirements

- `npm run test:targeted -- tests/operational-twin-event-outcome.test.ts tests/sse-delta.test.ts tests/t56d-sse-fanout-benchmark.test.ts`
- `npm run typecheck`, `npm run lint`, full Vitest and production gates.
- `JITI_TSCONFIG_PATHS=true jiti scripts/t56d-sse-fanout-benchmark.ts` on a
  non-production host; synthetic 100/1000/5000 aircraft, 0/1/5/20 clients,
  2%/15% changed, paired legacy versus shared-wire, byte/effect parity.
  CPU/wall numbers are **report-only**; no unmeasured speedup promised.
- `npm run benchmark:twin-t57` using the existing matched 78-aircraft T57
  fixture, then a bounded stress matrix on an isolated host if warranted.
- After CI/CodeQL pass, first collect a stable one-hour post-#885 production
  T58 on the exact deployed code identity using the existing controlled
  forensics enablement procedure; do not change production settings in this PR.
  Re-run the same soak after any future deployment of this PR to attribute
  new outcomes accurately.

## Out of scope

- ATC dataset async preparation PR #878 (must be independently rebased/tested).
- PostgreSQL schema, retention, polling, expiry semantics, SSE wire format,
  authentication, production config, restarts, release, migration and deployment.
- No quantitative production improvement is claimed until reproducible
  matched release/prod evidence exists.
