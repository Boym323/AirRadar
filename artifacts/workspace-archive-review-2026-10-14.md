# AirRadar workspace archive review — 2026-10-14

## Scope

This record summarizes the two temporary workspaces archived during the V3.6
tmpfs recovery. The source trees were reviewed locally; source code, SQL,
configuration, generated builds, dependency trees, and machine-readable data
were not uploaded to GitHub.

Archived workspaces:

- `/tmp/airradar-pr743.4e2NDw` → archived locally at
  `/var/backups/airradar-workspaces/airradar-pr743.4e2NDw`
- `/tmp/airradar-prisma17-cli17-iqnErU` → archived locally at
  `/var/backups/airradar-workspaces/airradar-prisma17-cli17-iqnErU`

Both archives were verified before cleanup. File contents matched by SHA-256,
file/directory/link counts matched, supported ownership and permissions
matched, and the source trees did not change during verification.

## Retained findings

### Historical altitude incident

- The audit found a concentrated extreme-altitude cluster, including a known
  AC12 decoder window, but retained data lacks raw-frame/provider provenance.
- The final disposition remained conservative: no new production
  classification was applied.
- A prior repair changed 491 `FlightPosition` rows and three `Flight` rows;
  non-altitude fields and row counts were unchanged. The prepared rollback
  SQL and row-level snapshots remain local evidence only.

### Runtime and database observations

- Historical production measurements attributed 98.30% of PostgreSQL activity
  during the attribution window; deadlocks, lock waits, and long application
  transactions were zero.
- The recurring resource findings were Node filesystem write amplification,
  Flight/FlightPosition transaction churn, and secondary navigation/weather
  persistence volume. These are observations, not authorization for a release
  or database mutation.
- No production restart, release, migration, or schema change was inferred
  from the retained reports.

### Current cleanup outcome

- Both tmpfs workspaces were removed only after archive verification.
- AirRadar remained stopped; PostgreSQL remained healthy.
- ATC flags remained `false/false`; watchdog lockout was preserved.
- The production `.next`, `.next-previous`, and recovery evidence were not
  changed.
- Cleanup reduced cgroup `memory.current` from approximately 10.63 GB to
  approximately 5.95 GB and increased `MemAvailable` from approximately
  0.37 GiB to approximately 4.66 GiB.

## Deliberately excluded from GitHub

The following remain excluded from this record and from GitHub:

- source snapshots and Git metadata from the temporary workspaces;
- `node_modules`, `.next`, caches, and generated build output;
- SQL, CSV, JSON/NDJSON exports, rollback snapshots, and raw diagnostic data;
- `.env`-style files, deployment configuration, credentials, and provider data.

Those items were removed from the temporary workspace copies after verified
archival. The persistent local archive was subsequently treated as the
operator-only evidence store, not as a public or repository artifact.
