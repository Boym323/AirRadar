# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.457 / 08b009f7 (61 valid / 0 unavailable, 3603 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38730677694

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 31.6 | -24.3 % |
| Process CPU P95 (%) | 59.3 | 39.0 | -34.1 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 105.0 | -73.5 % |
| Worst event-loop delay (ms) | 5662.3 | 7398.8 | +30.7 % |
| Event Outcome CPU per call (ms) | 522.4 | 42.1 | -91.9 % |
| RSS P50 (MiB) | 939.4 | 1138.2 | +21.2 % |
| ATC truth-cache hits (%) | 36.5 | 63.6 | +74.2 % |
| Observed aircraft P50 | 78.0 | 69.0 | -11.5 % |
| Pending predictions P50 | 15.0 | 15.0 | +0.0 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
