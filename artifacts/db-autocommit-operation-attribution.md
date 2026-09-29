# PostgreSQL autocommit operation attribution V1

Status: instrumentation-ready. No production measurement was run in this change, so no transaction rate, reconciliation percentage, canary, or optimization candidate is claimed.

The separate process-local diagnostics store records READ/WRITE, SELECT/INSERT/UPDATE/UPSERT/DELETE/OTHER metadata and attempts, successes, failures, active, max concurrency, duration, and work units over 5m/15m/60m windows. It is exposed only through admin System Status; public projection removes it.

| Source/function | ORM operation | Explicit transaction | Lane |
| --- | --- | --- | --- |
| `navigation-integrity.ts` / `persistObservation` | `NavigationIntegrityObservation.create` | NO | `navigation.observation.create` |
| `navigation-integrity.ts` / `persistAnomaly` | `NavigationIntegrityAnomaly.upsert` | NO | `navigation.anomaly.upsert` |
| `navigation-integrity.ts` / `getHistory` | anomaly query | NO | `navigation.history.query` |
| `aircraft-weather.ts` / `writeWeatherObservation` | `AircraftWeatherObservation.create` | NO | `weather.observation.create` |
| `aircraft-weather.ts` / `queryAircraftWeatherObservations` | weather query | NO | `weather.observation.query` |
| `aircraft-metadata-catalog.ts` / `getMetadata` | metadata `.first()` | NO | `aircraft-metadata.cache.lookup` |
| `reception-records.ts` / `loadReceptionRecords` | stats query | NO | `receiver.reception-record.query` |
| `atc-data.ts` / `getStoredAtcData` | sector and transmitter queries | NO | `atc.dataset.load` (one count per ORM call) |

The weather shutdown flush uses the same `writeWeatherObservation` path and therefore the same lane without double counting. Navigation write-tail queueing is not counted. Explicit transaction children such as history snapshots, receiver coverage, catalog imports, and ATC imports remain excluded.

Production canary and 30–60 minute reconciliation remain required before selecting one optimization candidate.
