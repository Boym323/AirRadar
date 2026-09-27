# Runtime invarianty

- ICAO hex je identita letadla; callsign je pouze pozorování.
- Živý stav a jediný poller `AircraftStateService` zůstávají v jednom procesu.
- Cesta `readsb → RAM → SSE` nesmí být závislá na PostgreSQL.
- `/api/stream` zůstává SSE s omezeným doručením a heartbeat chováním.
- Síťová a OGN pozorování se nesmí vydávat za lokální přijímač.
- ATC výsledek je pravděpodobná shoda polohy, výšky a času, ne důkaz frekvence.
- Veřejné DTO nesmí odhalit tajné údaje, surové chyby providerů ani přesnou
  polohu přijímače bez explicitního režimu.

Úplný kontrakt je v [anglické verzi](../RUNTIME-INVARIANTS.md).
