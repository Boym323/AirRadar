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

The default release channel is stable. Release candidates use the same gates,
locks, migration workflow, systemd deployment, restart, and health checks, but
are explicitly selected with:

```bash
sudo ./deploy/release.sh --channel rc
```

An RC is tagged as `vMAJOR.MINOR.PATCH-rc.N` and reports channel
`release-candidate`. RC tags do not consume the stable version: after
`v1.0.0-rc.1` and `v1.0.0-rc.2`, the first stable release remains `v1.0.0`.
An unsuccessful RC does not consume its number because the tag is created only
after deployment and health checks pass. Stable releases remain the default;
the stable release should be performed only after RC validation is complete.

The default branch is `main`. `--branch BRANCH` is required to release another
named branch deliberately. `--allow-dirty` preserves the current dirty
checkout, skips the origin update, and is for exceptional controlled use.
`--dry-run` performs preflight and prints the plan and resolved candidate; it
does not update Git, install dependencies, migrate, build, restart, or
health-check. To inspect an RC candidate without mutations, use:

```bash
sudo ./deploy/release.sh --channel rc --dry-run
```

## Continuous deployment

`.github/workflows/ci.yml` runs the full validation gate on every pull request
and push. A push to `main` automatically runs the production smoke checks,
including the desktop/mobile browser gate, and then starts the `deploy` job on
the self-hosted Linux x64 runner. The runner executes:

```bash
sudo -n /var/www/airradar/deploy/release.sh --branch main --automated --commit COMMIT_SHA
```

The runner needs only outbound HTTPS access to GitHub. Install it through
GitHub's **Settings → Actions → Runners → New self-hosted runner**, configure
the default labels `self-hosted`, `linux`, and `x64`, and run it as a
dedicated non-root user. That user needs passwordless sudo for the release
script. Do not allow workflows from untrusted pull requests to run on this
runner. Configure required reviewers on the GitHub `production` environment if
an approval step is desired.

Automated mode deploys the exact tested commit, does not create a local
changelog commit or release tag, and keeps the production checkout
fast-forwardable from `origin/main`. Versioned stable/RC releases continue to
use the normal command above.

## Exact release order

`deploy/release.sh` performs these gates and mutations in order:

1. Preflight checks the application path, required files/commands, Node engine,
   named branch, origin, `.env`, permissions, systemd tools, and clean status
   unless `--allow-dirty` was explicitly selected.
2. It acquires `/var/lock/airradar-release.lock`. A clean checkout is fetched
   and updated only by fast-forward; divergent history is rejected. A dirty
   allowed checkout is kept as-is.
3. `scripts/version.mjs` resolves either a stable `vMAJOR.MINOR.PATCH`
   candidate or, only with `--channel rc`, a canonical
   `vMAJOR.MINOR.PATCH-rc.N` candidate. Stable resolution ignores RC tags;
   RC numbering considers only RC tags for the exact base release. A matching
   release tag already on `HEAD` is reused. The script exports release metadata
   for the build; it does not run `npm version` and does not change package
   manifests.
4. `scripts/changelog.mjs` generates the new `CHANGELOG.md` section from Git
   commits since the previous release tag. If changed, the release commits it
   automatically before continuing.
5. It runs `npm ci` with the local cache and without npm audit/fund network
   checks, emits the Prisma contract, then runs lint, typecheck, and the full
   Vitest suite in parallel. The release test invocation uses Vitest
   `--pool=threads`; all tests still run.
6. It acquires `/run/airradar-build.lock`, writes ignored
   `generated/build-version.json`, and runs `npm run build` with Next.js output
   directed to an isolated `.next-release-*` directory. The active `.next`
   directory is not changed while the service is serving traffic. The build
   lock is released after the build.
7. It runs `npm run prisma:deploy` against the configured database. Migrations
   are forward migrations; never reset or recreate a production database.
8. It validates the repository systemd unit, compares/installs it atomically
   at the loaded persistent FragmentPath, daemon-reloads only when changed,
   verifies the loaded unit contract: direct production entrypoint, expected
   working directory/environment, SIGTERM, `control-group`, `StateDirectory=airradar`,
   `StateDirectoryMode=0750`, and `ProtectSystem=strict`, then performs a
   non-destructive legacy alert-config migration if needed. The migration never
   overwrites `/var/lib/airradar/alerts.json`; the old alert-event ledger is
   never copied.
9. It briefly stops `airradar.service`, atomically activates the completed
   build, starts the service, requires it to be active, checks the local health
   URL with retries, and checks the public health URL with retries. The old
   build is retained until both health checks pass.
10. Only after every required check passes does it create the resolved Git tag.

A failed post-restart release prints systemd/journal diagnostics and does not
automatically roll back Git code or database migrations. Recovery must account
for migration/code compatibility. A failed candidate remains reusable because
the tag is created last.

## Build consistency and visual changes

Do not run `npm run build` directly in the live `/var/www/airradar` checkout
while `airradar.service` is running. Next.js keeps the build manifest in the
running process, while the build rewrites the shared `.next` directory. If a
new build replaces `.next` before the old process is restarted, HTML from the
old build can reference missing static CSS/JavaScript files; the homepage may
return `200` while appearing unstyled and non-interactive. The build/start
lock prevents a service from starting during an active release build, but it
does not make an independently run build safe for an already running process.

Use `deploy/release.sh` for production builds. It builds into an isolated
`.next-release-*` directory and changes the active `.next` only during the
short service stop/start handoff. If a build fails, the active service and
build remain untouched. During a failed activation, keep the service recovery
and database migration compatibility in mind before manually restoring an old
build.

Any change to `app/`, `components/`, styles, images, fonts, or other visual UI
code requires the browser gate before release:

```bash
npm run test:production:browser
```

After restart, verify the public URL in a real browser or equivalent smoke
check. The check must confirm that all `/_next/static/*` resources return
successful responses with their expected MIME types and that the page has no
browser console errors. `/api/health` alone is not sufficient to validate the
visual UI.

## Build/start lock and systemd

The production release build and start path share `/run/airradar-build.lock`.
`deploy/release.sh` holds this lock while it runs the isolated `npm run build`;
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
`StateDirectory=airradar` gives the service user persistent `/var/lib/airradar`
storage while `ProtectSystem=strict` keeps the source checkout read-only.

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
