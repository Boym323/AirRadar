# Radar production performance baseline

Generated: 2026-10-11T10:35:45.963Z

Timing metrics are observational only. CI pass/fail is based on deterministic structural/instrumentation budgets so hosted-runner load does not create flaky failures.

| Aircraft | HTML markers | WebGL aircraft | Mounted rows | Animation avg/p95/max | Frame p95 | Writes/s | HTML collision avg/p95/max | Long tasks | Heap | DOM nodes | Status |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 1600 | 0 | 1600 | 14 | 0.79 / 1.7 / 6.4 ms | 240.7 ms | 8295.41 | 0.02 / 0.1 / 0.2 ms | 476 | 44.83 MiB | 1245 | PASS |
| 3000 | 0 | 3000 | 14 | 1.39 / 3.5 / 12.9 ms | 274.8 ms | 13602.61 | 0.02 / 0.1 / 0.1 ms | 415 | 65.61 MiB | 1245 | PASS |
| 5000 | 0 | 5000 | 14 | 2.53 / 7.1 / 14.1 ms | 354.8 ms | 18662.62 | 0.01 / 0.1 / 0.1 ms | 351 | 97.61 MiB | 1245 | PASS |

Deterministic budgets:
- Bulk synthetic aircraft must render through WebGL with zero HTML aircraft markers/handles.
- Traffic-list total rows must equal the scenario count and virtualization must stay enabled.
- Mounted traffic rows must stay at or below the checked-in structural budget.
- Animation and collision diagnostics must record live work; active jobs may not exceed aircraft count.

## Soak footprint

| Aircraft | Heap growth | DOM nodes | Event listeners | Server RSS growth |
| ---: | ---: | ---: | ---: | ---: |
| 1600 | 18.41 MiB | 0 | -44 | -32.31 MiB |
| 3000 | 30.21 MiB | 0 | -19 | 4.2 MiB |
| 5000 | 52.1 MiB | 0 | -11 | -0.46 MiB |

## SSE reconnect churn

- Rounds: 4
- Clients per round: 20
- Status: PASS


