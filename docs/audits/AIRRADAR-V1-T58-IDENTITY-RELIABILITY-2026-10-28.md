# AirRadar V1 T58 identity reliability — 2026-10-28

## Scope

This change addresses the 61-sample T58 run that reported 18 process segments.
It is limited to process-lifetime identity derivation and T58 regression coverage.
It does not enable CPU profiling, force GC, restart production, alter authentication,
or publish PID/internal diagnostic identifiers.

## Finding

The segmentation was a measurement artifact. `lib/server/system-status.ts` derived
`application.startedAt` as `requestNow - uptimeSeconds` for every request. The
wall-clock value therefore changed with normal clock movement and sub-second
rounding even when Node.js remained alive. The public T58 fingerprint in
`scripts/t57-soak-analysis.mjs` hashes `[commit, startedAt]`, so each derived
timestamp looked like a new process.

The fix captures the wall-clock representation of the Node process once at module
initialization (`Date.now() - process.uptime()`). Explicit runtime start times remain
supported, so a real restart still produces a new fingerprint. A commit change also
remains a distinct segment by design.

## Verification

- Repeated status reads and simulated wall-clock movement preserve `startedAt`.
- A changed explicit start time produces a new process fingerprint.
- A changed commit produces a new process fingerprint.
- T58 analysis still keeps restart/commit changes in separate segments.
- Workflow checkpoint resume and token-free public mode are covered by regression tests.
- Targeted Vitest: 42 tests passed.
- T58 workflow contract test: 2 tests passed.
- TypeScript typecheck passed.

## Production interpretation and limitation

The historical run `#40665798048` remains evidence of the old implementation:
61/61 samples and 18 reported segments. It cannot distinguish clock-derived
identity churn from a real restart after the fact. The corrected build must be
deployed and then measured again with the existing read-only T58 workflow.

Expected result for one stable process is one segment. A segment transition after
this fix is evidence of either a real process restart or a commit/version change;
those cases must be investigated separately. Public T58 measures only sanitized
CPU/RSS/event-loop data and does not measure private hot-path attribution, GC,
retention, SQL latency, PID, or internal store identity.
