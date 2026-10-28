# T58 — production soak vs T57

- Baseline: 1.0.454 / ca25f52b (61 valid samples).
- Measured: 1.0.563 / 3cbd777f (61 valid / 0 unavailable, 3602 s).
- Collection verdict: **PASS_WITH_LIMITATIONS**.
- Measurement mode: **public**.
- Action run: https://github.com/Boym323/AirRadar/actions/runs/40682255974

| Metric | T57 | T58 | Change |
| --- | ---: | ---: | ---: |
| Process CPU P50 (%) | 41.8 | 14.5 | -65.4 % |
| Process CPU P95 (%) | 59.3 | 17.7 | -70.2 % |
| Event-loop p99, P95 of windows (ms) | 396.6 | 38.7 | -90.2 % |
| Worst event-loop delay (ms) | 5662.3 | 672.1 | -88.1 % |
| Event Outcome CPU per call (ms) | 522.4 | N/A | N/A |
| RSS P50 (MiB) | 939.4 | 757.5 | -19.4 % |
| ATC truth-cache hits (%) | 36.5 | N/A | N/A |
| Observed aircraft P50 | 78.0 | N/A | N/A |
| Pending predictions P50 | 15.0 | N/A | N/A |

## Interpretation

Observational before/after, NOT a controlled same-workload benchmark.
Differences in traffic, pending outcomes, capture frequency, GC and clients
may dominate apparent speedups. Nested CPU attribution is approximate;
missing values are N/A rather than zero. The disappearance of historical
5.66 s stalls cannot be proven by a single clean one-hour sample.

## Evidence warnings

- PUBLIC ONLY: private Twin/SQL/GC/retention attribution and exact process identity were NOT MEASURED.
- Traffic mix comparability cannot be established.
