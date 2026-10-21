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
`--offline` skips branch and tag fetches and releases the currently checked-out
commit without reading from GitHub:

```bash
sudo ./deploy/release.sh --branch release/local --offline
```

The script never runs `git push`; release commits and tags remain local until
an operator explicitly publishes them.
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
the self-hosted Linux x64 runner. The release-validation job builds the exact main commit once, prepares its
standalone runtime assets, writes a manifest containing the commit, resolved
release version, channel, build time, and BUILD_ID, and uploads
`production-build-COMMIT_SHA`. The self-hosted deploy job downloads that
artifact and executes:

```bash
sudo -n /var/www/airradar/deploy/release.sh \
  --branch main \
  --automated \
  --commit COMMIT_SHA \
  --prepared-build ARTIFACT_DIR
```

This is the fast production deployment path: CI has already run typecheck, the
full Vitest suite, production/browser gates, and the performance baseline. The
release script validates the artifact against the exact commit and resolved
release metadata, skips the duplicate quality suite and duplicate Next build,
then runs deterministic dependency installation from package-lock, Prisma
generation/migrations, systemd validation, atomic build activation, restart,
and local/public health checks.
The explicit commit pin and artifact manifest prevent deploying a different or
unvalidated build.

The runner needs only outbound HTTPS access to GitHub. Install it through
GitHub's **Settings → Actions → Runners → New self-hosted runner**, configure
the default labels `self-hosted`, `linux`, and `x64`, and run it as a
dedicated non-root user. That user needs passwordless sudo for the release
script. Do not allow workflows from untrusted pull requests to run on this
runner. Configure required reviewers on the GitHub `production` environment if
an approval step is desired.

Automated mode deploys the exact tested commit, does not create a local
changelog commit or release tag, and keeps the production checkout
fast-forwardable from `origin/main`. During the privileged repository update,
the release script synchronizes remote release tags into the production
checkout so post-deploy version resolution sees prior automated releases. After
production health checks pass, the workflow creates a GitHub Release with
generated release notes, targeting the exact commit recorded by the validated
production-build manifest. The publisher resolves the resulting tag and
fails closed if it points anywhere else; an existing release is reusable only
when its tag still resolves to that same artifact commit.
Release publishing is idempotent: an already-existing GitHub Release for the resolved tag is treated as success,
including rerun/race cases. Versioned stable/RC releases continue to use the
normal command above.

**V1 release-launcher compatibility:** The 2026-10-21 release attempt
[CI #39674837095](https://github.com/Boym323/AirRadar/actions/runs/39674837095)
stopped before any release-script execution with
`sudo: /var/www/airradar/deploy/release.sh: command not found`. Git had recorded
the file as non-executable (`100644`). The release workflow now detects that
specific legacy checkout state and uses a fixed `sudo -n /bin/bash
/var/www/airradar/deploy/release.sh` invocation only for the bootstrap;
normal deployments continue to run the executable script directly. Git now
tracks it as executable (`100755`), with a regression test. If sudoers
rejects the bootstrap command, deployment fails **before** migration, restart,
or data changes; an operator must repair the allowlist, not bypass it.

## Stage 4: Browser test throughput

The browser gate keeps every assertion and screenshot. It runs up to two
independent screenshot pages concurrently (`AIRRADAR_VISUAL_CONCURRENCY`)
and up to two viewport scenarios concurrently
(`AIRRADAR_VIEWPORT_CONCURRENCY`). Each setting is an integer from 1 to 3;
the default and production release values are 2, and 1 is a safe diagnostic
fallback if browser/GPU contention appears. The presentation-mode map interaction and the two full viewport interaction scenarios run exclusively; lightweight checks can continue concurrently. A failing task prevents new work
from starting but the runner awaits other active tasks before closing Chromium.

A real public system snapshot is fetched once before screenshot workers start,
so system-readiness screenshots no longer depend on screenshot ordering. The
responsive width sweep still checks every original breakpoint, and the
representative 375px and 821px interaction matrices remain mandatory; other
viewport contracts are also retained. Logs include target and batch durations
for timing comparisons.

The release gate planner maps recognized isolated UI files (including feature
CSS modules) to specific visual screenshot groups, with full test fallback for
cross-feature, shared, or unrecognized files. Run a `release-preview` PR once
with FULL gates before adopting the updated production release pipeline. Compare
browser wall time and track any resource/rate-limit changes before raising
concurrency above 2. Nightly full browser and radar regression stays enabled.

## CI/CD optimization and release scope

The `release-scope` job inspects **all commits in a main push**, using `github.event.before`. If the base cannot be validated, deployment and the complete gates are required. Documentation-only updates retain their no-deploy behavior.

On deploy-bearing pushes three jobs run in parallel after scope detection:

- `release-validate` builds the pinned release artifact and runs the mandatory production core/browser smoke.
- `release-tests` runs the complete Vitest suite, TypeScript check, dependency audit, migration integrity, and release-planner unit tests.
- `release-performance` independently builds and checks a radar performance fixture (full scenarios for radar/runtime or unknown changes; selected scenarios for known backend/airport changes).

For a deployment-free rehearsal, add the maintainer-controlled `release-preview` label to a PR. The `pull_request:labeled` run exercises the real release build, full Vitest/typecheck and performance jobs (fail-closed full browser/performance scope), but the self-hosted `deploy` job remains strictly limited to `push` on `main`. Remove the label after validation to avoid repeating expensive preview jobs on later commits.

Deployment requires **all three** successful jobs and uses only the pinned artifact from `release-validate`. Browser tests always exercise core health/SSE, with visual target and viewport selection only for proven narrowly scoped changes. Shared or unclassified code, configuration, and CI changes default to the complete browser and performance suite. The existing browser responsive sweep remains enabled when selecting multiple viewports.

The nightly/manual `ci-heavy.yml` workflow runs the **complete browser/production regression and all radar performance scenarios** independently of the fast deployment path. Its full results are retained as GitHub Actions artifacts.

`repository-metadata.yml` is triggered only for successful main CI runs and records a timing report in its GitHub Actions job summary. Compare several successful production deployments before drawing conclusions from timing changes. Do not trade away release identity, migration checks, or production health gates for speed.

## Exact release order

`deploy/release.sh` performs these gates and mutations in order:

1. Preflight checks the application path, required files/commands, Node engine,
   named branch, origin, `.env`, permissions, systemd tools, and clean status
   unless `--allow-dirty` was explicitly selected. In automated mode only the
   exact, unstaged Next.js release-generated changes to `next-env.d.ts` and
   `tsconfig.json` are restored before this check; all other tracked, staged,
   or untracked changes still fail closed.
2. It acquires `/var/lock/airradar-release.lock`. Unless `--offline` is used,
   a clean checkout is fetched and updated only by fast-forward; divergent
   history is rejected. Offline releases keep the current checkout and skip
   both branch and tag fetches. A dirty allowed checkout is kept as-is.
3. `scripts/version.mjs` resolves either a stable `vMAJOR.MINOR.PATCH`
   candidate or, only with `--channel rc`, a canonical
   `vMAJOR.MINOR.PATCH-rc.N` candidate. Stable resolution ignores RC tags;
   RC numbering considers only RC tags for the exact base release. A matching
   release tag already on `HEAD` is reused. The script exports release metadata
   for the build; it does not run `npm version` and does not change package
   manifests.
4. Manual and automated releases keep the tested source commit as the release,
   artifact and tag-target identity. O14 automatic changelog generation and
   metadata backfills are retired; GitHub Releases use GitHub-generated notes.
   The historical `CHANGELOG.md` is not regenerated or committed during release.
5. It runs `npm ci` with the local cache and without npm audit/fund network
   checks and emits the Prisma contract. Manual releases then run lint,
   typecheck, and the full Vitest suite in parallel. Automated releases reuse
   the CI quality result.
6. Manual releases acquire `/var/lib/airradar/build.lock`, write ignored
   `generated/build-version.json`, build into an isolated
   `.next-release-*` directory, and prepare the standalone runtime assets.
   Automated releases instead validate the downloaded CI artifact manifest and
   stage its already-built `.next` tree under the same build lock. The active
   `.next` directory is unchanged in both cases.
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
   URL with retries, checks the public health URL with retries, and verifies
   that public `/api/version` reports the expected release version, artifact
   commit, and production channel. The old build is retained until these
   checks pass.
10. Only after every required check passes does it create the resolved Git tag
    on the exact artifact commit. An existing tag is reusable only when it
    already points at that commit; the script refuses to rewrite a mismatched
    tag.

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

Use `deploy/release.sh` for production releases. Manual releases build into
an isolated `.next-release-*` directory; automated releases stage the
validated CI artifact into that isolated directory. Both change the active
`.next` only during the short service stop/start handoff. If a build fails, the active service and
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

The production release build and start path share `/var/lib/airradar/build.lock`.
`deploy/release.sh` holds this lock while it runs the isolated `npm run build`;
`scripts/start-production.mjs`
probes the lock and waits up to its configured 120-second timeout, then
requires `.next/BUILD_ID` before loading Next. This prevents systemd from
starting an incomplete build.

`deploy/airradar.service` runs as unprivileged `airradar`, with
`WorkingDirectory=/var/www/airradar`, `EnvironmentFile=/var/www/airradar/.env`,
and direct `node scripts/start-production.mjs start --hostname ... --port ...`.
The wrapper prefers the traced `.next/standalone/server.js` runtime and keeps
a backward-compatible `next start` fallback for older rollback builds. It
sets `NEXT_MANUAL_SIG_HANDLE=1`, so systemd tracks the actual Node process as
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

## Previous runtime recovery (manual, schema compatible only)

Each successful deployment now retains exactly one preceding standalone Next.js
build under `/var/www/airradar/.next-previous`. This runtime is distinct from
a database backup. New deployments replace the previous saved slot; ensure
sufficient disk space for two runtime build directories.

After a failed release, examine service logs, Git diff under `migrations/`
and `prisma.config.ts`, and database schema compatibility. Never assume that
a previous build is safe against a migrated database. A failed health gate does
**not** automatically restore an older version or undo a migration.

```bash
cd /var/www/airradar
sudo bash deploy/recover-previous-build.sh
sudo bash deploy/recover-previous-build.sh --apply \\
  --acknowledge-schema-compatible \\
  --expected-active 'ACTIVE_BUILD_ID' --expected-previous 'PREVIOUS_BUILD_ID'
```

The recovery command enforces exact BUILD_IDs, release/build locks, explicit
operator schema acknowledgement, service restart and a local application health
check; it restores the original active runtime if recovery fails. It does not
run `prisma:deploy`, mutate the Git branch, revert database migrations or tag
a release. Verify public JS/CSS static assets and business functions after a
successful recovery. Do not invoke this script automatically from CI.

## Reusing verified PR release gates on main

Apply the `release-preview` label to a PR to run full release typecheck,
Vitest, browser and performance gates **before** merging (but never deploy
from a PR). The ordinary fast PR validation job is then skipped because its
lint, dependency, migration, feature, docs and visual checks are
included in the release-tests job.

For the subsequent main-branch push, `scripts/ci-pr-validation-reuse.mjs`
queries GitHub with read-only permissions. Main can run the fast representative
browser/performance matrix and targeted runtime tests **only if** all of the
following are proven: unique merged same-repository `release-preview` PR;
exact matching main and PR-head Git tree; a completed successful matching
release-preview run (release scope, release build/browser, full test/typecheck,
performance); successful CodeQL on the same PR head; and no modifications to
CI workflows or test/release-harness paths. The new production build,
typecheck, dependency/migration/static audits, browser/core smoke, performance
baseline, release verification, health checks and rollback remain mandatory.

A direct push, merge with changed tree, missing green evidence, modified
CI harness, GitHub API failure, ambiguous PR association or missing permission
automatically uses the **original complete main release gates**. Never override
this fallback or use a stale PR run to force a faster deployment. Main releases
remain explicitly bound to the commit and use the existing production lock.
