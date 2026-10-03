# Development

## Source and environment

Use Node.js `>=22.18.0` and npm `>=10`. Copy `.env.example` to `.env` for
local work. An empty `READSB_BASE_URL` enables demo mode; PostgreSQL is
optional for live radar and history falls back in memory. Never commit `.env`,
database URLs, credentials, or API keys.

The source of truth is `prisma/contract.prisma`; checked-in migrations are in
`migrations/app/`. Generated Prisma/build artifacts are disposable. Keep
user-facing text in `lib/i18n/` and use existing translation keys.

## Development database

The isolated development database is canonicalized as follows:

```text
Database: airradar_dev
Role/user: airradar_dev
Schema: public
Environment file: .env.dev.local
```

Development uses the separate `.env.dev.local` file. Prisma and development
runtime processes continue to use the standard `DATABASE_URL` variable; the
DEV/PROD separation is provided by the environment file, not by a second
variable name. Create it locally with placeholders only:

```env
# Development database only
DATABASE_URL="postgresql://airradar_dev:<DEV_PASSWORD>@<DB_HOST>:5432/airradar_dev"
AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=false
```

Never commit `.env.dev.local`, put a production `DATABASE_URL` in it, or store
its password in documentation. `DATABASE_URL` must point to `airradar_dev`
before any DEV migration, test write, or canary. Protect the file and confirm
Git's ignore rules:

```bash
chmod 600 .env.dev.local
git check-ignore .env.dev.local
```

This repository already ignores `.env*`. If the local checkout does not, use a
local exclude rather than changing the shared ignore policy:

```bash
echo ".env.dev.local" >> .git/info/exclude
```

Before using Prisma or running integration writes, verify the actual target:

```bash
set -a
source .env.dev.local
set +a

psql "$DATABASE_URL" -c "SELECT current_database(), current_user, current_schema();"
```

The expected result is `airradar_dev | airradar_dev | public`. If
`current_database()` is not `airradar_dev`, stop: DEV migrations and test
writes must not run.

### Refreshing DEV from PROD

Production is a read-only source for a DEV refresh. Create a logical custom
format snapshot with a production read-only connection supplied by the
operator; do not put its URL or credentials in this document. The snapshot is
then restored only into the isolated DEV database:

```bash
PROD_DB="<production-db-name>"
DEV_DB="airradar_dev"
DUMP="/var/backups/airradar-dev-bootstrap/$(date +%Y%m%dT%H%M%S)/airradar-prod-snapshot.dump"

mkdir -p "$(dirname "$DUMP")"
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP" \
  "$PROD_DB"
pg_restore --list "$DUMP" >/dev/null
```

Before any destructive DEV operation, require the database-name guard:

```bash
[ "$PROD_DB" != "$DEV_DB" ] || {
  echo "STOP: PROD and DEV database names are identical"
  exit 1
}

dropdb --if-exists --force "$DEV_DB"
createdb \
  --owner=airradar_dev \
  --encoding=UTF8 \
  --template=template0 \
  "$DEV_DB"
```

Restore without embedding a password in the command. Use `.pgpass` or the
approved environment/credential mechanism for authentication:

```bash
pg_restore \
  --dbname="$DEV_DB" \
  --username=airradar_dev \
  --no-owner \
  --no-acl \
  "$DUMP"
```

For a TCP connection, specify `<DB_HOST>` and the DEV database explicitly:

```bash
pg_restore \
  --host=<DB_HOST> \
  --port=5432 \
  --username=airradar_dev \
  --dbname=airradar_dev \
  --no-owner \
  --no-acl \
  "$DUMP"
```

Never drop the production database, terminate production sessions for a DEV
refresh, or use `TRUNCATE` against production. A refresh does not make the
DEV database a permanent staging-history archive.

After restore, load `.env.dev.local` again and verify the target and schema:

```bash
set -a
source .env.dev.local
set +a

psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"
psql "$DATABASE_URL" -c '\dt'
psql "$DATABASE_URL" -c \
'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 10;'
```

Optional sanity counts for `Flight` and `FlightPosition` are useful after a
restore; byte-identical database size is not a requirement.

### DEV migrations and lifecycle

Apply pending migrations only after the connection check above:

```bash
set -a
source .env.dev.local
set +a

npx prisma migrate status
psql "$DATABASE_URL" -Atc "SELECT current_database();"
# The command above must print: airradar_dev
npx prisma migrate deploy
npx prisma migrate status
```

The recommended lifecycle is:

```text
PROD snapshot → restore to airradar_dev → apply pending DEV migrations
→ DB integration → DEV canary → validation report → feature OFF → commit / CI
```

`airradar_dev` is for migration validation, DB integration tests, predictive
prospective canaries, report validation, lifecycle/dedupe checks, OFF-versus-ON
performance comparisons, and safe experiments with synthetic rows. Synthetic
observation rows belong only in DEV/test databases.

### Production database safety

The `airradar_dev` role must not have access to the production database. A
production administrator should enforce the separation, for example:

```sql
REVOKE CONNECT ON DATABASE <PROD_DB> FROM airradar_dev;
```

Use production only as a read-only dump source; never run integration tests
against it. Production cleanup is a separate, explicitly confirmed operation
limited to unambiguous test data. The DEV role must not be used for the
production dump connection.

For Predictive Prospective Validation V2, apply
`20261003T0515_predictive_prospective_observations_v1` to DEV after restoring a
PROD snapshot, while keeping the feature switch OFF. Stage 0 is a DEV schema
validation step; a schema apply does not graduate the feature or expose it
publicly. Enable the DEV canary only after DEV migration PASS, DB integration
PASS, and runtime safety checks PASS:

```env
AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED=true
```

After the canary, return the switch to `false` unless DEV capture is
deliberately retained. With `false`, there are no prospective persistence
writes; the predictive engine remains in SHADOW mode and the public SSE
snapshot is unchanged. See the [Predictive Prospective Validation V2
workflow](PREDICTIVE-PROSPECTIVE-VALIDATION-V2.md) for the staged procedure.

## Feedback loop and gates

For a focused change, run selected files:

```bash
npm run test:targeted -- tests/aircraft-state.test.ts
```

`test:targeted` is the same Vitest runner with the file arguments after `--`;
it is the preferred quick check for a narrow change. For a mixed change,
`test:changed` asks Vitest to select tests affected by the current diff:

```bash
npm run test:changed
```

Vitest follows static imports to include transitive dependants. If it cannot
prove a relationship, prefer a targeted or full run; do not narrow a test run
to force it to pass. `npm test` is the affected-test default and may select no
tests in a clean tree. The complete suite is available explicitly:

```bash
npm test
npm run test:full
```

`test:unit` excludes the explicitly classified DB/API/runtime boundary suites;
`test:integration` runs those suites. The classification is intentionally
reviewed in `vitest.integration.config.ts` rather than inferred from timing.
`test:watch` uses Vitest's native affected watch mode.

The production-scale metadata importer test is intentionally separate from
the normal suite because its 617,000-record fixture tests resource behavior,
not ordinary correctness. Run it with `npm run test:scale`; CI runs it in the
nightly/manual heavy workflow. The normal metadata test still proves multiple
full batches, a remainder batch, bounded batch size, streaming, and record
counts.

Relevant production gates are:

```bash
npm run prisma:generate
npm run features:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:production
```

`features:check` validates `docs/features.registry.json` against every current
Next.js page and API route and verifies the generated registry section in
`docs/FEATURES.md`. When adding/removing/renaming a route, update the registry
and run `npm run features:generate` before validation. `typecheck` emits the
Prisma contract and Next typegen. `build` writes ignored
build metadata, emits the Prisma contract, and runs `next build`. A previous
full-gate pass is stale after source, test, package, build, migration, or
deployment changes. Report exactly which commands ran; never imply a skipped
gate passed.

Docs-only commits (Markdown documentation, `README.md`, and the explicit
generated metadata allowlist) do not trigger production deployment. Runtime,
release, schema, and configuration changes do; mixed commits deploy, and
unknown paths fail safe to deploy. Machine-readable documentation such as
`docs/features.registry.json` is therefore not docs-only.
The release-scope classifier is covered by deterministic regression tests.

`test:production` starts the completed build in an isolated demo-mode child
process and checks HTTP health, `/api/version`, homepage accessibility basics,
SSE connect/snapshot/disconnect, static payload caching, watchlist mutation
authorization, runtime diagnostics, PWA manifest behavior, and additive
migration source. It does not apply migrations or contact production
providers. The optional browser variant adds desktop/mobile Playwright smoke
checks when a browser is installed:

```bash
npm run test:production:browser
```

Production gates also accept `--core`, `--browser`, and `--all` modes. Browser
mode starts one built server and checks the full interaction contract on
representative mobile/desktop widths, while all ten configured widths keep the
responsive layout contract. `--all` runs core and browser checks in one server
lifecycle for CI.

The production gate accepts the version and channel emitted by the current
`generated/build-version.json` build metadata, requiring either a stable
`X.Y.Z/production` or canonical `X.Y.Z-rc.N/release-candidate` pair. It detects
the current pair by default; set
`PRODUCTION_GATE_CHANNEL=stable` or `PRODUCTION_GATE_CHANNEL=rc` to require a
specific pair.

For visual work, also run the desktop/mobile browser gate. Do not validate a
visual change by running `npm run build` in the live production checkout: a
running Next.js process can retain the old build manifest while `.next` is
rewritten, which mixes old HTML references with new static assets. Use a
separate worktree or local/staging process during implementation, then use
`deploy/release.sh` for production.

The live radar has an opt-in browser performance probe. Add
`?perfDiagnostics=1` to the radar URL, then inspect
`window.__airradarPerformanceDiagnostics.snapshot()` in DevTools. The snapshot
reports animation-frame work, marker writes, label-collision duration, virtual
traffic rows, and browser long tasks. The probe is disabled by default and must
not change live-state, SSE, or motion semantics.

After a prepared production build, run `npm run benchmark:radar` to execute the
production radar performance baseline. The Playwright benchmark replaces only
the browser's aircraft EventSource with deterministic synthetic SSE V2 traffic,
then measures the real production radar at 50, 100, 250, and 500 aircraft. It
records animation average/max duration, marker writes per second, label
collision average/max duration, browser long tasks, DOM/MapLibre marker counts,
and mounted/virtualized traffic rows. Results are written to both
`artifacts/radar-performance-baseline.json` and
`artifacts/radar-performance-baseline.md`; CI uploads both and puts the
Markdown table in the GitHub Actions step summary.

CI pass/fail intentionally uses only deterministic structural/instrumentation
budgets from `scripts/radar-performance-budget.mjs`: exact marker/handle
counts, bounded virtualized traffic rows, and proof that animation/collision
diagnostics actually ran. Wall-clock animation/collision durations, writes per
second, and browser long tasks are recorded as observational baseline data but
are not CI gates because hosted-runner load makes those values noisy. Promote a
timing metric to a gate only after it has a stable multi-run distribution on
the target runner class.

For a quicker local sample, select scenarios or shorten the measurement window,
for example `RADAR_PERF_SCENARIOS=50,250 RADAR_PERF_MEASURE_MS=1200 npm run
benchmark:radar`. Structural budgets should be changed only with an explanation
in the PR; do not loosen them merely to make a regression green.

Documentation-only changes that do not touch code, package files, schema,
migrations, or build configuration do not require the build/full suite unless
the user asks for it. Still run relevant lightweight checks such as link
validation and `git diff --check`.

## Main, worktrees, and parallel agents

The canonical checkout is `/var/www/airradar` on `main`. Keep a task's changes
isolated and inspect `git status` before editing. Do not overwrite unrelated
user changes in a dirty worktree.

Parallel agents must use separate Git worktrees and branches. Each agent owns
its worktree, does not edit another agent's checkout, and reports the files and
checks it changed. Integrate work by an intentional merge or cherry-pick into
`main`, then rerun checks affected by the combined diff. Avoid two agents
editing the same lines or running competing builds against one checkout.

The production release script is tied to `/var/www/airradar`, service state,
locks, migrations, and health checks; do not run it from a development
worktree. A release is never an implicit development or documentation step.

## Safe changes

Do not replace SSE with WebSockets, introduce another state store/worker, or
reset/recreate a production database without a concrete requirement and
review. Database schema changes require both the contract and a forward
migration. Provider/enrichment changes must preserve best-effort isolation,
bounded caches/concurrency, and the live polling path.
