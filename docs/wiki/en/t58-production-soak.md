# T58 — read-only production performance soak

T58 is a **manually triggered, 60-minute** diagnostic run for AirRadar.
It was introduced in [PR #889](https://github.com/Boym323/AirRadar/pull/889)
after the Operational Twin optimization in
[PR #885](https://github.com/Boym323/AirRadar/pull/885).
The measurement observes existing production traffic; it does not deploy,
restart, change flags, generate traffic, or write to the database.

## Start with one command

From any machine with [GitHub CLI](https://cli.github.com/) installed and
authenticated for this repository:

```bash
gh workflow run t58-production-soak.yml --repo Boym323/AirRadar --ref main
```

Alternatively, from a current repository checkout:

```bash
bash scripts/run-t58.sh
```

Or select **Actions → T58 Production Soak → Run workflow → main**.
The run lasts one hour, polls every 60 seconds and uses a 10-minute
warmup. Only one T58 can run at a time; another request does not cancel
an ongoing run.

## Prerequisites and safety

- The [T58 workflow](../../../.github/workflows/t58-production-soak.yml)
  must already exist in `main`, and the GitHub-hosted runner must be able
  to reach `https://airradar.pomykal.cz` over HTTPS.
- The deployed commit must contain merged PR #885; the preflight validates
  the running version and pins its commit for the whole measurement.
- Operational Twin diagnostics must **already** be enabled with
  `AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED=true`. T58 will **not**
  enable this setting or restart production; it fails closed if unavailable.
- If administrative diagnostics require authentication, add the
  `T58_WATCHLIST_ADMIN_TOKEN` repository **Actions secret**. Never place
  the token in a command, issue, commit, workflow input, or report. If
  authentication is explicitly disabled, the secret is unnecessary.

## Measurement and baseline

The existing `scripts/t57-production-soak.mjs` collector and analyzer
read the same operational metrics as T57. The comparison uses the
finalized T57 baseline `1.0.454 / ca25f52b`:

| Metric | T57 baseline |
| --- | ---: |
| Collection | 61/61 valid samples; 60 minutes |
| Process CPU P50 / P95 | 41.782% / 59.258% |
| Event-loop P99, P95 of minute windows | 396.624 ms |
| Maximum event-loop stall | 5,662.310 ms |
| Event Outcome CPU | 439,837.391 ms / 842 calls |
| ATC truth cache hit rate | 36.5% |
| RSS P50 | 939.445 MiB |
| Local aircraft / pending P50 | 78 / 15 |

T58 also records available memory/GC, aircraft and pending populations,
ATC cache behavior, and Event Outcome CPU per call. Comparison is
**observational before/after**: traffic and cache state can differ between
runs. A `PASS_WITH_LIMITATIONS` verdict means enough evidence was
collected, **not** that performance improved or all historical stalls
disappeared.

## Results and permanent GitHub history

- Track the run in [GitHub Actions](https://github.com/Boym323/AirRadar/actions/workflows/t58-production-soak.yml).
- A complete analyzed run uploads `soak.summary.json`,
  `soak.summary.md`, and `comparison.md` as an Actions artifact,
  retained for **90 days**. Do not upload the raw `soak.ndjson` file.
- Sanitized reports are appended under `reports/t58/YYYY/MM/DD/` on
  [`audit/t58-history`](https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58)
  with a per-run directory and `INDEX.md`. The archive branch is
  created on the first report; it does **not** change `main` or initiate
  another deploy. The archiving job has Git write permission but no admin
  diagnostic secret.
- No raw API payloads, flight coordinates, aircraft identifiers, secrets,
  or raw NDJSON journals are published. If archiving is blocked by
  repository permissions, the uploaded run artifact remains available,
  and the archive job reports a visible failure.

## Troubleshooting

- **Preflight refuses to start:** check GitHub-runner network access,
  deployed commit, admin authentication, and enabled Operational Twin
  forensics. Avoid restarting production just to force a measurement.
- **No completed report:** inspect the collector/preflight steps; a
  changed commit or process, unavailable samples, or missing coverage
  can produce `INSUFFICIENT_EVIDENCE`.
- **Archive job fails:** confirm Actions repository write permissions
  and branch protection for `audit/t58-history`. The report artifact
  is stored separately; don't push reports to `main`.

See the [authoritative T58 runbook](../../T58-PRODUCTION-SOAK.md)
and [deployment procedures](../../RELEASE.md).
