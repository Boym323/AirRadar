# T58 short CPU peak attribution: cgroup and GC

This diagnostic is **independent of T58**. It is a bounded read-only companion
for the unresolved 4.49-second event-loop stalls and 94% CPU P95 from the
production T58 version 1.0.469 (run #38808450941).

## Evidence gap from existing T58

The old 60-second T58 report shows `cgroup.cpuThrottledUsecDelta` had
**zero eligible correlated windows**, i.e. data **unavailable**, **not** zero
throttling. `gc.pause` vs 60-second max stall correlation was -0.176;
this does not confirm or disprove per-event causality.

It measured 35,928.668 ms of overlapping attributed synchronous CPU across
990 `twin.eventOutcome.local` calls. CPU and GC window totals are not
stack-trace CPU profiles.

## Run on GitHub (after merge to main)

**Actions → T58 CPU Spike Diagnosis → Run workflow → main**, duration
120 seconds or 600 seconds. Read-only HTTPS GETs every 5 seconds via
`/api/system/status` and `/api/system/runtime-performance`, with the
existing authenticated T58 session secret where necessary. Preflight
requires an administrative view, runtime health observation and deployed
commit/process ID continuity. Identity values are compared **in memory only**.

The script never restarts the process, changes runtime flags, queries database
directly, triggers a heap snapshot, invokes the Node inspector, or collects
aircraft/flight identifiers or coordinates. It writes only approved aggregate
numeric counters and public commit/version. On any failure, the workflow uploads the last **sanitized partial checkpoint**, not raw HTTP data. It never marks partial or insufficient evidence as PASS.

Per-interval analysis:

- Cumulative user+system CPU times converted into percent of a single CPU
  core (values can exceed 100% with multicore processing).
- cgroup v2 `nr_throttled` and `throttled_usec` deltas (and cgroup v1 `throttled_time` converted from nanoseconds) with counter coverage
  and CPU quota. These counters are for the *whole cgroup*, not solely Node.
  On hosts hiding cgroup counters, verdict remains **unavailable**, never zero.
- Cumulative V8 GC pause duration, GC/major counts, pause percentage of wall
  time, and a recent observed maximum pause. This is neither a stop-the-world
  timeline nor a full process scheduling profile.
- Existing allowlisted named hot-path CPU counter deltas. Nested time values
  overlap and MUST NOT be summed. Missing hot paths are unknown.
- Rolling event-loop P99 and traffic count for context. A 5-second sample
  cannot prove the cause of an individual event-loop stall.

The run uploads `summary.json` and `summary.md` for 30 days. No raw
HTTP response is persisted or attached.

## Limits and promotion

This is *targeted CPU hot-path attribution*, not a V8 CPU flamegraph. It
cannot identify arbitrary JavaScript functions missed by named runtime
metrics or demonstrate causality. A subsequent controlled local/host
CPU-profile with explicit authorization and a safe bounded process
attachment would be required to confirm specific JS stacks. Do not
enable the Node inspector on a public interface or restart production
just for profiling.

Smoke validation in PR:

```bash
node --test tests/t58-cpu-spikes.test.mjs
```
No merge, deploy, or production observation is performed by PR CI.

## Resilient collection and evidence quality

The first valid observation establishes an in-memory process identity. Later
samples are written atomically as an allowlisted JSON/Markdown checkpoint
after every observation. A single HTTP timeout/network error is counted and
the next scheduled sample is attempted; no CPU, GC, or cgroup deltas are
computed across missing polling slots. Repeated failures (three in a row),
missing initial telemetry, authentication errors or changing deployed process
identity stop the run. Those conditions become `PARTIAL` or
`INSUFFICIENT_EVIDENCE`, **never a successful GitHub Actions job**.
Counters and public version are stored; tokens, cookies, PID, diagnostic store
IDs and raw exception messages are not.

The GitHub upload and job summary run even if sampling exits nonzero,
retaining the final atomic checkpoint for up to 30 days.
Production sampling requires a **manual dispatch on main**. PR CI runs
only synthetic/unit tests and does not touch production.

The earlier #38851649335 failure was emitted only as
`t58_spike_collection_failed`; the old runner concealed its specific error,
so the exact original failure cannot be proven retrospectively. The new fixed
failure taxonomy distinguishes authentication, HTTP status, timeout, network,
telemetry schema, and process identity changes without exposing secrets.
