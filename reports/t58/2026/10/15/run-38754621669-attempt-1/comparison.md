# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.462 / e8282c48 (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38754621669

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 25.8 | -38.2 % |
| Process CPU P95 (%) | 59.3 | 51.9 | -12.4 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 79.9 | -79.9 % |
| Worst event-loop delay (ms) | 5662.3 | 5431.6 | -4.1 % |
| Event Outcome CPU per call (ms) | 522.4 | 26.8 | -94.9 % |
| RSS P50 (MiB) | 939.4 | 1122.2 | +19.4 % |
| ATC truth-cache hits (%) | 36.5 | 62.9 | +72.3 % |
| Observed aircraft P50 | 78.0 | 71.0 | -9.0 % |
| Pending predictions P50 | 15.0 | 19.0 | +26.7 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
