# AIRRADAR INTELLIGENCE ROADMAP – PARALLEL IMPLEMENTATION REPORT

## Orchestration audit

`main` was fast-forwarded to `f71483bf`, the merge commit containing PR #141.
PR #141 changed the flight-intelligence detector/types, server adapter, i18n,
fixtures, tests, and audit document. ATC, weather, and receiver work started
from clean `main` and did not stack on that feature branch.

| Stream | Branch | Likely touched modules | Dependencies | Conflict risk |
|---|---|---|---|---|
| A | `feat/flight-intelligence-v2-stage2` | `lib/intelligence/*`, flight fixtures/tests | merged stage 1 | medium |
| B | `feat/atc-intelligence-v2` | `lib/atc-context/*`, ATC tests | none | low |
| C | `feat/weather-intelligence` | `lib/weather/*`, weather tests | none | low |
| D | `feat/receiver-quality-dashboard` | receiver quality helper, additive system-status contract | none | medium |

## Capabilities

- A: explicit `GO_AROUND_DETECTED` episode detection with fresh-position,
  low-approach, sustained-climb, airborne, and movement-away guards; event
  metadata contains detection type and reason codes.
- B: bounded forward-ray intersection against published sector polygons with
  boundary distance, groundspeed ETA, stale guard, and ambiguity confidence.
- C: unified `FRESH`/`STALE`/`OFFLINE` weather freshness, nearest METAR,
  wind-component classification, SIGMET inside/proximity/movement relation,
  and bounded around-aircraft summary.
- D: `GOOD`/`DEGRADED`/`OFFLINE` receiver quality, position freshness median/P90,
  available telemetry rates, max-range normalization, bounded coverage buckets,
  and additive system-status exposure.

## Branch and PR results

| Stream | PR | Commit | Tests | Local CI/build | Performance | Status |
|---|---|---|---|---|---|---|
| A | [#147](https://github.com/Boym323/AirRadar/pull/147) | `cac54d5f` | 173 files / 1,185 passed | lint, typecheck, production build passed | bounded existing history; no new I/O | GitHub CI pending |
| B | [#148](https://github.com/Boym323/AirRadar/pull/148) | `5b5d635e` | 173 files / 1,185 passed | lint, typecheck, production build passed | candidate/polygon bounded; no per-frame work | GitHub CI pending |
| C | [#145](https://github.com/Boym323/AirRadar/pull/145) | `ef33cebb` | 173 files / 1,185 passed | lint, typecheck, production build passed | bounded supplied collections; no new requests | GitHub CI pending |
| D | [#146](https://github.com/Boym323/AirRadar/pull/146) | `8cdfd7cc` | 173 files / 1,184 passed | lint, typecheck, production build passed | one snapshot pass; no DB query | GitHub CI pending |

The first build attempt was invalidated by the local test setup using a
symlinked `node_modules`; Turbopack rejects that symlink across worktree roots.
After real per-worktree dependencies were installed, all four production builds
passed. No production release was run.

## Parallelization outcome

A, B, C, and D were audited and implemented in separate worktrees in parallel-
ready branches from the same baseline. No feature branch was merged into
`main`, and no stacked branch was used for B, C, or D. The only shared contract
change is D's optional system-status quality field, so it is additive and does
not change the SSE envelope. The work avoided the main merge-conflict hotspots;
the expected critical-path reduction is the independent backend review/CI
execution, not an assumption that the branches are already integrated.

## Known limitations

- The PRs are not merged; E–H remain behind the integration barrier.
- A intentionally suppresses unknown-airport go-arounds and stays conservative
  around touch-and-go-like trajectories.
- B's new geometry helper is horizontal; the existing ATC context engine owns
  vertical-volume matching.
- C consumes existing/provider-supplied weather collections; it does not add a
  new provider or route predictor.
- D reports null rates when source counters are insufficient and does not invent
  receiver uptime or MLAT telemetry.

## Next recommended work

1. Review and merge A–D independently after GitHub CI completes.
2. Rebase/retest remaining branches after each backend merge.
3. Create the integration checkpoint and verify SSE/system-status contracts.
4. Start E, F, and G from the merged backend baseline.
5. Run H only after the UI contracts stabilize, including radar performance and
   desktop/mobile production gates.
