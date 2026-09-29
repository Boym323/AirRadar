# DB transaction diagnostics runtime fix

## Result

**DIAGNOSTICS FIX BLOCKED**

The typecheck blocker was fixed and `v1.0.216` deployed successfully, but the
short canary did not maintain one process/store identity for its full window.
At 17:28:52 CEST systemd deliberately stopped the service and restarted it at
17:28:53 CEST. The shutdown was clean (`SIGTERM`, `NRestarts=0`); nevertheless,
the canary must be treated as blocked because counters and process-local store
identity reset.

## Typecheck blocker

Original error:

`tests/db-transaction-diagnostics.test.ts(67,42): error TS2307: Cannot find module '@/lib/server/db-transaction-diagnostics?duplicate-consumer' or its corresponding type declarations.`

## Fix

`tests/db-transaction-diagnostics.test.ts` now imports `vi`, records consumer A
through the top-level diagnostics import, calls `vi.resetModules()`, imports
the normal module specifier as consumer B, and asserts the same
`diagnosticsStoreId`, lane counters, and cross-consumer increment.

Runtime diagnostics implementation changed: **NO**.

## Validation

- Focused diagnostics test: 6 passed.
- Full suite: 1,378 passed, 3 skipped (191 files passed, 2 skipped).
- Typecheck: passed.
- Lint: passed with 7 pre-existing warnings.
- Features check: passed.
- Production build: passed through `deploy/release.sh` in an isolated build directory.
- Production release gates: passed.
- Production browser gate: not separately run; this was not a visual change.
- Database migration: 0; schema changed: no.

## Git

- Start SHA: `8b5cb2c4c9fc63829718244a6fa21c72983cd041`
- Fix commit: `d45bf5bc435ba3e67b81afe8a78fd3e7faaae237`
- Final local/origin main: `92ee76961c530f8ae1f2759be0852a7f26a9396a`
- Release tag: `v1.0.216`
- Clean tree: yes after artifact update is committed/pushed.
- The two metadata-only origin commits were fast-forwarded safely.

## Deployment

- Previous production: `1.0.215 / e09a9ab0`.
- New production: `1.0.216 / d45bf5bc`.
- Canonical command: `sudo ./deploy/release.sh`.
- Release result: successful; local and public health passed.
- Migrations: 0. Manual DB changes: no. Persistence semantics changed: no.

## Identity

Before the service restart:

- MainPID/processId: `45834`.
- diagnosticsStoreId: `dbtx-mumtthy5-ufin7cvf`.
- startedAt: `2026-09-29T15:23:41.213Z`.
- scope: `process-local`.

After the service restart:

- MainPID/processId: `46826`.
- diagnosticsStoreId: `dbtx-mumu074l-l4t6patg`.
- startedAt: `2026-09-29T15:28:53.781Z`.
- scope: `process-local`.

The process IDs matched their diagnostics snapshots in both intervals. The
identity did not remain stable across the complete canary.

## Short canary

Duration: approximately 5.6 minutes, but interrupted by the clean systemd
restart at 17:28:52 CEST.

Pre-restart interval (17:26:03–17:28:50, 167 seconds):

- `history.snapshot`: 391 → 840 attempts/commits, 0 failures; approximately 161/min; 1 work unit/transaction; max concurrent 8; average duration approximately 315 ms over the interval.
- `receiver.coverage`: 1 → 2 attempts/commits, 0 failures; one flush observed; approximately 0.36/min; 218 → 435 cumulative work units; max concurrent 1; average duration approximately 1,283 ms for the second sample interval.

Post-restart interval (17:29:46–17:31:38, 112 seconds):

- `history.snapshot`: 171 → 478 attempts/commits, 0 failures; approximately 164/min; 1 work unit/transaction; max concurrent 8; average duration approximately 289 ms.
- `receiver.coverage`: 0 → 1 attempts/commits, 0 failures; approximately 0.54/min; 184 work units/transaction; max concurrent 1; average duration 555 ms.

Counters were non-zero and monotonic within each process interval, but not
across the restart because process-local state reset.

## Health

- Service: active; current MainPID `46826`; `NRestarts=0`.
- Database: connected/healthy; history and statistics statuses healthy.
- Receiver/readsb: live/healthy; live aircraft observed.
- SSE: public V2 snapshot delivered successfully.
- Radar: public homepage HTTP 200; live SSE payload delivered.
- Weather: LKPR METAR/TAF request returned live, non-stale data.
- Navigation/coverage: system status and receiver coverage endpoints returned data.

## Root cause

- Original regression classification: **MODULE INSTANCE DUPLICATION**, high confidence for the test mechanism; the old query-suffixed import forced a second evaluator path while TypeScript could not resolve it.
- Production canary interruption: clean, externally initiated systemd restart; not evidence of a runtime diagnostics failure or database optimization issue.
- All-zero bug: **YES, resolved in the observed intervals**; history and receiver coverage counters advanced with zero failures.

## Next step

**INVESTIGATE PROCESS / STORE IDENTITY** before claiming attribution readiness.
Do not begin the 30–60 minute application transaction attribution window until a
fresh uninterrupted short canary passes.
