# T5.3 Production Performance Results

**Result: PASS WITH LIMITATIONS**

Observation date: 2026-10-09, Europe/Prague. The collection was read-only:
no deployment, restart, migration, configuration change, or production data
write was performed. Authentication used the existing local production
configuration; no token or session cookie is recorded here.

## 1. Production verification

| Item | Result |
|---|---|
| Production version | `1.0.389` |
| Production SHA | `2e34f7e5` |
| Checkout HEAD | `2e34f7e5fc749dabc7370bed8d989d1b62b34326` |
| `/api/health` | HTTP 200; database and source OK |
| Aircraft ingest | OK; `local-beast+json-failover`, 53 aircraft at initial check and 45 at final check |
| `airradar.service` | active; PID `22666` remained stable |
| T5.3 sampler | present and executed successfully |

The checkout is one commit behind `origin/main`, but production and the
sampler target were verified against the deployed SHA rather than assuming
the checkout branch was current. No release was requested or run.

## 2. Measurement window and validity

The authorized sampler ran with `T53_SECONDS=900` and
`T53_INTERVAL_SECONDS=30`.

- Sampler start: `2026-10-09T18:48:31.305Z`
- Last sample: `2026-10-09T19:04:37.944Z`
- Sampler completion: `2026-10-09T19:04:39.365Z`
- Sample span: 966.639 s (16.111 min)
- Valid samples: 31
- Invalid/unavailable samples: 0
- Stable process/commit/diagnostic store: yes

The elapsed wall time is longer than the nominal 900 seconds because the
sampler performs three authenticated requests per iteration and includes the
initial sample. Rates below use the actual sample span unless explicitly
marked otherwise.

## 3. Navigation Integrity write efficiency

### Application-attributed lane

| Metric | First → last / delta | Rate over sample span |
|---|---:|---:|
| `navigation.observation.create` attempts | 2,281 | 141.58/min |
| successes | 2,281 | 141.58/min |
| failures | 0 | 0/min |
| failure ratio | 0 / 2,281 | 0.00% |
| failure families | all zero | none observed |
| `observationsCreated` | +3,855 | 239.28/min |
| `persisted` | +2,285 | 141.83/min |
| `avoidedUpserts` | +4 | 0.25/min |
| confirmed memo keys | 881 → 1,024 (bounded maximum) | — |
| in-flight memo entries | 0 at both endpoints; maximum observed 1 | — |

The sampler's `dbAttempts` delta is 2,281 while the diagnostics `persisted`
delta is 2,285. This four-operation discrepancy is retained as an
instrumentation/accounting limitation; it is not treated as additional
successful ORM work. For the ORM-saving calculation, the directly attributed
lane counters are used:

```text
avoided ORM operations / (executed ORM operations + avoided operations)
= 4 / (2,281 + 4)
= 0.1751%
```

The wider in-memory diagnostics also reported a `deduplicated` increase of
1,570 (`observationsCreated` +3,855 versus `persisted` +2,285). That is not
equivalent to avoided ORM calls; only the process-local write-memo counter is
used for the ORM-saving percentage.

### Comparison with T4.9

T4.9 recorded 4,716 attempts and 1,208 failures in 932 seconds (15.533 min):
303.61 attempts/min, 77.77 failures/min, and 25.61% failures.

T5.3 recorded 2,281 attempts and zero failures in 966.639 seconds:
141.58 attempts/min, zero failures/min, and 0.00% failures.

Therefore the current result is a strong functional improvement in the
observed process window, but it is not a paired A/B result. The workload rate
was about 53.4% lower than T4.9, and the process/version/runtime conditions
were not statistically matched. The zero failure result must not be
extrapolated to all traffic solely from this window.

## 4. PostgreSQL and WAL

These are database-wide read-only statistics and include other AirRadar
lanes/processes. They are not attributed entirely to Navigation Integrity.

| Statistic | Baseline | Final | Delta |
|---|---:|---:|---:|
| `xact_commit` | 12,528,144 | 12,535,780 | +7,636 |
| `xact_rollback` | 788,837 | 790,785 | +1,948 |
| `pg_stat_wal.wal_bytes` | 86,048,331,340 | 86,111,220,589 | +62,889,249 (~62.9 MB) |
| `navigationIntegrityObservation.n_tup_ins` | 1,846,608 | 1,848,914 | +2,306 |
| `navigationIntegrityObservation.n_tup_upd` | 21 | 21 | +0 |
| `navigationIntegrityObservation.n_tup_del` | 0 | 0 | +0 |
| live rows, navigation observations | 1,612,247 | 1,614,553 | +2,306 |
| dead rows, navigation observations | 34,241 | 34,241 | +0 |
| `flightPosition.n_tup_ins` | 6,746,167 | 6,748,309 | +2,142 |

The navigation table's +2,306 insert counter is close to the application
`persisted` delta (+2,285), but the 21-operation difference and the global
scope mean it is not a proof that every insert came from this sampler window.
There were no observed navigation-table updates, which is consistent with the
process-local memo avoiding repeated successful self-upserts in this window.
However, the absolute WAL delta is global; the data does not support claiming
that 62.9 MB was caused by Navigation Integrity.

The production results therefore support a bounded reduction in duplicate ORM
attempts, but do not prove a proportional WAL reduction. The ORM remains on
the rc.9 compatibility path where duplicate conflict handling can still
materialize a database update outside the memo's confirmed-key lifetime.

## 5. Node.js runtime and Health API

### Process/runtime observations

Authenticated runtime samples reported:

- RSS: 957 MB minimum to 1.708 GB maximum; final sampler sample 1.628 GB.
- Used heap: 558 MB minimum to 1.424 GB maximum; final sampler sample 732 MB.
- Memo `inFlight`: 0 at both endpoints, maximum 1.
- Event-loop lag percentile field: unavailable (`null`) in the sampler route.
- Instrumented `health.event-loop` phase: final p95 0.502 ms, max 34.332 ms.
- Final systemd process sample: ~1.623 GB RSS; service remained active.
- Final cgroup memory peak: ~1.758 GB.

RSS and heap moved down and up during the window rather than increasing
monotonically. This is compatible with allocation/GC churn and retained
working state; it does not prove a memory leak. GC pause counters and a
low-overhead allocation/retainer profile were not available, so no memory
optimization was implemented.

Point CPU samples were high, approximately 40–59.7% of one CPU during the
window. This establishes a follow-up measurement target, not a root cause.

### Health phase metrics

At the end of the authenticated sampler window:

| Phase | Calls | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| `health.total` | 105 | 0.93 ms | 6.72 ms | 253.91 ms |
| `health.database` | 105 | 0.75 ms | 3.25 ms | 125.45 ms |
| `health.atc` | 105 | 0.07 ms | 0.11 ms | 175.52 ms |
| `health.event-loop` | 105 | 0.32 ms | 0.50 ms | 34.33 ms |

The initial cold samples contained the maxima; warm p95 values were low. The
health path did not show a sustained long-response regression in this window.

### Internal versus public HTTPS TTFB

A separate 20-request read-only benchmark returned HTTP 200 for all requests:

| Endpoint | Valid | p50 TTFB | p95 TTFB |
|---|---:|---:|---:|
| Internal `http://192.168.1.142:3000/api/health` | 20/20 | 3.30 ms | 4.84 ms |
| Public `https://airradar.pomykal.cz/api/health` | 20/20 | 18.72 ms | 22.10 ms |

The approximately 15 ms difference is consistent with reverse-proxy/TLS and
network overhead. It does not indicate a backend health bottleneck.

## 6. Regressions and remaining problems

No functional regression was observed:

- service stayed active;
- database and receiver health stayed OK;
- aircraft ingestion continued;
- all 31 authenticated diagnostic samples were valid;
- navigation write failures were zero;
- targeted regression tests passed (14/14).

The material remaining performance signals are:

1. high and oscillating Node RSS/heap, without sufficient evidence to identify
   a retaining structure or call it a leak;
2. sustained high point CPU usage, without CPU attribution or a profile;
3. low measured memo savings (0.1751%) under this workload;
4. unavailable event-loop percentile/GC counters in the sampler projection;
5. a small discrepancy between application `persisted` and attributed DB
   attempt deltas that should be clarified before using the counters for
   automated accounting.

No speculative optimization was applied. In particular, no ORM upgrade,
migration, retry policy, or production database change was justified by this
window.

## 7. Recommended next optimizations (maximum three)

1. **Add targeted runtime attribution (high value, low production risk).**
   Expose bounded CPU sampling, event-loop delay percentiles, GC pause totals,
   and heap/retainer-sized summaries in the existing authenticated runtime
   diagnostics. This is required before changing live-state, trail, or cache
   structures.

2. **Reconcile navigation counters (high value, low risk).**
   Add a test and bounded diagnostic field that explicitly separates
   observation enqueue, memo-avoided calls, actual ORM attempts, successful
   operations, and table-level inserts. This would explain the +4
   `persisted`/attempt mismatch without changing persistence semantics.

3. **Repeat a paired navigation/WAL window under comparable traffic (medium
   value, low risk).** Compare the same process-local lane counters with
   `pg_stat_all_tables` and `pg_stat_wal` over at least two matched windows.
   Only if duplicate self-updates are then shown to be material should a
   native `ON CONFLICT DO NOTHING`/ORM capability change be considered.

## 8. PR/release status

No new branch, PR, deployment, restart, migration, or production fix was
created. Existing targeted tests passed:

```text
npm run test:targeted -- tests/t53-navigation-production-sampler.test.mjs \
  tests/navigation-integrity-persistence.test.ts
2 test files passed; 14 tests passed.
```

## Final decision

**PASS WITH LIMITATIONS** — production functionality and zero observed
navigation-write failures were confirmed, but the expected performance benefit
of the process-local memo is small in this workload, WAL attribution is
necessarily global, CPU/RSS causes are not proven, and the sampler's event-loop
lag projection is incomplete.
