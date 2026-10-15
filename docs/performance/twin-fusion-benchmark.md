# Operational Twin / Track Fusion — reproducible performance suite

The suite measures the **existing TypeScript** implementation. It does not
claim a Rust speed-up or rewrite aircraft, metadata enrichment, source
preference or database code. It deliberately does not modify PR #925 or #926.

## Run locally (no production access)

```bash
npm ci
npm run test:targeted -- tests/benchmark-twin-fusion.test.ts
npm run benchmark:twin-fusion
AIRRADAR_PERF_PROFILE=extended npm run benchmark:twin-fusion
```

Outputs: `.benchmarks/twin-fusion/report.json` and `summary.md` (gitignored).
The runner uses Node `--expose-gc` to report post-GC process memory. Values
are descriptive and do not automatically pass/fail on wall-time thresholds.

## Run on GitHub

Use **Actions → Operational Twin & Track Fusion benchmarks → Run workflow**.
Choose `smoke` or `extended`. PRs modifying the benchmark, Track Fusion or
Operational Twin also run a smoke profile automatically. After merging this
workflow to main, a weekly smoke run starts each Sunday at 03:35 UTC.
The job uses a GitHub-hosted runner, pinned Node 22, no database URL, no
production instance and no upstream API access. It has read-only permissions.

Each run uploads a uniquely named JSON/Markdown **Actions artifact** (up to
90 days, subject to repository retention policy). The summary is visible
directly in the workflow run. Compare the same profile across runs by
downloading the stored JSON artifacts and comparing commit SHAs; shared
runner noise, GC/JIT warm-up and workload changes are significant.
There is **no automatic historical threshold** and no false regression
failure due to noisy timing. The automatic PASS/FAIL concerns semantic
parity, limits and finite metrics, not speed promises.

## Operational Twin

Reuses `runT57Scenario()` from `scripts/benchmark-operational-twin-t57.ts`
rather than duplicating its algorithm. Each scenario compares incremental
truth evaluation and full-scan reference on **the same commit** with
deterministic timing and semantic equality. T57 includes pending event
populations, ATC sector checks, 120-point trails, periodic corrections and
bounded expiry; both arms use their own validator instances.

- Smoke: 78 aircraft, 20 pending, 3 s simulated refresh, 60 s simulated.
- Extended: 78/20 at 1 s; 250/1000 at 3 s; 250/3000 at 10 s,
  for 120 simulated seconds each.
- 2 smoke or 3 extended repetitions, with alternating comparator order.

## Track Fusion

Measures `TrackFusionShadow.observe()` exclusively, excluding fixture
construction time. The input maps and timestamps are synthetic and
deterministic; runs exercise partial dirty-key evaluations and an occasional
full pass, local/network overlap, source removal and recovery, handover
gating, de-duplication and cleanup. The 5-second simulated tick mirrors the
service's throttled evaluation (not network fetch intervals). Two or three
whole-sequence replays must produce exactly the same state and diagnostics;
SHA-256 of synthetic outputs is used to avoid publishing identities.

The runner exports p50/p95/p99/max latency, process CPU, event-loop
histogram, heap/RSS before/after and optionally post-GC, evaluation counts,
disagreements and transition counts. No live plane or provider data is read.

## Interpreting results

Treat a Rust port as a candidate only after (1) matching real-world workload
distribution and (2) comparing the same complete input with Rust, TS, plus
the cost of JS↔Rust transfer. In particular, historical pre-#895 T58
Operational Twin CPU is *not* a current production baseline. Neither
Track Fusion nor Twin can be judged by a single isolated microbenchmark.

Suggested promotion criteria (not yet proven): zero semantic differences;
at least 20% repeatable end-to-end CPU improvement on the selected hot path;
no significant event-loop P99 regression; no retained-RSS regression; and
Linux/macOS packaging + production-like independent soak passing.
