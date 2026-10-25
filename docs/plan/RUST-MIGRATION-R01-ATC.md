# AirRadar V1 → Rust: R-01 ATC geometry pilot

Status: **PR proposal; not merged or deployed**. No modifications to V1
production or DB. V2's separate Rust engine remains isolated.

## Scope
- Existing optional N-API addon gains `atcRingContains` (f64 packed ring).
- The most frequently exercised V1 ATC context ring predicate can opt into Rust
  through `matchAtcRing`, preserving bounding-box checks, altitude, validity,
  context shape and all existing public APIs.
- No second source of aircraft truth, no V2 writes, no ingest duplication.
- Rust's different compiler/runtime semantics are checked by a seeded
  TypeScript/Rust parity suite (5k points plus boundary fixtures).
- Optional addon compatibility: old builds without the symbol use the JS
  reference. Defaults unchanged. `AIRRADAR_NATIVE_ATC=1` also requires the
  existing `AIRRADAR_NATIVE_BEAST=1` loader and an absolute addon path.

## Gates
1. Rust unit tests, TS typecheck and ATC regressions and native CI PASS.
2. Under identical local replay, compare ATC CPU, p95/p99 event-loop lag,
   T58 stalls and RSS between OFF and ON. Reject if regression.
3. Keep V1 archive/maintenance policy until explicitly reversed; never merge
   from this draft without separate approval, and audit GitHub main auto-deploy.
4. Later: evaluate moving state owner and SSE to the V2 Rust engine through a
   separately reviewed process boundary and shadow no-write comparison.

No performance improvement is claimed from implementation alone.
