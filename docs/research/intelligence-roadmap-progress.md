# Intelligence roadmap parallel progress

Baseline: `main` at `3a1f3b61` (origin/main, 2026-09-27). The four backend
streams are verified merged into main: PRs #147, #148, #145, and #146 are
closed with `merged=true` on GitHub.

| Stream | Branch | Worktree | PR | Dependencies | Conflict risk | Status |
|---|---|---|---|---|---|---|
| A — Flight Intelligence V2 stage 2 | `feat/flight-intelligence-v2-stage2` | `../airradar-flight-intelligence-v2-stage2` | [#147](https://github.com/Boym323/AirRadar/pull/147) | merged | medium: existing detector, isolated to flight intelligence | merged into main; capability verified |
| B — ATC Intelligence | `feat/atc-intelligence-v2` | `../airradar-atc-intelligence-v2` | [#148](https://github.com/Boym323/AirRadar/pull/148) | merged | low: new ATC context helper | merged into main; capability verified |
| C — Weather Intelligence | `feat/weather-intelligence` | `../airradar-weather-intelligence` | [#145](https://github.com/Boym323/AirRadar/pull/145) | merged | low: new weather helper | merged into main; capability verified |
| D — Receiver / Data Quality | `feat/receiver-quality-dashboard` | `../airradar-receiver-quality-dashboard` | [#146](https://github.com/Boym323/AirRadar/pull/146) | merged | medium: additive system-status field | merged into main; capability verified |

## UI wave orchestration audit

| Stream | Likely files | Shared contracts | Dependencies | Conflict risk |
|---|---|---|---|---|
| E — Aircraft Detail V2 | `components/aircraft-radar-quick-detail.tsx`, `app/radar-aircraft-panel.css`, `lib/i18n/` | `AircraftView`, flight intelligence, ATC/weather read models | merged A–D; existing selected-aircraft wiring | medium: selected panel is a shared render boundary |
| F — Alerting V2 | `lib/server/alert-engine.ts`, `lib/server/alert-history.ts`, `lib/server/alert-notifier.ts`, alert tests | alert history/notifier payload, intelligence events | merged A–D; existing alert queue/state | low: isolated server domain; avoid UI changes |
| G — Time Machine V2 | `components/time-machine.tsx`, `lib/server/time-machine.ts`, `lib/time-machine/` | persisted `FlightEvent`, historical track, global map time | merged A–D; existing playback/context APIs | medium: event envelope and map-time synchronization |

All three wave branches were created from the identical `origin/main` commit
`3a1f3b61`. No breaking change to the intelligence event envelope, timestamp
semantics, or shared directory layout is planned.

The later UI streams E–H were not started because the requested integration
barrier requires backend stream merges first. Route Intelligence remains out of
scope.
