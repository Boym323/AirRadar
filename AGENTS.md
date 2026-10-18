# AirRadar agent index

AirRadar is a Next.js/TypeScript ADS-B radar. Before working, read this file
and then only the linked document(s) relevant to the task. Do not
automatically read the whole `docs/` tree. Verify the current implementation
in `app/`, `components/`, `lib/`, `scripts/`, `deploy/`, and `prisma/` before
writing or changing documentation.

## Context budget and navigation

- Use the [task-to-document router](docs/CODEX-CONTEXT.md) and the
  [agent index](docs/agents/README.md) to find **only** relevant files.
  Read specific sections, tests and symbols; never preload all documentation
  or all task prompts.
- Reports in `artifacts/`, `docs/audits/` and dated performance files are
  historical evidence, not proof of the current production state.
- Search `CHANGELOG.md` and generated `docs/FEATURES.md` selectively.
  Record durable rationale in [ADRs](docs/decisions/README.md), rather than
  repeating historical task briefs.
- Before handing off a PR, consider [documentation impact
  advisories](docs/operations/RUNBOOKS.md). They are heuristic; still run
  `npm run docs:check` and relevant feature checks.

## Authoritative documentation

- [Architecture](docs/ARCHITECTURE.md) — ownership and component boundaries
- [Data flows](docs/DATA-FLOWS.md) — live, history, statistics, enrichment
- [Runtime invariants](docs/RUNTIME-INVARIANTS.md) — rules that must not break
- [Development](docs/DEVELOPMENT.md) — tests, worktrees, and agent parallelism
- [Release](docs/RELEASE.md) — authoritative production release procedure
- [Data sources](docs/DATA-SOURCES.md) — provenance, security, and licensing
- [Features](docs/FEATURES.md) — current routes/API and production status
- [Feature registry](docs/features.registry.json) — canonical feature ownership for pages/APIs and changelog scopes
- [Visual system](docs/VISUAL-SYSTEM.md) — UI tokens, primitives, style budget, and visual-smoke artifacts

## Non-negotiable rules

- ICAO hex is aircraft identity; callsign is an observation. Live state and
  the single `AircraftStateService` poller stay in one Node process.
- The live path is `readsb → RAM → SSE`; PostgreSQL receives sampled history,
  reference/catalog data, and aggregated daily statistics. Database and
  optional enrichment failures must not stop live radar.
- `/api/stream` is SSE, not WebSocket. Delivery stays bounded/coalesced and
  heartbeat behavior must be preserved. Public serialization must not leak
  secrets, raw provider errors, or exact receiver coordinates by default.
- ATC results are probable position/altitude/time matches, never proof of the
  aircraft's tuned frequency. Sample ATC is demo-only unless explicitly
  enabled; production data is imported and provenance is retained.
- Never run `npm run build` directly in the live `/var/www/airradar` checkout
  while `airradar.service` is serving traffic. Replacing shared `.next`
  files behind an already running Next.js process can mix build manifests and
  static assets, leaving the UI unstyled and non-interactive. Production
  builds go through `deploy/release.sh`; visual changes additionally require
  the desktop/mobile browser gate and a post-restart public UI smoke check.
- Do not reset or destructively migrate a production database. Do not run a
  release unless the user explicitly requests it; follow `docs/RELEASE.md`.
- Keep user-facing strings in `lib/i18n/`; established aviation terms remain
  technical terms. Documentation and source code are English.
- Every new, removed, or renamed Next.js page/API route must update
  `docs/features.registry.json` and regenerate `docs/FEATURES.md` with
  `npm run features:generate`; CI requires `npm run features:check` to pass.
- Visual changes must reuse `components/ui-primitives.tsx` and semantic tokens
  where practical, must not increase the visual debt budget, and must pass
  `npm run visual:check` plus the production desktop/mobile browser gate.
- The authoritative documentation has a Czech localization in `docs/cs/`.
  Documentation changes must update the corresponding Czech page when one
  exists, and new authoritative documents must add both language links.

- Follow the agent decision boundaries and performance evidence protocol in
  `docs/DEVELOPMENT.md`: use an isolated branch/PR, report exactly which checks
  ran, compare measured tails before/after optimization, and never equate a
  successful microbenchmark with proven production improvement.
- Do not merge or push directly to `main`, enable auto-merge, bypass failing
  checks, or modify production configuration/services without explicit user
  authorization. A merge into `main` can trigger automated deployment;
  verify the complete diff with `scripts/release-scope.mjs` first. This rule
  complements the manual-release restrictions in `docs/RELEASE.md`.

`README.md` is the human-facing entry point. The documents above are the
compact agent context; update `AGENTS.md` only when a durable rule or source
of truth changes.
