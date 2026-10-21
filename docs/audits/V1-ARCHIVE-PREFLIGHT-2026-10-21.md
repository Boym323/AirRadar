# V1 archive preflight — 2026-10-21

**Status: NO-GO for final archival.** Maintenance-only is the target policy, not a verified release result. No production deploy, database write, service restart, repository archival, or main push was performed by this documentation preparation.

## Ownership and successor

- Reference application: [AirRadar V1](https://github.com/Boym323/AirRadar), with production data and existing release workflow retained.
- Independent successor: [AirRadarV2](https://github.com/Boym323/AirRadarV2). V2 uses its own infrastructure and source; no V1 migrations or automatic cutover.
- V1 accepts only verified bug/security fixes and minimal operation-critical documentation. New features and broad refactors belong in V2.

## Evidence at inspection time

- Current V1 main after documentation freeze: `d95351f4642d965657a92de2638d96a081a9aaa9`. [Main CI #39667409657](https://github.com/Boym323/AirRadar/actions/runs/39667409657) succeeded, with production deployment correctly skipped for documentation-only changes.
- T58 soak runs [#39633253019](https://github.com/Boym323/AirRadar/actions/runs/39633253019) and [#39649188552](https://github.com/Boym323/AirRadar/actions/runs/39649188552) failed authenticated telemetry preflight before collecting samples. Whether authentication or the downstream diagnostic projection caused this remains **NOT VERIFIED**.
- The original remediation [PR #1100](https://github.com/Boym323/AirRadar/pull/1100) has been superseded and closed without merging. Its 41 non-duplicate file changes were re-staged on current main in draft [PR #1104](https://github.com/Boym323/AirRadar/pull/1104). No runtime changes have been merged or deployed.
- [Release-preview #39668562558](https://github.com/Boym323/AirRadar/actions/runs/39668562558) passed full release validation including production core/browser gates, release tests/typecheck and performance on candidate `9ac7acc0`. The independent CodeQL and runtime load scaling checks also succeeded. The earlier local MapLibre worker failure has **not** been reproduced by this CI browser run; live production parity is still unproven.
- Previous in-V1 V2 rewrite [PR #1101](https://github.com/Boym323/AirRadar/pull/1101) and unsupported Prisma RC dependency upgrade [PR #1045](https://github.com/Boym323/AirRadar/pull/1045) were closed unmerged. New development belongs solely in AirRadarV2.
- Prisma production catalog mapping, valid rollback/recovery rehearsal and real PostgreSQL-backed delivery worker contention remain **NOT VERIFIED**. Automated static tests do not replace these operational checks.
- Previously missing Czech documentation pages have been added, and the documentation localization check succeeded. Remaining gates and ownership are tracked in [issue #1103](https://github.com/Boym323/AirRadar/issues/1103).

## Required gates before final V1 freeze

1. Resolve the exact T58 authenticated preflight failure without disabling authorization. Collect a comparable valid, read-only production baseline.
2. Reconcile or close open PRs deliberately; verify MapLibre browser smoke and desktop/mobile interactions on the exact intended V1 release SHA.
3. Verify `npm ci`, production dependency audit, Prisma mapping and rollback evidence, lint, TypeScript, unit/integration tests, feature registry, localized docs, visual checks, CodeQL, and production gates. Validate retained user-visible capabilities.
4. Publish and verify one pinned, rollback-ready final release using the documented procedure only with explicit operator authorization. Back up and retain historical database data. Verify health, readsb, SSE, asset loading, map, and process logs.
5. Record the validated commit/tag, test evidence, recovery instructions, and final decision. Only **after** release/rollback evidence is complete may GitHub's archived/read-only flag be set; keep links and documentation accessible.

**Safety:** A push of application code to V1 `main` can trigger an automatic production deployment. Work from an isolated branch until release gates are green. This preflight report is not a test pass or deployment authorization.
