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
