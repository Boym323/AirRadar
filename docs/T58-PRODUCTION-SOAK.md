# T58 — one-command read-only production soak with durable GitHub history

## Start

Once PR introducing this workflow has been merged into `main`, start it
from any machine with an authenticated GitHub CLI:

```sh
gh workflow run t58-production-soak.yml --repo Boym323/AirRadar --ref main
```

Or from this repository's checkout:

```sh
bash scripts/run-t58.sh
```

You can also use **Actions → T58 Production Soak → Run workflow → main**.

The controlled stall canary is separately available through **Actions → T58 Controlled Stall Canary → Run workflow**. Supply the exact 40-character SHA of the currently deployed release; this permits diagnostics against a deployed release even when `main` has only newer metadata commits.

No SSH session, local background process, production restart, build, database
write, environment toggle or synthetic aircraft traffic is involved. The
60-minute collection runs on an isolated GitHub-hosted runner and makes only
authenticated read-only HTTP requests to existing AirRadar endpoints.

## One-time prerequisites

- The remote AirRadar admin diagnostics must be reachable from GitHub-hosted
  runners over `https://airradar.pomykal.cz`. If firewall or VPN rules block
  access, the workflow fails safely at preflight; it cannot silently assume
  loopback access to a production host.
- Add repository Actions secret **`T58_WATCHLIST_ADMIN_TOKEN`** under
  Settings → Secrets and variables → Actions. T58 requires the authenticated
  administrator projection; public diagnostics are intentionally sanitized and
  cannot satisfy the soak's extended telemetry contract. Do **not** put the
  token into a script, shell command, commit, issue, workflow input, log, or
  report.
- The live `/api/system/status` must report a deployed commit that is an
  ancestor-compatible descendant of merged PR #885
  (`e9a9b8354fe1c433b4a3baf406574b9cc3d6f207`).
- Operational Twin phase forensics must **already** be enabled in the running
  service (`AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED=true`). It is
  opt-in and is **not enabled by this workflow**. The preflight fails closed
  if disabled. Any change to that flag must follow a separately authorized
  release procedure; do not restart the service just to satisfy this audit.

## Collection

The workflow reuses the current production sampler and analyzer:

```sh
T57_SECONDS=3600 T57_INTERVAL_SECONDS=60 T57_WARMUP_SECONDS=600 \
  T57_EXPECTED_COMMIT=<verified_live_commit> \
  node scripts/t57-production-soak.mjs
```

It first checks the authenticated diagnostic contract and forensics status,
then dynamically pins the commit returned by production telemetry. Changes in
process identity, diagnostics store or commit are reflected in separate
segments and cannot be reported as one stable interval. Every unavailable
sample is recorded and classified. A failed preflight never starts the soak.

## Where results live

- **Live progress:** [GitHub Actions workflow](https://github.com/Boym323/AirRadar/actions/workflows/t58-production-soak.yml).
- **Run artifacts:** sanitized `soak.summary.json`, `soak.summary.md` and
  `comparison.md`, retained in the run's downloadable artifact for 90 days.
- **Permanent history:** branch
  [`audit/t58-history`](https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58)
  (auto-created on first completed report). Each attempt has its own dated
  directory and a row in `reports/t58/INDEX.md`.
  Branch pushes intentionally do **not** touch `main` or start a production
  deployment.
- **No raw journal** is committed or placed in permanent history. A private,
  short-retention checkpoint artifact is used only for automatic chunk handoff;
  runner scratch files are discarded after the job.

Collection is automatically divided into seven sequential GitHub jobs. Each
job collects at most 540 seconds (about eight minutes) and has a nine-minute
timeout, staying below the repository's observed 10-minute hosted-job limit.
Each job hands off a private NDJSON checkpoint through a short-retention
Actions artifact. The final job validates and uploads only the sanitized
aggregate report; no manual resume is required. The logical 3,600-second
schedule is preserved across handoffs, while handoff delays are recorded as
unavailable intervals and never silently converted to zeros.

The collection jobs have read-only GitHub permissions and hold the optional
watchlist secret. The separate `archive` job has Git write permission but
**never receives the watchlist secret**. If repository policies prohibit
GitHub Actions from creating the archive branch, the sanitized artifact
remains available and the archive job fails visibly. An administrator may
need to enable GitHub Actions `Read and write permissions` for the archive
job.

The runtime report distinguishes cgroup CPU throttle telemetry as
`available`, `controller_disabled`, or `unavailable`. Missing values are not
reported as zero. On the current production system the systemd service has
memory accounting but the cgroup v2 CPU controller is not enabled, so
throttling cannot be ruled in or out without a separate systemd configuration
change.

## Baseline, verdict and interpretation

`comparison.md` compares the new report to the user-provided T57 baseline
(`ca25f52b` / `1.0.454`, 61/61 valid, one stable hour):

| Metric | T57 |
| --- | ---: |
| CPU P50 / P95 | 41.782% / 59.258% |
| Event-loop p99 P95 of windows | 396.624 ms |
| Worst single event-loop stall | 5,662.310 ms |
| `twin.eventOutcome.local` | 439,837.391 attributed CPU ms / 842 calls |
| RSS P50 | 939.445 MiB |
| ATC truth cache hit rate | 36.5% |
| Local aircraft P50 | 78 |
| Pending predictions P50 | 15 |

This is **observational before/after**, not a controlled workload replay.
Pending distribution, aircraft count, cache warming and unrelated load can
change. `PASS_WITH_LIMITATIONS` is a collection/evidence verdict, not a
proof of a speedup or the elimination of 5.66-second stalls.

No schedules or continuous monitoring are added by this feature.
