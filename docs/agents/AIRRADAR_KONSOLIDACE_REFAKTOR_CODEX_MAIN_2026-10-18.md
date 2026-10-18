# AirRadar — consolidation and refactor on `main`

[Česky — full implementation brief](../cs/agents/AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md)

**Date:** 18 October 2026  
**Project:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar)  
**Production:** https://airradar.pomykal.cz  
**Authority:** Task-specific plan; defer to [AGENTS.md](../../AGENTS.md),
[development](../DEVELOPMENT.md) and [release](../RELEASE.md).

## Objective and evidence

Reduce unnecessary code and operational overhead based on real
KEEP / DELETE / MERGE / DEFER analysis, not file size or guesses. Before
removing any module, inspect the static and dynamic consumers, routes, tests,
workflow/release paths, external URLs, migration and rollback requirements.
Compare CPU/RSS/event-loop percentiles and browser behavior before/after
where performance is the reason for refactoring. Clearly distinguish
historic data from fresh production observations.

## Direct-main development and production deployment

Work in a **separate non-serving checkout on `main`**. Do not create routine
branches or PRs. Serialize edits and pushes through one agent. Use small
tested commits with clean diffs; check upstream head and
`scripts/release-scope.mjs` before each non-force push. Run relevant
lint/typecheck/tests/docs/features/browser/performance checks **before**
pushing. A push to `main` can automatically build and deploy through
GitHub Actions; monitor its CI/CodeQL/release/deploy results for the exact
SHA before pushing another deploy-bearing commit.

Never build in the live `/var/www/airradar` checkout, change production
secrets, restart services manually or destructively migrate the database
under routine development authorization.

## Public diagnostics and private mutations

Sanitized read-only GET diagnostics such as `/api/system/status`,
`/api/system/integrations` and bounded performance telemetry are
**intentionally public** for development. Return explicit safe projections
only: no secrets, cookies, database URLs, raw upstream errors,
private host identifiers or exact receiver coordinates.
**All watchlist, alert, config and admin mutations must be authenticated
and authorized independently of diagnostic GET access.** Add regression
tests confirming safe anonymous GET and rejected anonymous writes.
Do not merge [PR #1017](https://github.com/Boym323/AirRadar/pull/1017)
unchanged; it would gate public diagnostics. Reapply independently safe
fixes on current `main` with tests when useful.

## Order of consolidation

1. Capture current source/production commit identities and baseline.
2. Remove provably unused legacy adapters and archive-only inputs without
   dropping migration history, rollback requirements or live state.
3. Refactor the oversized radar UI/map lifecycle and CSS with responsive
   browser and SSE/map ownership tests.
4. Refactor aircraft-state, history and status orchestration, preserving
   the single readsb → RAM → SSE state owner and native Rust BEAST/CRC parity.
5. Evaluate Track Fusion, Operational Twin and optional providers by actual
   measured value and resource cost before removal.
6. Consolidate CI/config only if mandatory quality and release gates remain.

Record checks as PASS/FAIL/NOT RUN, show SHA on `main`, CI/CodeQL status,
and the *deployed* commit/version only when verified. Stop subsequent
pushes on failure; no force-push, blind rollback or destructive DB repair.

The linked Czech brief contains the complete candidate inventory and
detailed Codex instructions.
