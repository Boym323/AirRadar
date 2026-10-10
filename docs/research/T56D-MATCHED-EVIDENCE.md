# AirRadar T5.6D — matched memory evidence and isolated SSE fanout

## Objective

T5.5 recorded high RSS and network trail-point growth, while T5.6A/B added
private V8 memory samples and trail-limit aggregates. Those readings do **not**
establish a memory leak, so T5.6D introduces two **read-only evaluation tools**
rather than speculative cache/retention changes.

## 1. Compare two completed T5.6 reports offline

Capture the baseline and candidate reports using the authorized sampler
described in [T5.6A (Czech)](../cs/research/T56-MEMORY-ATTRIBUTION.md).
Keep the output files private and on your own workstation/secure host.

```bash
node scripts/t56d-matched-evidence.mjs /secure/before.json /secure/after.json
```

The comparator recalculates report summaries; it never trusts a report's
embedded verdict. It rejects non-monotonic timestamps, missing or unstable
samples, any trail-limit breach, unchanged build SHA, differing warmup/window
duration, unmatched aircraft/trail totals, and different SSE client load.
Load-matching tolerance is 15% for the median aircraft and trail counts and
exact for median and peak SSE clients. Errors produce `INCOMPARABLE` and
exit code 2; malformed files return exit code 1.

A successful comparison returns `MATCHED_OBSERVATIONAL_ONLY`, not an
optimization PASS: RSS/heap and post-major-GC deltas alone cannot identify
retained objects or demonstrate causality. The output contains only aggregate
load and memory values — never PID, diagnostic store ID, per-aircraft IDs or
positions.

**Important:** Node version, runtime uptime, warm caches, traffic mix and
other resource consumers must also be checked manually. The comparison
cannot establish equivalent workloads solely from aggregate medians.

## 2. Run isolated SSE V2 fanout benchmark on DEV

```bash
JITI_TSCONFIG_PATHS=true jiti scripts/t56d-sse-fanout-benchmark.ts
```

The deterministic synthetic benchmark covers 100, 1,000 and 5,000 aircraft;
0, 1, 5 and 20 V2 clients; and sparse 2% and dense 15% changed-aircraft
frames. It exercises the actual `SseDeltaEncoder`, shared public fingerprint
cache, JSON framing and UTF-8 payload accounting. It samples CPU and wall
time over repeated steady-state runs. Output is JSON, timing is report-only,
and **no network connection, DB write, production feed or forced GC** is used.

This is a synthetic per-client encoder/serialization benchmark, not a
full proxy, `ReadableStream` backpressure, heartbeat or end-to-end production
SSE test. A real production SSE test requires separately controlled clients
and an authorized matched audit — never infer real fanout CPU from an
unrelated 0-client T5.5 production window.

## Validation and release policy

```bash
npm run test:targeted -- tests/t56d-matched-evidence.test.mjs tests/t56d-sse-fanout-benchmark.test.ts
npm run typecheck
npm run lint
```

Neither tool adjusts retention bounds, source authority, poll cadence, SSE
protocol, persisted history, authentication, or deployment. Merge/release
only after the standard repository gates; never build directly in the live
production checkout.

[Czech version](../cs/research/T56D-MATCHED-EVIDENCE.md).
