# Flight Intelligence V1 durable corpus validation

Result: PARTIAL overall; the disposable durable corpus gate passed. Production
deployment and canary were not run because the full mission also requires the
API/Timeline, Time Machine, Airport Operations, browser, release, and live
canary gates.

## Corpus

- Candidate: `55a9c2a55936cd07327fb8470593f6fbbf7373af`
- Source: read-only production history; 100 completed flights, 3,985
  `FlightPosition` rows. Stable flight IDs are recorded in the JSON artifact.
- Disposable PostgreSQL: local PostgreSQL 17, fresh database, canonical 15
  migrations applied; database was dropped after validation.
- Production `FlightEvent` rows before and after: `0` and `0`.

## Durable replay

The real `FlightIntelligenceService` persistence path produced 49 durable rows:

| type | generated | durable |
| --- | ---: | ---: |
| CRUISE_ENTER | 6 | 6 |
| TOP_OF_DESCENT | 15 | 15 |
| APPROACH | 4 | 4 |
| LEVEL_OFF | 24 | 24 |

The requested rare types `TAKEOFF`, `INITIAL_CLIMB`, `LANDING`, `HOLD_ENTER`,
`HOLD_EXIT`, and `GO_AROUND` had zero rows in this source slice.

## Gates passed

- Real PostgreSQL persistence: PASS.
- PostgreSQL `timestamptz` round-trip and `Temporal.Instant` write path: PASS.
- Stream/replay/durable semantic parity: PASS; 0 mismatches.
- Second replay idempotency: PASS; 49 rows before and after.
- Third/restart pass: PASS; 49 rows, 0 unexpected new rows.
- Detector version: PASS; all durable rows are `flight-intelligence-v1`.
- Ordering/duplicate check: PASS; 0 violations.
- Production mutation check: PASS; production remained at 0 `FlightEvent` rows.

The second and third passes made 98 duplicate insert attempts rejected by the
unique `eventKey` constraint; no duplicate rows were created.

## Corrective fixes found during the gate

The real path was repaired to use the project’s Prisma 8 ORM contract: scalar
aircraft-to-flight linking, callback ordering, direct row `create`, and
`Temporal.Instant.fromEpochMilliseconds(...)` for temporal writes. Focused
service tests cover these contracts.
