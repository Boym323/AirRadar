# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.483 / f19d457b (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38957219007

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 18.9 | -54.8 % |
| Process CPU P95 (%) | 59.3 | 29.6 | -50.1 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 54.1 | -86.4 % |
| Worst event-loop delay (ms) | 5662.3 | 4991.2 | -11.9 % |
| Event Outcome CPU per call (ms) | 522.4 | 19.7 | -96.2 % |
| RSS P50 (MiB) | 939.4 | 865.0 | -7.9 % |
| ATC truth-cache hits (%) | 36.5 | 68.2 | +86.8 % |
| Observed aircraft P50 | 78.0 | 51.0 | -34.6 % |
| Pending predictions P50 | 15.0 | 13.0 | -13.3 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
