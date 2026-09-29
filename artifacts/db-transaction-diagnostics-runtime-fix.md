# DB transaction diagnostics runtime fix

## Result

**DIAGNOSTICS CANARY PASS**

The restart was fully attributed to automated GitHub Actions releases. The
final uninterrupted canary ran for 10m21s on one process/store identity; the
subsequent attribution window ran for 30m14s on that same process.

## Restart root cause

Timezone: Europe/Prague (CEST).

- PID 45834 stopped at `2026-09-29 17:28:52.990` and PID 46826 started at
  `17:28:53.395`. The runner invoked the automated release for `d45bf5bc` at
  `17:27:18`; it succeeded at `17:29:04`.
- A second release interrupted the attempted canary. The runner started
  `Deploy production` at `17:39:45.898`, invoked the release for `4b0205d0`
  at `17:39:47`, and succeeded at `17:42:07`. PID 46826 stopped at
  `17:41:52.460`; PID 48621 started at `17:41:53.319`.
- Both stops were clean SIGTERM shutdowns with successful deactivation and
  `NRestarts=0`. `Restart=on-failure` did not cause them; `WatchdogSec=0`.
- Kernel and cgroup checks found no OOM, killed process, memory breach,
  watchdog, panic, reboot, or host/container restart. The host boot ID and
  uptime were unchanged.

Classification: **AUTOMATED RELEASE**. The second release was triggered by the
documentation-only commit `4b0205d0` (`docs: record diagnostics deployment
canary`), proving that this CI deployment scope can restart production for that
commit type.

## Production

- Git: `HEAD == origin/main == 4b0205d09e5ebb408eb89e75dc21a2acf9e4abc8`
- Version/SHA: `1.0.217 / 4b0205d0`
- Service: healthy, current MainPID `48621`, `NRestarts=0`
- Database: healthy; schema unchanged; migrations `0`
- Unit: `Restart=on-failure`, `RestartSec=5s`, `WatchdogSec=0`, direct node
  entrypoint, `SIGTERM`, `control-group`, working directory `/var/www/airradar`.

## Stable canary

Window: `2026-09-29 17:45:01–17:55:22 CEST` (10m21s).

- MainPID/processId: `48621`
- diagnosticsStoreId: `dbtx-mumugx0c-gzmu25ul`
- startedAt: `2026-09-29T15:41:53.820Z`
- scope: `process-local`
- identity stable: **YES**
- service/database/receiver/statistics health: OK
- `history.snapshot`: 2,591 attempts, 2,591 commits, 0 failures
- `receiver.coverage`: 6 attempts, 6 commits, 0 failures
- `receiver.daily-stats`: 26 attempts, 26 commits, 0 failures
- `receiver.advanced-stats`: 27 attempts, 27 commits, 0 failures
- database cross-check: 886 `flightPosition` inserts, 300
  `receiverCoverageHourly` inserts, 5,967 PostgreSQL commits, 90 rollbacks,
  and zero deadlocks

The all-zero telemetry defect is resolved. Evidence supports
**MODULE-LOCAL STATE ISOLATION / DUPLICATE MODULE INSTANCE**, with high
confidence: one Node process, process-local wrappers, and globalThis-backed
diagnostic counters advance together.

## Long transaction attribution

Window: `2026-09-29 17:55:59–18:26:13 CEST` (30m14s), uninterrupted and on the
same process/store identity.

| Measure | Result |
|---|---:|
| PostgreSQL commits/min | 501.9 |
| PostgreSQL rollbacks/min | 6.2 |
| PostgreSQL transactions/min | 508.2 |
| Explicit instrumented transactions/min | 187.8 |
| Explicit share | 36.9% |
| Explained | 36.9% |
| Unexplained | 63.1% |
| Deadlocks | 0 |

Measured standalone writes: `flightPosition` 172.6 inserts/min,
`receiverCoverageHourly` 9.9 inserts/min, `aircraftWeatherObservation` 84.5
inserts/min, `navigationIntegrityObservation` 139.9 inserts/min,
`navigationIntegrityAnomaly` 11.8 inserts/min, and `flight` 4.2 inserts/min.

`pg_stat_statements` is unavailable, so autocommit reads cannot be separated
from the total transaction counter. The exact unexplained class is autocommit
reads and autocommit writes outside the explicit-lane registry; no external
database clients were observed. Because attribution is below 95%, no
optimization candidate is selected.

## Safety and changes

- application code changed: **NO**
- deployment during final measurement: **NO**
- schema changed: **NO**
- migration: **NO**
- persistence semantics changed: **NO**
- host/container restarted: **NO**
