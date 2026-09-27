# Architektura

Živá cesta projektu je `readsb → RAM → SSE`. Jeden `AircraftStateService`
udržuje živý stav v procesu Node.js. PostgreSQL ukládá vzorkovanou historii,
katalogová data a denní statistiky; jeho výpadek nesmí zastavit radar.

Lokální a síťová letadla jsou vedená odděleně a slučují se až při serializaci
rozšířeného zobrazení. Síťová pozorování se nezapisují do lokální historie,
statistik, alertů ani obohacování. OGN/FLARM je samostatná volitelná živá
cesta a také nezasahuje do ADS-B historie.

`/api/stream` je SSE, nikoli WebSocket. Doručení je omezené, slučované a musí
zachovat heartbeat. Veřejná serializace nesmí odhalit tajné údaje ani přesné
souřadnice přijímače. Detailní hranice vlastnictví jsou v
[anglické verzi](../ARCHITECTURE.md).
