# AirRadar optional Rust BEAST accelerator

This prototype replaces the hot binary BEAST framing loop and Mode-S CRC
(BigInt bit operations) with synchronous Rust functions called via N-API.
The aircraft state, CPR/altitude/status interpretation, ingestion cadence,
persisted schema and network provider contracts stay in TypeScript.

**Opt-in only.** Default AirRadar builds and deployments need no Cargo, native
artifact, environment changes or extra runtime dependency.

Build on Linux with `cargo build --release --manifest-path native/airradar-native/Cargo.toml`.
Copy `native/airradar-native/target/release/libairradar_native.so` to an absolute
path ending in `.node`; use `libairradar_native.dylib` on macOS.
Set `AIRRADAR_NATIVE_BEAST=1` and `AIRRADAR_NATIVE_ADDON_PATH=/absolute/path/airradar_native.node`
for the opted-in process. Never use a binary built for another OS/architecture.

The addon is loaded once, validates exported symbols, and falls back to
TypeScript when missing. A whole chunk returns one compact packed Buffer (one N-API return, zero-copy
Buffer.subarray views in TypeScript), not an N-API object per frame.
Both frame batches and CRC cross the native boundary;
there are no per-byte N-API calls. All mutable decoder/aircraft state remains
owned by Node. The Rust parser retains at most `maxBufferedBytes` of an
incomplete frame between chunk calls. Rust output is copied into owned Node
Buffers so its lifetime cannot escape the call incorrectly.

Run `cargo test --lib --manifest-path native/airradar-native/Cargo.toml`
and the dedicated PR GitHub Action. The latter builds the addon and runs
10,000 seeded CRC parity cases plus 4,000 generated BEAST frames fragmented
into random chunks and the original decoder/parser regressions.

No CPU/RSS/event-loop improvement is claimed without **matched before/after**
measurement of the entire ingest path. The TypeScript path is the baseline;
measure decode CPU, N-API overhead, frame allocations, GC, and whole-process
RSS at the same data rate. Reject the native path if tail latency, correctness,
build portability or memory regress.

Operational Twin truth matching and history persistence are intentionally
NOT ported by this prototype. They require a different batched API and validated
modern baselines; copying each aircraft or event into Rust could be slower.
This is not a complete replacement of the BEAST aircraft decoder.

Run `npm run benchmark:rust-beast` with the same opt-in environment to print
a report-only, alternating-order synthetic comparison of 25,000 BEAST frames
per trial over six trials. This microbenchmark does not measure real feed
throughput, end-to-end decode, native conversion allocation or RSS retention.

The native parser and CRC can be independently disabled after enabling the
addon: set `AIRRADAR_NATIVE_BEAST_PARSER=0` or
`AIRRADAR_NATIVE_BEAST_CRC=0`. This supports independent production-like
A/B attribution without changing feed contracts.

Run `npm run benchmark:rust-crc` under the same opt-in environment to compare
10,000 deterministic Mode-S CRC messages using the BigInt and N-API paths.

After an abnormally large input chunk, the parser also shrinks retained Vec
capacity when it exceeds twice the configured buffer limit (with a 64 KiB
floor); ordinary small socket chunks remain allocation-reuse friendly.

## Phase 2: inline CRC in the Rust frame parser

When the optional Rust parser is enabled, `pushPackedWithCrc` can compute the
Mode-S CRC while de-escaping a socket chunk. The packed result adds a four-byte
big-endian checksum per frame. A private TypeScript `WeakMap` associates the
precomputed value with its exact parsed frame; arbitrary external `BeastFrame`
objects **cannot** inject a checksum. Direct callers still use the existing
standalone native CRC/TypeScript fallback, and the aircraft/CPR/Comm-B state
machine is unchanged.

Inline CRC is **disabled by default**, even with native framing enabled:
the synthetic stateful-decoder benchmark did not show an improvement over
standalone native CRC. Set `AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED=1` to opt in
to this experiment. Set it to `0` to force it off. The original
`AIRRADAR_NATIVE_BEAST_CRC=0` switch disables both forms. The addon ABI check
requires `pushPackedWithCrc`; old/incompatible native modules fall back to
TypeScript rather than being partially loaded.

The dedicated CI includes a fragmented-stream/CRC regression and a three-way
end-to-end-ish 10,000-frame synthetic comparison of the existing JS framing,
Rust framing with per-message CRC, and Rust framing with inline batched CRC.
No database, production stream, SSE, Operational Twin or provider orchestration
is changed. This phase does not touch PR #926's bounded enrichment scheduler.

### Exact CRC implementation and benchmark boundaries

The `crc24` engine now uses a compile-time 256-entry Mode-S polynomial
lookup table. The checksum is exactly equivalent to the previous bitwise
remainder **including DF4/5/20/21 ICAO address-parity syndromes**; a Rust
unit test compares 30,000 generated 7/14-byte messages to the independent
u128 long-division implementation.

`benchmark-rust-beast.ts` deliberately disables inline CRC to compare
parser-only costs. `benchmark-beast-ingest.ts` includes three separate
parser+stateful-decoder modes for a fairer end-to-end-ish comparison.

On a GitHub Actions Linux synthetic 10,000-frame replay, parser+decoder
medians were TS framing/native CRC 30.63 ms, Rust framing/native CRC
28.03 ms, Rust framing+inline CRC 28.73 ms. Inline CRC remained about
2.5% slower than the separate native CRC and is deliberately not a default.
No live ingest, memory trend, or event-loop P99 change is claimed.

## R-01: opt-in Rust ATC geometry (AirRadar V1)

The existing addon now exposes `atcRingContains` for the hot-path single-ring
ATC containment predicate in `lib/atc-context/engine.ts`. It matches the
reference `ringContains` algorithm, including boundary tolerance; vertical
limits, ATC dataset versioning, validity and public assignment formats remain
in TypeScript. The addon is **not** a full Rust ADS-B state owner.

Enable **only after native parity CI passes**, on an isolated DEV environment:

```dotenv
AIRRADAR_NATIVE_BEAST=1
AIRRADAR_NATIVE_ATC=1
AIRRADAR_NATIVE_ADDON_PATH=/absolute/path/to/airradar_native.node
```

Default `AIRRADAR_NATIVE_ATC` is off. If the symbol is missing, inputs are
malformed/oversized, or native call fails, the JavaScript reference is used.
Frozen immutable prepared rings have a weakly cached packed representation;
mutable test inputs are never cached. No additional receiver connection or
PostgreSQL writes are introduced.

Tests: `cargo test --manifest-path native/airradar-native/Cargo.toml --lib`,
regular TypeScript geometry/ATC tests, and Rust native parity CI with
`tests/atc-native-parity.test.ts` plus `tests/atc-context-engine.test.ts`.
Before enabling in production, run matched real-world ATC matching CPU, Node
event-loop p95/p99, RSS and T58 benchmarks; N-API crossing or initial packing
may outweigh savings. Keep this flag OFF on regression.
