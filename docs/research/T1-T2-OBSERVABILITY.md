# T1/T2 performance observation (read-only)

These tools add **optional diagnostics**, not new ingestion, DB polling or production defaults.

## Process I/O observation

On the Linux host, obtain the current **AirRadar Node PID** (not the shell PID). Run:

```bash
AIRRADAR_AUDIT_PID=12345 AIRRADAR_AUDIT_DURATION_MS=60000 node scripts/audit-process-io.mjs
```

The sampler reads only `/proc/<PID>/io` and `/proc/<PID>/stat`, and validates Linux process start time at both ends. Use multiple observation windows at comparable traffic. Results are **process logical writes, not physical drive writes or file-level attribution**. This script does not record file names, inject instrumentation, enable PostgreSQL extensions, or modify live settings. Output can be saved with `AIRRADAR_AUDIT_OUTPUT=/tmp/airradar-io.json` (create-only). Running it without permission to read the target process will fail.

## Optional reproducible performance budgets

```bash
node scripts/audit-performance-regressions.mjs /tmp/measurements.json /tmp/budgets.json
```

The budgets file is a JSON object mapping numeric report fields (dot-separated paths) to maximum allowable values; for example `{"perMinute.write_bytes.mibPerMin":80}`. Missing or nonfinite metrics **fail closed**. A threshold is meaningful only when the comparison uses the same environment and representative traffic. Do not enable fixed wall-clock limits on shared CI runners.

Before taking action on the historic high Node process write rate, add attribution by path under a separate, approved, low-overhead canary; do not treat process I/O alone as proof that a cache is responsible.

No deployment, migration, restart, cleanup, or cron job is part of this change.
