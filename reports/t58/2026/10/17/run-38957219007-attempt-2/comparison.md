# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.494 / c7d57580 (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38957219007

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 38.6 | -7.5 % |
| Process CPU P95 (%) | 59.3 | 62.2 | +4.9 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 62.8 | -84.2 % |
| Worst event-loop delay (ms) | 5662.3 | 6446.6 | +13.9 % |
| Event Outcome CPU per call (ms) | 522.4 | 27.3 | -94.8 % |
| RSS P50 (MiB) | 939.4 | 968.1 | +3.1 % |
| ATC truth-cache hits (%) | 36.5 | 61.0 | +67.1 % |
| Observed aircraft P50 | 78.0 | 54.0 | -30.8 % |
| Pending predictions P50 | 15.0 | 10.0 | -33.3 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
