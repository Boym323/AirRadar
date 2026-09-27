# Rendering / performance audit

Baseline was measured on the production build from `origin/main` at
`a39c977e` with `RADAR_PERF_SCENARIOS=100,500,1000` and a 3-second browser
window. The existing harness exercises synthetic SSE V2 traffic, WebGL
aircraft rendering, label diagnostics, traffic virtualization, and long-task
observation.

| Area | Current behavior | Cost/risk | Evidence | Proposed action |
|---|---|---|---|---|
| Live ingest → React | `useRadarLiveAircraft` keeps refs/change sets and coalesces React snapshots through a bounded scheduler. | Low; a full snapshot still commits immediately. | `components/radar/use-radar-live-aircraft.ts`, `lib/radar/live-snapshot-scheduler.ts`, SSE tests. | Preserve protocol and latest-state-wins semantics. |
| Live ingest → map | Pending changed/removed ICAO sets drive `syncAircraftMap`; bulk and special aircraft are split. | Low/medium; map sync owns several per-change maps and selected-route checks. | `components/airradar-app.tsx`, `lib/radar/live-aircraft-changes.ts`. | Keep change-set path; avoid broad React memoization without evidence. |
| WebGL data render | WebGL rebuilds a typed vertex buffer on dirty/data-frame/bearing changes; motion is interpolated and spatial picking is bucketed. | Typed-array allocation per data render creates avoidable GC pressure at high counts. | `lib/radar/aircraft-webgl-layer.ts`; baseline animation 0.18/0.25/0.97 ms at 100/500/1000. | Reuse a capacity-growing `Float32Array`; keep upload/draw semantics unchanged. |
| WebGL ↔ HTML heading | HTML uses `resolveAircraftVisualHeading`; WebGL applied the same bearing model but had no explicit shared helper. | Future asset offsets could diverge silently. | `lib/radar/aircraft-marker-controller.ts`, WebGL shader/runtime. | Add an explicit WebGL screen-heading helper and parity tests. |
| HTML marker updates | Changed aircraft update only; label text changes invalidate measured dimensions. | Low; selected/watchlist/emergency aircraft intentionally stay HTML. | `lib/radar/aircraft-marker-controller.ts`. | Preserve current ownership and changed-data updates. |
| Collision | Greedy priority order with a 96px spatial grid; selected/emergency are force-visible; route-airport labels are filtered after aircraft labels. | Low/medium; route-airport exclusion is linear in the small selected-route set. | `lib/radar/aircraft-label-collision.ts`, `aircraft-label-controller.ts`; baseline collision ≤0.03 ms in tested bulk scenarios. | Keep grid and priority policy; add regression coverage only. |
| Zoom LOD | Stable thresholds: hidden <6.5, callsign <8.5, altitude <10.5, type thereafter. | Low; no timer-driven flicker, but no explicit hysteresis state. | `lib/aircraft/map-labels.ts`, `tests/map-labels.test.ts`. | Do not add stateful hysteresis without a measured flicker repro. |
| Selected aircraft | Selected aircraft is removed from WebGL bulk, retained as HTML marker, and its bounded selected trail is updated only when trail inputs change. | Low; route/weather/ATC reads are selected-only. | `components/airradar-app.tsx`, `lib/aircraft/trail.ts`. | Preserve reference-keyed trail rebuild guard. |
| Time Machine | Uses bounded tracks/events, binary-search-style sampling helper, global map time, and bounded event clusters after H. | Low/medium; playback intentionally updates the canonical time each frame. | `components/time-machine.tsx`, `lib/time-machine/`, Time Machine tests. | Validate with existing deterministic tests and browser gate. |
| SSE → render backpressure | Ephemeral aircraft positions coalesce; durable intelligence/alert events use separate persisted paths. | Low; changing this boundary risks event loss or stale selection. | `docs/DATA-FLOWS.md`, `use-radar-live-aircraft.ts`, SSE tests. | No protocol or semantic changes. |

## Scope decision

Only the measured WebGL allocation and the explicit heading parity helper are
changed in H. Collision, LOD, trail bounds, selected-panel ownership, and SSE
coalescing already have bounded implementations and regression coverage; they
are not rewritten for speculative gains.
