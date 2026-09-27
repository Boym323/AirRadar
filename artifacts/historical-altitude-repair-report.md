# Historical altitude repair report

- Repair timestamp: 2026-09-27T11:27:52.657Z
- Running version: 1.0.162
- Running commit: 284bd837
- Post-fix service start: 2026-09-27 13:06:57 CEST (2026-09-27T11:06:57.000Z)
- Repair dataset checksum: 3078213643b3cc34a2dab2348bae341f75f16c1c5b3fcf22c519cc91f9445776

## Transaction results

- Precondition rows: 491
- Updated FlightPosition rows: 491
- Updated Flight rows: 3
- Unchanged affected Flights: 166
- Flights without valid remaining altitude: 0
- FlightPosition count unchanged: yes
- FlightEvent changes: none
- POSSIBLE / PLAUSIBLE_HIGH_ALTITUDE rows changed: none

## Post-validation

- Repair IDs with `altitude IS NULL`: 491
- Repair IDs retaining original altitude: 0
- Non-altitude fields changed: 0
- `FlightPosition` total count: 4,442,885 (unchanged)
- Stored `Flight.maxAltitude` vs `MAX(valid FlightPosition.altitude)`: 0 mismatches across 169 affected Flights
- Historical audit: `HIGH_CONFIDENCE_BUG: 0`; `POSSIBLE: 205` (unchanged scope, not repaired)
- Post-fix production window from 2026-09-27 13:06:57 CEST: `HIGH_CONFIDENCE_BUG: 0`, `POSSIBLE: 0`
- Production health after repair: PASS

## Artifacts

- Final position rollback snapshot: [historical-altitude-rollback-final.csv](historical-altitude-rollback-final.csv)
- Final Flight rollback snapshot: [historical-altitude-flight-rollback-final.json](historical-altitude-flight-rollback-final.json)
- Prepared rollback SQL (not executed): [historical-altitude-rollback.sql](historical-altitude-rollback.sql)

Commit completed atomically after locked revalidation.
