# Recovery runbook

This runbook covers the AirRadar application, its PostgreSQL data, and the
systemd-managed runtime state. It is intentionally explicit about what is
known from this checkout and what requires infrastructure verification.

## Backup inventory

Back up these independent items:

1. PostgreSQL database configured by `DATABASE_URL`, including all `public`
   tables and the migration metadata used by the Prisma contract runtime.
2. `/var/lib/airradar/alerts.json`, which contains the production watchlist and
   alert rules.
3. `/var/lib/airradar/alert-events.jsonl`, the bounded append-only alert and
   notification ledger. It is useful operational history but is not a source
   of live aircraft truth.
4. `/var/www/airradar/.env` or an equivalent secret-manager record, including
   `DATABASE_URL`, `WATCHLIST_ADMIN_TOKEN`, receiver settings, provider keys,
   and notification credentials. Treat this as secret material; do not place
   it in Git or a browser variable.
5. The application Git repository, including the exact commit/tag,
   `prisma/contract.prisma`, and every checked-in directory under
   `migrations/app/`. `.next/` and `generated/` are rebuildable artifacts.

The service unit is versioned in `deploy/airradar.service`; preserve the
installed unit as deployment evidence, but restore it from the selected Git
checkout rather than treating it as the primary application backup.

## Restore order

Restore in this order so code and data remain compatible:

1. Identify the incident, record the current Git commit and migration status,
   and preserve service/journal diagnostics before changing state.
2. Restore PostgreSQL to an isolated database or a controlled maintenance
   window. Do not reset, recreate, or destructively migrate the production
   database.
3. Restore the application checkout at the selected known-good commit/tag.
4. Restore `/var/lib/airradar` with owner `airradar:airradar`, mode `0750` for
   the directory, and restrictive file modes (normally `0600`). Restore
   `alerts.json` before starting the service; restore the ledger if its audit
   history is required.
5. Restore the server-only `.env` from the secret backup and verify that
   `WATCHLIST_ADMIN_TOKEN` is present before exposing watchlist mutations.
6. Install dependencies with `npm ci`, emit the Prisma contract, and verify
   the checked-in migration chain. Apply only forward migrations explicitly
   approved for the restored database; this runbook never authorizes a
   production migration by itself.
7. Build the selected checkout, verify the systemd unit and build/start lock,
   then start AirRadar under systemd.
8. Validate local health, the public health endpoint, SSE delivery, database
   status, alert configuration, and the system-status runtime diagnostics.

## PostgreSQL restore

The database is the durable source for sampled history, reference/catalog data,
and daily statistics. Live radar state is rebuilt from readsb and is not
restored from PostgreSQL.

Use the PostgreSQL provider's documented restore procedure to create a
consistent database, then validate it with the same connection settings used
by AirRadar. After selecting the application checkout:

```bash
cd /var/www/airradar
npm run prisma:generate
npx prisma migration status
npm run prisma:verify
```

If the restored database is behind the selected contract, review the pending
forward migrations and run the normal release/deployment procedure only after
an operator approves it. Never use `prisma db push`, reset, migration squash,
or an ad-hoc `DROP` to make the status look current.

## Runtime state and configuration

The systemd unit provides `StateDirectory=airradar`, which resolves the
production state directory to `/var/lib/airradar`. Restore the files atomically
from the backup, keep the directory private, and confirm the alert engine can
read the restored rules. The alert ledger is physically rotated at 8 MiB and
keeps a recent bounded tail; a missing ledger does not prevent live radar.

The `.env` file is outside Git and contains credentials. Restore it through a
secret-management process, not by pasting it into a shell transcript. Confirm
the receiver URL, database URL, `PUBLIC_RECEIVER_POSITION_MODE`, provider
flags, `WATCHLIST_ADMIN_TOKEN`, and notification settings before startup.

## Application checkout and migrations

Use a known Git commit or release tag whose source and migration contract are
compatible with the restored database. The release tag is created only after
all release gates pass; an untagged commit can still be restored by its full
SHA.

The current hardening batch adds only an additive recap-index migration. It is
pending in this checkout until an explicitly authorized deployment applies it.
Code rollback across a schema change is not automatically safe: first verify
that the older code understands the already-applied contract. Indexes are
normally compatible with older code, but that must still be checked against
the selected migration state.

## Validation checklist

Run the following from the selected checkout, with production endpoints and
credentials handled through the normal operator process:

```bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run build
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/system/status
```

Then verify, without exposing payload secrets:

- `/api/health` is `2xx` and reports the expected receiver/database state;
- `/api/system/status` reports bounded RSS/heap, SSE count, and cache counts;
- `/api/stream` delivers a `snapshot` event and closes cleanly on disconnect;
- `/api/version` reports the selected build commit and channel;
- watchlist `GET` works, while mutation requires the restored admin session;
- the public proxy preserves SSE HTTP/1.1, no buffering, and the long read
  timeout documented in `deploy/README.md`.

## Rollback limitations

An application rollback does not roll PostgreSQL back. Do not restore an older
checkout over a database contract it cannot read. If a forward migration has
already been applied, prefer deploying compatible code or making a new
forward migration. Database point-in-time recovery must be treated as a
separate, explicitly approved incident action.

Live aircraft RAM, in-flight SSE connections, provider caches, and unsaved
recent observations are intentionally rebuilt after restart. The alert ledger
is bounded history and may contain fewer old events after retention rotation.

## RPO and RTO

The repository establishes the data classes and restore order, but it does not
prove the external backup schedule. Operational targets should be confirmed by
the infrastructure owner:

- PostgreSQL: target RPO at most 24 hours and target RTO within 60 minutes;
- `/var/lib/airradar`: target RPO at most 24 hours; rules should be restored
  before service start;
- Git/source: exact commit SHA is recoverable from the remote repository;
- live RAM/SSE state: no restore RPO; it is rebuilt from readsb after startup.

## Restore drill

Perform this drill against an isolated PostgreSQL/database and service fixture,
never against production:

1. Record the selected commit, contract hash, migration status, and backup
   identifiers.
2. Restore PostgreSQL and runtime state into the isolated fixture.
3. Check out the selected commit, install dependencies, emit the contract,
   and run migration verification.
4. Start the built service with a fixture readsb/demo provider and restored
   state directory.
5. Run health, system-status, version, SSE lifecycle, alert-read, and
   watchlist-auth checks.
6. Confirm that a restart reconstructs live state without changing the
   restored rules or leaking credentials.
7. Record elapsed restore time, observed data loss window, failures, and the
   exact backup/migration inputs. Update this runbook only from measured
   evidence.

## External verification status

**EXTERNAL INFRA VERIFICATION REQUIRED**

This checkout does not establish evidence for PBS/Proxmox snapshots,
PostgreSQL backup scheduling, off-host retention, backup encryption, or a
successful restore from the external backup host. An infrastructure owner must
verify those items and complete an isolated restore drill before treating the
RPO/RTO targets above as committed production objectives.
