# Flight Intelligence V2 audit

This is the Phase 0 audit for the first roadmap stage. It records the current
implementation on `main`; later roadmap stages should update it only when
their implementation changes one of these ownership boundaries.

| Area | Existing capability | Missing capability | Reuse opportunities | Risk | Proposed implementation |
| --- | --- | --- | --- | --- | --- |
| Live aircraft | `AircraftStateService` keeps one RAM map and invokes intelligence from the local snapshot lane. | No new live-state owner is needed. | Keep the existing single-process poller and cleanup lifecycle. | A second detector would diverge from SSE/history state. | Extend `FlightIntelligenceDetector` in place. |
| Motion history | Bounded per-aircraft detector history and sampled `FlightPosition` history already exist. | Explicit stale/discontinuous observation guard. | Use `lastSeen`, `seenPosSeconds`, timestamps, and the existing bounded history. | Sparse or jumped observations can create false phases/events. | Reset only the affected detector track to `UNKNOWN` and wait for a fresh sequence. |
| Flight phase | Deterministic climb/cruise/descent/approach/landing transitions with hysteresis already exist. | `FINAL`, `LANDED`, `GO_AROUND`, `UNKNOWN` semantics and level-off event. | Preserve current transition confirmation and airport proximity signals. | Changing persisted phase values can break old consumers. | Add new phases while accepting legacy `LANDING`; keep old event names compatible. |
| Holding/orbit | Bounded area, turn evolution, duration, altitude, and airborne checks already exist. | Candidate/confirmed/ended lifecycle and explicit unusual-turn/orbit events. | Reuse `detectHolding()` evidence and the single event ledger. | Approach vectors and local traffic are common false positives. | Add duration/hysteresis, lifecycle state, and conservative spatial gates. |
| Events | `FlightIntelligenceEvent` is published by one service, persisted to `FlightEvent`, and streamed over SSE. | Started/ended timestamps, reason-code alias, and bounded metadata. | Extend the current DTO and `metadataJson`; no new table or stream. | Schema migration would add deployment risk without current need. | Add optional fields for backward compatibility and persist them in existing metadata. |
| Alerts | `AlertEngine` has bounded priority queues, deduplication, and intelligence bridging. | Phase-1 lifecycle events must not become noisy alerts. | Continue mapping only confirmed existing alert types. | Candidate/ended events could spam watchlists. | Keep alert bridge limited to existing actionable intelligence events. |
| Replay/history | `FlightEvent` rows are joined into Flight Story and replay tooling exists. | Replay fixtures for stale and discontinuous input. | Keep replay deterministic and use the same detector. | Historical rows do not contain every live signal. | Add pure fixture tests; do not expand persistence tables. |
| UI/observability | Intelligence page, REST/SSE endpoints, and existing translations exist. | Phase-1 diagnostics are not yet exposed. | Existing event stream remains the presentation boundary. | UI changes would expand this stage unnecessarily. | Keep Phase 1 backend/event focused; expose new fields additively. |

## Persistence decision

Use the existing hybrid boundary: detector state and bounded recent events remain
in RAM for live delivery, while detected events continue to use the existing
best-effort `FlightEvent` persistence. No Prisma migration is required because
the additional lifecycle timestamps and reason codes fit the existing
`metadataJson`/`evidenceJson` fields.

## Stage-1 scope

Implement only Flight Intelligence V2 foundations: explicit phase result,
stale/discontinuous input protection, level-off, conservative holding lifecycle,
unusual turn/orbit events, and fixture-based unit coverage. ATC, weather, detail
panel, Time Machine, alerting, receiver dashboard, rendering, and filed-route
intelligence remain separate stages.
