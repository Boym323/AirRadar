# AirRadar V1 → Rust: R-01 ATC geometry pilot

Status: **safe to merge as an opt-in, inactive pilot**. Production remains
unchanged until explicit runtime approval. No change to V1 aircraft source,
DB, ingest or external APIs; V2 remains isolated.

## Scope
- The existing optional N-API addon adds `atcRingContains` for packed f64 rings.
- `matchAtcRing` optionally replaces the ATC ring predicate while retaining
  bounding boxes, altitude checks, validity, context and public response shape.
- No new source of truth, history writes, additional BEAST sockets or ingest.
- Rust/TypeScript parity tests include seeded 5,000 points and boundary cases.
- Older native addons without the new symbol transparently use the JS reference.
- Activation requires **both** `AIRRADAR_NATIVE_BEAST=1` and
  `AIRRADAR_NATIVE_ATC=1`, plus a valid absolute addon path. Default remains OFF.
- The independently optional JS latitude index (#1114) is preserved in V1;
  it is not activated by this Rust pilot and has its own enablement flag.

## Gates
1. Rust unit, native parity, TypeScript, ATC integration, CodeQL and release
   checks must pass before merging the inactive code.
2. **Before activation**, run identical local replay and measure CPU, p95/p99
   event-loop latency, maximum T58 stalls, RSS, and rollback from ON to OFF.
3. Keep V1 state ownership and archive/maintenance policy; do not activate
   both ATC accelerators together before dedicated combined A/B validation.
4. Any eventual migration of aircraft state/SSE into V2 requires a separate
   review, read-only shadow comparison and controlled cutover.

Passing tests does not prove a production CPU or memory reduction.
