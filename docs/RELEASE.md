# Release procedure

This is the authoritative release procedure. Do not run it unless the user
explicitly requests a production release. This documentation task did not run
it.

## Normal command

Run from the canonical production checkout as a user with the required
passwordless sudo/systemd access:

```bash
cd /var/www/airradar
sudo ./deploy/release.sh
```

The default branch is `main`. `--branch BRANCH` is required to release another
named branch deliberately. `--allow-dirty` preserves the current dirty
checkout, skips the origin update, and is for exceptional controlled use.
`--dry-run` performs preflight and prints the plan; it does not update Git,
install dependencies, migrate, build, restart, or health-check.

## Exact release order

`deploy/release.sh` performs these gates and mutations in order:

1. Preflight checks the application path, required files/commands, Node engine,
   named branch, origin, `.env`, permissions, systemd tools, and clean status
   unless `--allow-dirty` was explicitly selected.
2. It acquires `/var/lock/airradar-release.lock`. A clean checkout is fetched
   and updated only by fast-forward; divergent history is rejected. A dirty
   allowed checkout is kept as-is.
3. `scripts/version.mjs` resolves a `vMAJOR.MINOR.PATCH` candidate from the
   `package.json` major/minor series and existing tags. A release tag already
   on `HEAD` is reused. The script exports release metadata for the build; it
   does not run `npm version` and does not change package manifests.
4. It runs `npm ci`, `npm run prisma:generate`, `npm run lint`,
   `npm run typecheck`, and `npm test`.
5. It acquires `/run/lock/airradar-build.lock`, writes ignored
   `generated/build-version.json`, and runs `npm run build`. The build lock is
   released after the build.
6. It runs `npm run prisma:deploy` against the configured database. Migrations
   are forward migrations; never reset or recreate a production database.
7. It validates the repository systemd unit, compares/installs it atomically
   at the loaded persistent FragmentPath, daemon-reloads only when changed,
   and verifies the loaded unit contract: direct production entrypoint,
   expected working directory/environment, SIGTERM, and `control-group`.
8. It restarts `airradar.service`, requires the service to be active, checks
   the local health URL with retries, and checks the public health URL with
   retries.
9. Only after every required check passes does it create the resolved Git tag.

A failed post-restart release prints systemd/journal diagnostics and does not
automatically roll back Git code or database migrations. Recovery must account
for migration/code compatibility. A failed candidate remains reusable because
the tag is created last.

## Build/start lock and systemd

The production release build and start path share `/run/lock/airradar-build.lock`.
`deploy/release.sh` holds this lock while it runs `npm run build`;
`scripts/start-production.mjs`
probes the lock and waits up to its configured 120-second timeout, then
requires `.next/BUILD_ID` before loading Next. This prevents systemd from
starting an incomplete build.

`deploy/airradar.service` runs as unprivileged `airradar`, with
`WorkingDirectory=/var/www/airradar`, `EnvironmentFile=/var/www/airradar/.env`,
and direct `node scripts/start-production.mjs start --hostname ... --port ...`.
The wrapper registers the shutdown coordinator in the Next process and sets
`NEXT_MANUAL_SIG_HANDLE=1`, so systemd tracks the actual Node process as
`MainPID` and the application owns cleanup. The service uses
`KillMode=control-group`, `KillSignal=SIGTERM`, and a bounded stop timeout.

## Reverse proxy and health

The production proxy targets the LAN listener configured in the systemd unit.
AirRadar uses SSE, not WebSocket. The proxy must preserve HTTP/1.1, disable
buffering/cache for `/api/stream`, keep a long read timeout, and retain
`X-Accel-Buffering: no`; the complete Nginx Proxy Manager configuration is in
[`deploy/README.md`](../deploy/README.md).

The script's release health checks require `/api/health` to report HTTP 2xx,
top-level `status=ok`, and `application.status=ok`. Health responses are
sanitized and must not contain secrets, database URLs, raw provider errors, or
transient operational values in documentation.
