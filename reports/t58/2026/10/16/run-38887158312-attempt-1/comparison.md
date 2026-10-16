# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.477 / 47a1286d (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38887158312

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 19.6 | -53.2 % |
| Process CPU P95 (%) | 59.3 | 28.3 | -52.3 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 65.3 | -83.5 % |
| Worst event-loop delay (ms) | 5662.3 | 4936.7 | -12.8 % |
| Event Outcome CPU per call (ms) | 522.4 | 14.2 | -97.3 % |
| RSS P50 (MiB) | 939.4 | 1015.9 | +8.1 % |
| ATC truth-cache hits (%) | 36.5 | 56.7 | +55.3 % |
| Observed aircraft P50 | 78.0 | 79.0 | +1.3 % |
| Pending predictions P50 | 15.0 | 15.0 | +0.0 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
