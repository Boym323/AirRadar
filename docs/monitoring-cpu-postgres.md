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

The monitor fails closed when the admin cookie or required runtime telemetry is
missing. A missing exporter is recorded as `unavailable`, never as zero.

## Installation and canary

Install the two unit files and create `/etc/airradar/monitoring.env` readable
only by root and `airradar` (mode `0600`):

```dotenv
AIRRADAR_MONITOR_BASE_URL=http://127.0.0.1:3000
AIRRADAR_MONITOR_ADMIN_COOKIE=airradar_watchlist_session=...
DATABASE_URL=postgresql://airradar:...@db-host:5432/airradar?sslmode=require
# Optional private-only exporter URL, for example http://10.0.0.20:9100
# AIRRADAR_MONITOR_NODE_EXPORTER_URL=
```

The cookie is an existing short-lived administrator session, not a new
database privilege. Do not put the exporter on a public interface and do not
grant the monitor write access. The PostgreSQL role needs only `CONNECT` and
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
