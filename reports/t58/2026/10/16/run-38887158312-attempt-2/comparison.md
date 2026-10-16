# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.481 / 208bf3e7 (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38887158312

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 24.8 | -40.5 % |
| Process CPU P95 (%) | 59.3 | 39.2 | -33.8 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 38.3 | -90.3 % |
| Worst event-loop delay (ms) | 5662.3 | 740.8 | -86.9 % |
| Event Outcome CPU per call (ms) | 522.4 | 0.0 | -100.0 % |
| RSS P50 (MiB) | 939.4 | 893.2 | -4.9 % |
| ATC truth-cache hits (%) | 36.5 | N/A | N/A |
| Observed aircraft P50 | 78.0 | 82.0 | +5.1 % |
| Pending predictions P50 | 15.0 | 0.0 | -100.0 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
