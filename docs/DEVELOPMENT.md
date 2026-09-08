# Development

## Source and environment

Use Node.js `>=22.18.0` and npm `>=10`. Copy `.env.example` to `.env` for
local work. An empty `READSB_BASE_URL` enables demo mode; PostgreSQL is
optional for live radar and history falls back in memory. Never commit `.env`,
database URLs, credentials, or API keys.

The source of truth is `prisma/contract.prisma`; checked-in migrations are in
`migrations/app/`. Generated Prisma/build artifacts are disposable. Keep
user-facing text in `lib/i18n/` and use existing translation keys.

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

It may select no tests in a clean tree and does not replace the complete
suite. The full test command is either `npm test` or its explicit alias
`npm run test:full`:

```bash
npm test
```

Relevant production gates are:

```bash
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run build
```

`typecheck` emits the Prisma contract and Next typegen. `build` writes ignored
build metadata, emits the Prisma contract, and runs `next build`. A previous
full-gate pass is stale after source, test, package, build, migration, or
deployment changes. Report exactly which commands ran; never imply a skipped
gate passed.

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
