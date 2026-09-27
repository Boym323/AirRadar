# Architektura a datové toky

Živá cesta je `readsb → RAM → SSE`. Jeden poller `AircraftStateService` vlastní
živý stav v procesu Node.js. PostgreSQL přijímá vzorkovanou historii, referenční
data a denní statistiky. `/api/stream` je SSE, nikoli WebSocket; doručení je
omezené a slučované se zachovaným heartbeatem.

Viz úplnou [architekturu](../../ARCHITECTURE.md), [datové toky](../../DATA-FLOWS.md)
a [runtime invarianty](../../RUNTIME-INVARIANTS.md).
