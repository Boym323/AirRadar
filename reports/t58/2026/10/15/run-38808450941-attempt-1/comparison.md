# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.469 / c5539b03 (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38808450941

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 25.9 | -37.9 % |
| Process CPU P95 (%) | 59.3 | 94.1 | +58.9 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 46.1 | -88.4 % |
| Worst event-loop delay (ms) | 5662.3 | 4492.1 | -20.7 % |
| Event Outcome CPU per call (ms) | 522.4 | 36.3 | -93.1 % |
| RSS P50 (MiB) | 939.4 | 877.9 | -6.5 % |
| ATC truth-cache hits (%) | 36.5 | 63.8 | +74.8 % |
| Observed aircraft P50 | 78.0 | 44.0 | -43.6 % |
| Pending predictions P50 | 15.0 | 21.0 | +40.0 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
