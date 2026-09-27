# Paralelní postup Intelligence roadmap

Baseline: `main` na `a39c977e` (origin/main, 2026-09-27). Backend streamy
A–D a UI streamy E–G jsou ověřeně sloučené do main na GitHubu.

| Stream | Branch | Worktree | PR | Závislosti | Riziko konfliktu | Stav |
|---|---|---|---|---|---|---|
| A — Flight Intelligence V2 stage 2 | `feat/flight-intelligence-v2-stage2` | `../airradar-flight-intelligence-v2-stage2` | [#147](https://github.com/Boym323/AirRadar/pull/147) | sloučeno | střední: existující detector, izolovaný na flight intelligence | sloučeno do main; capability verified |
| B — ATC Intelligence | `feat/atc-intelligence-v2` | `../airradar-atc-intelligence-v2` | [#148](https://github.com/Boym323/AirRadar/pull/148) | sloučeno | nízké: nový ATC context helper | sloučeno do main; capability verified |
| C — Weather Intelligence | `feat/weather-intelligence` | `../airradar-weather-intelligence` | [#145](https://github.com/Boym323/AirRadar/pull/145) | sloučeno | nízké: nový weather helper | sloučeno do main; capability verified |
| D — Receiver / Data Quality | `feat/receiver-quality-dashboard` | `../airradar-receiver-quality-dashboard` | [#146](https://github.com/Boym323/AirRadar/pull/146) | sloučeno | střední: aditivní system-status field | sloučeno do main; capability verified |

## Audit orchestrace UI vlny

| Stream | Pravděpodobné soubory | Sdílené kontrakty | Závislosti | Riziko konfliktu |
|---|---|---|---|---|
| E — Aircraft Detail V2 | `components/aircraft-radar-quick-detail.tsx`, `app/radar-aircraft-panel.css`, `lib/i18n/` | `AircraftView`, flight intelligence, ATC/weather read models | sloučené A–D; existující selected-aircraft wiring | střední: selected panel je sdílená render boundary |
| F — Alerting V2 | `lib/server/alert-engine.ts`, `lib/server/alert-history.ts`, `lib/server/alert-notifier.ts`, alert testy | alert history/notifier payload, intelligence events | sloučené A–D; existující alert queue/state | nízké: izolovaná server doména; vyhnout se UI změnám |
| G — Time Machine V2 | `components/time-machine.tsx`, `lib/server/time-machine.ts`, `lib/time-machine/` | persistovaný `FlightEvent`, historical track, global map time | sloučené A–D; existující playback/context API | střední: event envelope a map-time synchronizace |

Větve vlny byly vytvořeny z tehdy identického aktuálního commitu `origin/main`.
Neplánuje se breaking change intelligence event envelope, timestamp semantics
ani layoutu sdílených adresářů.

## Postup UI vlny

| Stream | Branch | PR | Lokální testy | GitHub CI | Konflikt | Stav |
|---|---|---|---|---|---|---|
| E — Aircraft Detail V2 | `feat/aircraft-detail-v2` | [#151](https://github.com/Boym323/AirRadar/pull/151) | sloučeno; capability verified | sloučeno | střední | sloučeno do main |
| F — Alerting V2 | `feat/alerting-v2` | [#152](https://github.com/Boym323/AirRadar/pull/152) | sloučeno; capability verified | sloučeno | nízké | sloučeno do main |
| G — Time Machine V2 | `feat/time-machine-v2` | [#153](https://github.com/Boym323/AirRadar/pull/153) | sloučeno; capability verified | sloučeno | střední | sloučeno do main |
| H — Rendering / Performance Polish V2 | `perf/rendering-polish-v2` | [#158](https://github.com/Boym323/AirRadar/pull/158) | typecheck, 177/177 souborů (1204), production/browser gates, radar perf 100/500/1000 | pending | střední: WebGL a marker parity boundary | implementace hotová; review pending |

Route Intelligence zůstává mimo scope.
