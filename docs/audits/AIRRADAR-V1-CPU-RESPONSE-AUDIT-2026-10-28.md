# AirRadar V1 CPU and response audit — 2026-10-28

Status: complete. Scope is V1 only; V2 is excluded. This report records
measurements, not hypotheses.

## Executive decision

**No production-code change is justified by the evidence.**
The existing aircraft-merge change is not re-adopted: its isolated benchmark
is not a whole-process production proof, and the task context records unstable
results across A/B scenarios.

## Baseline and safety

- Served release: `v1.0.561`, commit `7b69ed2f`, build `2026-10-28T08:59:49Z`.
- Production process started at `2026-10-28T09:03:50Z`; the initial public
  read-only check observed 67 local aircraft and 1,207 network aircraft.
- Native acceleration was active: Rust parser and Rust CRC.
- Initial runtime sample: CPU 17.79% of one logical core, RSS 702.0 MiB,
  heap used 385.0 MiB, event-loop P50/P95/P99 20.087/21.185/42.795 ms.
- GC at the initial sample: 6,003 events, 11,667 ms cumulative pause,
  3.375 ms average pause, 11.909 ms maximum pause.
- Local receiver/readsb was healthy; source status was live and fresh.
- No production restart, build, forced GC, inspector, synthetic traffic,
  ingest toggle, database write, or configuration change was performed.

The initial sample is a point-in-time health check, not the 30-minute
production result. The 30-minute/steady-state evidence is collected through
the existing T57/T58 read-only diagnostics.

## Production measurement

Run: [T58 read-only production soak #40665798048](https://github.com/Boym323/AirRadar/actions/runs/40665798048).

The workflow was dispatched from `main` and passed the production identity
preflight. All seven sequential read-only chunks completed with 60-second
samples. It did not attach a profiler or open a live SSE workload. The final
workflow step hit a resume-handoff parsing bug; the journal was downloaded from
[artifact 12809865747](https://github.com/Boym323/AirRadar/actions/runs/40665798048/artifacts/12809865747)
and analyzed locally. The bug is fixed in this commit for the next run.

The collected public T58 evidence is **INSUFFICIENT_EVIDENCE**:

| Metric | Result |
| --- | ---: |
| Samples / missing | 61 / 0 |
| Scheduled duration | 3,600 s |
| Stable process/build | no; 18 identity segments |
| Stable analyzed segment | 781.5 s |
| CPU P50 / P95 | 15.537% / 17.264% of one logical core |
| Event-loop p99 P50 / P95 / max | 38.633 / 42.009 / 42.009 ms |
| Event-loop max P50 / P95 / max | 608.174 / 629.146 / 629.146 ms |
| RSS P50 / P95 / max | 722.563 / 742.227 / 742.227 MiB |
| Heap used P50 / P95 / max | 326.187 / 398.665 / 398.665 MiB |
| SSE clients, aircraft population, hot paths | NOT MEASURED in public mode |

The workflow ran public-only because the authenticated admin token was not
available. Retention, major-GC/old-space, SQL wait, exact aircraft load, SSE
fanout and per-operation CPU/wait paths are therefore not measured. The
process identity changed 18 times, so no single-process CPU or A/B claim is
valid. Post-soak health remained good: v1.0.561, Rust parser/CRC active,
readsb and database healthy, 77–78 local aircraft.

The report must contain, for one stable process/build where available:

| Area | Evidence | Interpretation boundary |
| --- | --- | --- |
| CPU | process CPU P50/P95, interval CPU, per-operation CPU ms | async CPU is inclusive and overlapping; not an exclusive profiler |
| Event loop | one-minute p95/p99/max windows | compare only within the same observation interval |
| GC/allocations | GC count/pause, heap/RSS and bounded retention | GC counters are process-local; no leak claim from RSS alone |
| Ingest | local BEAST, network snapshot, decode counters | network wait is not CPU |
| State/trails | calls, aircraft count, CPU/wall attribution | preserve identity/order and trail bounds |
| History/DB | wall, CPU, wait and error counters | high wall with low CPU indicates wait/I/O |
| SSE | serialization/fanout and client counters | no synthetic clients were added |

## Isolated reproducible profile

Environment: Node `v22.23.3`, Linux x64, commit `7b69ed2f`; deterministic
fixtures, no receiver/network/PostgreSQL/SSE I/O. Command:

```sh
npm run prisma:generate
npm run benchmark:runtime
```

Snapshot-apply P50/P95 wall time:

| Aircraft | P50 | P95 |
| ---: | ---: | ---: |
| 50 | 0.875 ms | 1.221 ms |
| 250 | 2.570 ms | 5.279 ms |
| 1,000 | 5.341 ms | 7.200 ms |
| 5,000 | 27.145 ms | 49.255 ms |

At 5,000 aircraft, the recorded synthetic path was `snapshot.local.ingest`
(P50 25.167 ms), while `snapshot.trail-update` was approximately 0.002 ms per
recorded call. This identifies a scaling signal, not a production hotspot
claim.

Source-merge union CPU was approximately linear: 0.548/3.104/27.462 ms per
pass at 50/1,000/5,000 aircraft for unchanged identities. The 5,000-aircraft
fully-changed case was 29.059 ms per pass. These are isolated timings and do
not justify changing merge semantics.

SSE delta encoding for 20 clients and one changed aircraft measured 0.55/4.18/
31.18 ms at 50/1,000/5,000 aircraft. Snapshot cache fanout stayed bounded.

BEAST fallback-buffer benchmark (TypeScript only, 20,000 valid synthetic
frames) measured 13.521 ms P50 for 4 KiB chunks and 18.692 ms for one full
buffer. Production uses Rust, so this is not used as a production CPU claim.
Rust N-API comparison was unavailable in this checkout; Rust unit tests
passed 7/7 and production telemetry confirms the Rust backend is active.

## Validation and compatibility

- Relevant V1 tests: 108 passed across aircraft merge/state, SSE delta, BEAST
  parser and decoder.
- Rust native tests: 7 passed.
- Typecheck: passed.
- Lint: passed with 4 pre-existing warnings, 0 errors.
- Feature registry check: passed.
- Czech documentation check: passed before this report was added.
- No candidate implementation was made, so no parity or A/B candidate claim
  is made and no deployment/merge was performed.

## Limitations

- T58 is observational production traffic, not a controlled replay.
- Public diagnostics hide authenticated hot-path details; final hot-path CPU
  shares depend on the sanitized T58 artifact.
- The local isolated profile omits database, network, TLS, proxy, natural SSE
  clients and actual BEAST traffic mix.
- A percentage speedup is not reported without matched baseline/candidate
  whole-process data at 50/250/1,000/5,000 aircraft and changed-data ratios.

## Final verdict

**PASS_WITH_LIMITATIONS.** The safe measurement and documentation path
completed, but T58 did not provide stable authenticated hot-path evidence.
No production code, configuration, schema, deployment or restart was made;
therefore no optimization benefit is claimed. A real optimization would
require an admin-mode T58 run on one stable process/build, a candidate,
matched A/B proof, CI/CodeQL review, deployment and post-deploy soak.

Related evidence: [T5.7 event-loop diagnostics](../T5.7-EVENT-LOOP-DIAGNOSTICS.md),
[T58 production soak protocol](../T58-PRODUCTION-SOAK.md), and the existing
[V1 performance audit](PRODUCTION-PERFORMANCE-AUDIT-V1.md).

[Czech version](../../docs/cs/audits/AIRRADAR-V1-CPU-RESPONSE-AUDIT-2026-10-28.md)
