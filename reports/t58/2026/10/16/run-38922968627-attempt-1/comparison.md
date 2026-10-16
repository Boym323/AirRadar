# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.482 / a19febff (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/38922968627

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 20.6 | -50.8 % |
| Process CPU P95 (%) | 59.3 | 37.1 | -37.4 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 65.9 | -83.4 % |
| Worst event-loop delay (ms) | 5662.3 | 4672.5 | -17.5 % |
| Event Outcome CPU per call (ms) | 522.4 | 20.0 | -96.2 % |
| RSS P50 (MiB) | 939.4 | 993.5 | +5.7 % |
| ATC truth-cache hits (%) | 36.5 | 64.0 | +75.3 % |
| Observed aircraft P50 | 78.0 | 59.0 | -24.4 % |
| Pending predictions P50 | 15.0 | 18.0 | +20.0 % |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.
