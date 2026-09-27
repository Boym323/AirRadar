# Architecture and data flow

The live path is `readsb → RAM → SSE`. One `AircraftStateService` poller owns
live state in the Node.js process. PostgreSQL receives sampled history,
reference data, and daily statistics. `/api/stream` is SSE, not WebSocket;
delivery remains bounded and coalesced with heartbeat behavior preserved.

See the full [architecture](../../ARCHITECTURE.md), [data flows](../../DATA-FLOWS.md),
and [runtime invariants](../../RUNTIME-INVARIANTS.md).
