# ADR-0001: Single live-state owner

[Česky](../cs/decisions/ADR-0001-single-live-owner.md)

Status: **Accepted** (documenting an existing contract, not a new design).

## Context

AirRadar ingests local readsb aircraft positions, optional network observations, sampled history and SSE updates. Parallel state owners would duplicate polling, alert transitions, persistence and statistics, and could break identity/observation ordering.

## Decision

Use one `AircraftStateService` owner within a single Node.js process. The local readsb → bounded RAM → SSE path remains independent of optional enrichments and database availability. PostgreSQL is for sampled history, reference/catalog data and aggregates; network observations must not impersonate local receiver evidence.

## Consequences and evidence

Do not independently start another live poller from an API route or worker. Keep bounded SSE/backpressure behavior and fail-soft optional providers. Check [architecture](../ARCHITECTURE.md), [invariants](../RUNTIME-INVARIANTS.md), [flows](../DATA-FLOWS.md) and the current state service implementation before changing this design. This ADR is rationale, not evidence of current production health.
