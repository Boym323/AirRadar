# Route Intelligence V2 contracts

This document defines the shared TypeScript boundaries for the planned route
intelligence pipeline:

```text
procedure data → static route engine → InterpretedRoute
               → dynamic route intelligence → UI/view DTO
```

The source of truth is [`lib/route-intelligence/contracts.ts`](../lib/route-intelligence/contracts.ts).
The public `lib/route-intelligence` boundary re-exports those types. Future
agents should import the contracts from that boundary and must not redefine
`Procedure`, `InterpretedRoute`, `RunwayContext`, `DynamicRouteState`, or the
view DTO locally.

## Ownership and boundaries

- Procedure ingestion owns `Procedure`, `ProcedureLeg`, `ProcedurePoint`,
  `ProcedureSource`, runway applicability, and publication metadata. Geometry
  may be null per leg. A discontinuity is explicit data, not an inferred line.
- The static engine owns `InterpretedRoute`, its ordered
  `InterpretedRouteElement[]`, procedure matches, and element provenance.
  Published SID/STAR/ATS, filed DCT, filed route text, schematic legs, and
  unresolved connectors have distinct source kinds.
- Dynamic intelligence owns `DynamicRouteState`. It may update position-based
  values without mutating static route elements or their provenance.
- The UI consumes `RouteIntelligenceViewDTO` / `PublicRouteIntelligenceDTO`,
  not parser output or provider-specific enrichment objects.
- `RunwayContext` is a shared input/output boundary. Reported and inferred
  runway values are separate; `conflict` is retained when both are present and
  differ.

## Invariants

- `DCT` is represented by `FILED_DCT`; it is never `PUBLISHED_ATS`.
- Every interpreted element has a `RouteElementSource`; provenance is not
  recoverable from a global route source after the element is created.
- Missing procedure geometry is valid and must remain null.
- A discontinuity must remain representable without inventing a connector.
  An unresolved connector or schematic element is explicit and is not a
  published ATS claim.
- Procedure matching preserves status, candidate count, ambiguity, evidence,
  confidence, and runway compatibility. `UNRESOLVED` is a meaningful state.
- ATS coverage, route reconstruction coverage, and route progress are separate
  named metrics. They must not be used interchangeably.
- Distances in `DynamicRouteState` are nautical miles. `routeProgress` is a
  normalized fraction, or null when it cannot be calculated.
- `RouteIntelligenceResult` remains the current V1-compatible engine/UI
  contract. Its existing `currentSegment`, `previousWaypoint`,
  `nextWaypoint`, `distanceToNextWaypointNm`, and
  `crossTrackDeviationNm` fields are intentionally not renamed or removed.
  The optional `v2` field is the migration seam for a later adapter/engine
  implementation.

## Parallel work guidance

Agents implementing ingestion may populate procedure contracts only. Agents
implementing matching should produce `InterpretedRoute` and `ProcedureMatch`
without changing provider or UI types. Agents implementing dynamic behavior
should consume the static route and return `DynamicRouteState`. UI work should
map the domain model to `RouteIntelligenceViewDTO`; it should not import
`FlightPlan`, provider parser structures, or database rows as its route model.

The existing ATS document types in `lib/ats/cz-routes.ts` remain the current
published ATS dataset boundary. They are input data for the static engine, not
the V2 procedure contract and should not be extended into SID/STAR semantics.
