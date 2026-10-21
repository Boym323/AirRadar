# V1 archive preflight — 2026-10-21

**Status: NO-GO for final archival.** Maintenance-only is the target policy, not a verified release result. No production deploy, database write, service restart, repository archival, or main push was performed by this documentation preparation.

## Ownership and successor

- Reference application: [AirRadar V1](https://github.com/Boym323/AirRadar), with production data and existing release workflow retained.
- Independent successor: [AirRadarV2](https://github.com/Boym323/AirRadarV2). V2 uses its own infrastructure and source; no V1 migrations or automatic cutover.
- V1 accepts only verified bug/security fixes and minimal operation-critical documentation. New features and broad refactors belong in V2.

## Evidence at inspection time

- Inspected V1 main commit: `7b7624d3bb83509050863a4f3c64e8b324b5dfb5` (2026-10-21).
- The last observed successful main CI was for `53f137d8`; this is **not** release certification for the inspected head.
- T58 soak runs [#39633253019](https://github.com/Boym323/AirRadar/actions/runs/39633253019) and [#39649188552](https://github.com/Boym323/AirRadar/actions/runs/39649188552) failed during authenticated telemetry preflight before collecting samples. The logs do not establish whether a token mismatch or a downstream projection check caused the failure.
- [PR #1100](https://github.com/Boym323/AirRadar/pull/1100) contains substantial corrective code but is **not** merged or production validated. Its CI failed the Czech documentation parity gate, and its recorded browser gate reports MapLibre symbol-worker exceptions.
- [PR #1101](https://github.com/Boym323/AirRadar/pull/1101) targets previous V2 rewrite tasks and must **not** be automatically merged into the frozen V1.
- Prisma production schema mapping and real database-backed worker contention/recovery evidence remain unavailable in the PR #1100 audit report.
- A separate English V2 greenfield brief was introduced without its Czech counterpart; the documentation parity gate remains a known baseline blocker until that is resolved.

## Required gates before final V1 freeze

1. Resolve the exact T58 authenticated preflight failure without disabling authorization. Collect a comparable valid, read-only production baseline.
2. Reconcile or close open PRs deliberately; verify MapLibre browser smoke and desktop/mobile interactions on the exact intended V1 release SHA.
3. Verify `npm ci`, production dependency audit, Prisma mapping and rollback evidence, lint, TypeScript, unit/integration tests, feature registry, localized docs, visual checks, CodeQL, and production gates. Validate retained user-visible capabilities.
4. Publish and verify one pinned, rollback-ready final release using the documented procedure only with explicit operator authorization. Back up and retain historical database data. Verify health, readsb, SSE, asset loading, map, and process logs.
5. Record the validated commit/tag, test evidence, recovery instructions, and final decision. Only **after** release/rollback evidence is complete may GitHub's archived/read-only flag be set; keep links and documentation accessible.

**Safety:** A push of application code to V1 `main` can trigger an automatic production deployment. Work from an isolated branch until release gates are green. This preflight report is not a test pass or deployment authorization.
