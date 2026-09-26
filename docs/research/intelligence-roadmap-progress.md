# Intelligence roadmap parallel progress

Baseline: `main` at `f71483bf` (PR #141 is already merged into this baseline).
All four backend streams started from that same commit and remained independent.

| Stream | Branch | Worktree | PR | Dependencies | Conflict risk | Status |
|---|---|---|---|---|---|---|
| A — Flight Intelligence V2 stage 2 | `feat/flight-intelligence-v2-stage2` | `../airradar-flight-intelligence-v2-stage2` | [#147](https://github.com/Boym323/AirRadar/pull/147) | merged stage 1 in `main` | medium: existing detector, isolated to flight intelligence | local gates passed; GitHub CI pending |
| B — ATC Intelligence | `feat/atc-intelligence-v2` | `../airradar-atc-intelligence-v2` | [#148](https://github.com/Boym323/AirRadar/pull/148) | none | low: new ATC context helper | local gates passed; GitHub CI pending |
| C — Weather Intelligence | `feat/weather-intelligence` | `../airradar-weather-intelligence` | [#145](https://github.com/Boym323/AirRadar/pull/145) | none | low: new weather helper | local gates passed; GitHub CI pending |
| D — Receiver / Data Quality | `feat/receiver-quality-dashboard` | `../airradar-receiver-quality-dashboard` | [#146](https://github.com/Boym323/AirRadar/pull/146) | none | medium: additive system-status field | local gates passed; GitHub CI pending |

The later UI streams E–H were not started because the requested integration
barrier requires backend stream merges first. Route Intelligence remains out of
scope.
