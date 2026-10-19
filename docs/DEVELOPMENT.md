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
to force it to pass. `npm run test:changed` selects tests affected by the diff and may select
none in a clean tree. `npm test` runs the complete suite (`vitest run`), as
does `npm run test:full`:

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

## Runtime measurement and soak evidence

`npm run benchmark:runtime-instrumentation` measures the synchronous recorder
with a numeric count and a result counter, using synthetic work only. Treat
the output as overhead evidence for the current Node/runtime, not a production
speed claim. Metric storage is bounded and diagnostic names/counters are
allowlisted; do not add payloads, aircraft identity, or provider data to it.

The T5.7 read-only sampler polls sanitized system/runtime diagnostics. Each
sample carries a timestamp, deployed commit/version, and a one-way process
identity. PID and internal diagnostics IDs remain out of reports. Process,
commit, or version changes start a distinct segment; trends use one segment at
a time. Missing samples and timestamp gaps are reported and prevent a
continuous-soak PASS. The sampler performs no build, restart, database write,
live SSE subscription, forced GC, or heap snapshot.

`.github/workflows/t57-24-hour-soak.yml` runs only by explicit
`workflow_dispatch` after the workflow is present on the default branch. It
divides the 24-hour window into sequential
hosted jobs below the runner's per-job limit and hands off a sanitized journal
artifact at each boundary. Each chunk has a bounded two-minute poll cadence;
handoff delays are recorded as missing intervals. To resume a failed run,
dispatch the workflow with its prior run ID, attempt, chunk number, and pinned
production commit from that run's summary. The sampler itself remains read-only.

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

The radar visual browser gate requires the `style.load` lifecycle event and
non-empty rendered vector source-layer features. Do not gate vector map evidence
on `map.isStyleLoaded()` alone: MapLibre can report false while optional remote
raster/DEM tile managers are still loading, even when the vector basemap is
visibly rendered. The gate still fails if the style never initializes or the
vector map is blank. During the repeated browser viewport sweep, HTTP 429 from
optional `/api/aircraft/communications/waypoints` RXW badge enrichment or
`/api/aircraft/[hex]/communications` RXW metadata may be
logged as expected throttling; unexpected API failures remain blocking.



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
separate worktree by default; for the explicitly authorized single-checkout
workflow, edit tracked source in `/var/www/airradar` but let CI create
the independent, validated build artifact and use `deploy/release.sh`
for atomic activation. Never replace the serving `.next` directly.

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

## Main, development checkouts, and parallel agents

The maintainer selects **small, verified direct commits to `main`** as the
standard workflow; do not create new task branches or PRs routinely.
The normal default is a **separate, non-serving development checkout**.
For the maintainer-authorized single-checkout assignment dated 2026-10-19,
edit tracked source directly in the canonical `/var/www/airradar` checkout
on `main`; no persistent alternate worktrees, task branches or PRs.
This exception changes **source-edit location only**, not the rule against
building into the live `.next`, reinstalling runtime dependencies, or
writing test data to the production database. Always inspect `git status`,
use fast-forward-only upstream synchronization and preserve unrelated work.
One agent owns the checkout and all pushes; pause source edits during any
automated production deploy and keep the checkout clean for deployment
preflight. The validated CI artifact and release script still use necessary
short-lived isolated build folders to atomically activate the new release.
See [the task-specific instructions](agents/CODEX-DIRECT-MAIN-PRODUCTION-2026-10-19.md).

The production release script remains tied to its canonical checkout,
locks, service and migrations. Do not bypass the existing CI/CD pipeline.

## Agent autonomy, direct-main commits, and production boundaries

A routine development instruction now authorizes tested non-force pushes to
`main` and the repository's existing automatic CI/CD, but it does **not**
authorize manual deploy/restart, production configuration/secrets changes,
destructive DB actions, provider activation, bypassing checks, or rewriting
shared history.

1. Analyze the current code, CI, privacy-safe runtime evidence and exact SHA.
2. Implement one coherent change directly on `main` in the selected
   checkout (the canonical production checkout for the explicitly authorized
   single-checkout task), keeping the serving build intact. Add targeted
   regression tests and matching EN/CZ documentation.
3. Before pushing, confirm `origin/main` is current, review the complete diff,
   run relevant lint/typecheck/full or targeted tests, docs/features and
   browser/performance gates for impacted paths. Determine deployment scope
   with `scripts/release-scope.mjs`. Never push known failures.
4. Push exactly the validated changes without force. A push to `main` can
   start automatic production release immediately. Monitor CI, CodeQL,
   release-validation/performance and deploy for the precise SHA before
   publishing another deploy-bearing commit.
5. If CI or release fails, stop; inspect evidence and prepare a **new**
   verified corrective commit. Do not auto-revert database migrations.

Public, sanitized **GET** system-status, integration and bounded performance
diagnostics must remain available without administrator login to aid
development. Serve only an explicitly safe DTO: no passwords, tokens,
cookies, database URLs, raw provider failures, private host identifiers or
exact receiver coordinates. This does **not** authorize mutations.
Watchlist, alerts and configuration writes must require independent
authorization even with a legacy admin-auth opt-out; cover both public
GET redaction and rejected anonymous POST/PATCH/PUT/DELETE in tests.
Do not merge [PR #1017](https://github.com/Boym323/AirRadar/pull/1017)
unchanged: its production session requirement would gate public diagnostics.

Report exact changes, checks that did/did not run, performance measurements
and limitations, `main` SHA, CI/CodeQL, deploy state and production SHA
only when directly verified. Successful local tests are not deployment proof.

## Main-branch protection policy

Prohibit force pushes and deletion where possible; do not require routine
PRs for maintainer-controlled direct-main work. CI runs *after* direct
pushes and can block deployment, but cannot erase the commit from `main`:
pre-push checks and single-writer discipline are essential. Verify
actual GitHub rules before claiming they are enforced.

## Performance optimization evidence

For performance, reliability, native/Rust, SSE, ingestion, or memory changes,
follow this protocol before claiming an improvement:

1. State the suspected bottleneck, affected path, measured symptom, acceptance
   metric, and rollback trigger. Do not treat correlation as proven causation.
2. Capture a baseline and candidate under comparable workloads, build modes,
   flags, host/runner conditions, and durations. Record exact commits, sample
   counts, scenario/input size, and raw artifact/CI links. Clearly distinguish
   synthetic benchmarks, read-only production observation, and production
   canaries.
3. For backend hot paths report relevant throughput/CPU, event-loop lag and
   utilization, P50/P95/P99 and maximum stalls where sample counts permit,
   RSS/heap/external memory, GC pauses, cgroup CPU throttling, queue/backpressure
   depth, and SSE freshness. An improvement in the mean must not hide a worse
   tail; do not claim P99 or statistical significance from insufficient data.
4. Re-check live-path invariants, bounded state/queues, error isolation,
   single-poller ownership, fallback/feature-OFF behavior, and compatibility
   with consumers. For native code, include JS/native parity, addon absence or
   failure fallback, startup/ABI handling, memory cost, and FFI overhead.
5. Run targeted regressions and relevant CI gates, then propose a bounded
   OFF-to-ON canary/T58 verification only when authorized. Compare against the
   same acceptance criteria; stop or roll back on a measured regression. Do not
   enable production flags, restart services, or run intrusive load tests as
   part of routine investigation.

If attribution remains uncertain, submit bounded diagnostics and a measurement
plan rather than an unverified "fixed" claim. Expose only sanitized, bounded
telemetry; do not publish secrets, aircraft/receiver private positions, or
provider raw payloads.

## Safe changes

Do not replace SSE with WebSockets, introduce another state store/worker, or
reset/recreate a production database without a concrete requirement and
review. Database schema changes require both the contract and a forward
migration. Provider/enrichment changes must preserve best-effort isolation,
bounded caches/concurrency, and the live polling path.

## Security CSP and Prisma RC preflight

### Opt-in strict script nonce on the dynamic system page

The existing `/system` route is `force-dynamic`. The optional Next 16
`proxy.ts` is restricted to exactly that route. By default
`AIRRADAR_STRICT_CSP_SYSTEM_ENABLED` is absent/false: all public pages and
`/system` retain the global `next.config.ts` policy. To experiment on
**DEV only**, set `AIRRADAR_STRICT_CSP_SYSTEM_ENABLED=true`, restart the
DEV app and inspect browser console, loading of chunks/styles, client-side
navigation and the system SSE/event panels. It sets a cryptographically random
128-bit nonce for each HTML request and delivers the same CSP nonce to
Next's request header and response. It removes `unsafe-inline` from
**script-src** only; style-src still needs separate migration. Never enable
globally or in production based on source-level tests alone.

Verify the actual HTTP response, not just `next.config.ts`:

```bash
npm run ops:audit:headers -- --origin http://127.0.0.1:3000 --require-hardened --require-nonce
```

The read-only check verifies same-origin geolocation permission, object/frame
blocking, script nonce enforcement and uniqueness across requests. The
`--require-nonce` flag is only for an explicitly enabled nonced DEV /system.
After staging the combined changes to a test environment, also run the
desktop/mobile browser gate with the flag enabled and verify there are no
script CSP violations, regressions to /system interactions or increased
render latency. The ordinary radar must remain static and cacheable.

### Prisma ORM 8 release-candidate upgrade approval gate

The repository is pinned to older Prisma 8 RC builds. Newer Prisma 8 RC
versions have changed implicit SQL model/table names. Do **not** just bump
versions and run `prisma:deploy` against production. Run the read-only
preflight first:

```bash
npm run prisma:upgrade:preflight -- --print-candidates
# On the restored DEV PostgreSQL instance only:
psql "$DEV_DATABASE_URL" -Atqc "SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json) FROM pg_catalog.pg_tables WHERE schemaname='public';" > /tmp/airradar-dev-table-catalog.json
npm run prisma:upgrade:preflight -- --catalog-json /tmp/airradar-dev-table-catalog.json --require-safe
```

Unmapped model names and an absent catalog **must fail** the `--require-safe`
gate. Legacy name candidates are not proof; confirm each physical table and
generate verified `@@map` mappings on a dedicated upgrade branch, then
validate contract output, migration diff, the complete test suite and actual
read/write queries against restored DEV data. Upgrade Prisma CLI and runtime
together using their individually published compatible versions. Apply no
destructive migration or production change as part of this preflight.
