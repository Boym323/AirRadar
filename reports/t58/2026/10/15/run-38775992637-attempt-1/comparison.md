# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.464 / 8cad3141 (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38775992637

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 20.0 | -52.0 % |
| Process CPU P95 (%) | 59.3 | 30.7 | -48.1 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 57.9 | -85.4 % |
| Worst event-loop delay (ms) | 5662.3 | 5154.8 | -9.0 % |
| Event Outcome CPU per call (ms) | 522.4 | 20.7 | -96.0 % |
| RSS P50 (MiB) | 939.4 | 910.9 | -3.0 % |
| ATC truth-cache hits (%) | 36.5 | 49.4 | +35.3 % |
| Observed aircraft P50 | 78.0 | 58.0 | -25.6 % |
| Pending predictions P50 | 15.0 | 17.0 | +13.3 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
