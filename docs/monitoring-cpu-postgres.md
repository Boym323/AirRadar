# AirRadar CPU + PostgreSQL monitoring

The monitor is an opt-in, read-only sampler for issue #1134. It stores
sanitized JSONL samples under `/var/lib/airradar/monitoring` with mode `0700`
for the directory and `0600` for files. Retention defaults to 14 days and is
bounded to 90 days. It never stores SQL text, aircraft identities, credentials,
or query parameters.

Each sample combines:

- authenticated admin `/api/system/runtime-performance` schema 4: process CPU,
  RSS, and event-loop P95/P99;
- bounded PostgreSQL 17 `pg_stat_database`, `pg_stat_wal` and
  `pg_stat_activity` reads, plus aggregate `pg_stat_statements` when the
  optional extension is available;
- optional node_exporter `node_cpu_seconds_total`, explicitly labelled as
  whole-host CPU and never as PostgreSQL-process CPU.

Every PostgreSQL sample runs all statistics SELECTs inside one explicit
`BEGIN TRANSACTION READ ONLY` / `COMMIT` transaction. Optional statistics use
savepoints so an unavailable view cannot leave the shared connection in an
aborted transaction. This is a defense-in-depth restriction for the shared
application account; it is not a least-privilege database role.

The monitor fails closed when the admin cookie or required runtime telemetry is
missing. A missing exporter is recorded as `unavailable`, never as zero.

## Installation and canary

Install the two unit files and create `/etc/airradar/monitoring.env` readable
only by root and `airradar` (mode `0600`):

```dotenv
# Must match airradar.service. Current production listens on 192.168.1.142:3000,
# not on 127.0.0.1:3000.
AIRRADAR_MONITOR_BASE_URL=http://192.168.1.142:3000
# Prefer the existing server-only admin secret so the timer renews its session:
AIRRADAR_MONITOR_ADMIN_TOKEN=...
DATABASE_URL=postgresql://airradar:...@db-host:5432/airradar?sslmode=require
# Optional private-only exporter URL, for example http://10.0.0.20:9100
# AIRRADAR_MONITOR_NODE_EXPORTER_URL=
```

The token is the existing server-only administrator secret; the sampler derives
an 8-hour session cookie for each run. It is not a new database privilege. Do
not put the exporter on a public interface and do not grant the monitor write
access. The PostgreSQL role needs only `CONNECT` and
the normal statistics visibility; do not add superuser or broad table grants.

Before activation, install the unit files and environment file, then run a
single canary as the service user. This keeps the secret in the protected
environment file and avoids putting it in shell history:

```bash
sudo systemctl daemon-reload
sudo systemctl start airradar-cpu-db-monitor.service
sudo journalctl -u airradar-cpu-db-monitor.service -n 50 --no-pager
```

Inspect the JSONL file and journal for exactly one sample, then repeat once.
Only after both samples are valid, and after verifying the unit's network and
write permissions, an administrator may run `systemctl enable --now
airradar-cpu-db-monitor.timer`. The application deployment does not enable the
timer automatically.

## 24-hour evidence and dashboard proposal

After at least 24 hours, produce `npm run monitor:report` and retain the
sanitized report with the deployment record. Compare cumulative PostgreSQL
counter deltas over the same window: transactions (commit/rollback), WAL
records/bytes, and lock waits. A stable process identity and continuous sample
timestamps are required; gaps are gaps, not healthy zeroes.

Grafana should be planned only against observed fields: process CPU and RSS,
event-loop P99, WAL bytes/records per minute, commit/rollback rates, lock-wait
counts, sample availability, and optional whole-host CPU. Suggested alerts are
sample gap, runtime telemetry unavailable, RSS growth, event-loop P99, lock
waits, rollback-rate anomaly, and WAL growth. No Grafana or exporter is
installed by this change.

## Production evidence (2026-10-28)

The standard production deployment completed successfully for commit
`83c183b0aa3409961553052d76d557533cb2a850` (version `1.0.567`, production
channel). CI run [40732407283](https://github.com/Boym323/AirRadar/actions/runs/40732407283)
passed, including production validation, performance regression and deploy;
CodeQL run [40732407279](https://github.com/Boym323/AirRadar/actions/runs/40732407279)
passed. The deployed `/api/version` and public/local `/api/health` checks were
successful.

The production checkout was made clean without a blind reset. The two dirty
MapLibre files were byte-for-byte output of `node_modules/maplibre-gl@6.14.0`
from `scripts/sync-maplibre-worker.mjs`; the previous generated state remains
auditable as local ref `backup/production-generated-maplibre-4eabcd6`.

Two real systemd canaries succeeded after installing the unit from this commit:
V8 JIT started normally, authenticated runtime schema 4 was read, PostgreSQL
statistics were read, four JSONL samples parsed successfully, files remained
`0600`, and no credential value occurred in the samples. Whole-host PostgreSQL
CPU is `unavailable` (`not_configured`), not zero. The application listens on
`192.168.1.142:3000`.

The configured `airradar` database role remains a documented security
compromise: it is shared with the application and has write grants on
application tables. The explicit read-only transaction prevents this sampler
from writing, but does not remove the account's broader privileges and is not a
least-privilege solution. The current local report contains only four samples
over a partial window, so 24-hour continuity, retention, outage recovery, and
time-aligned CPU/DB aggregation are not yet proven and must not be reported as
complete.
