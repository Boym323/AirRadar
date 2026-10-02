# Flight Intelligence V1 production report

Result: PASS. The canonical automated AirRadar release deployed the frozen
candidate and completed a natural-traffic canary on 2026-10-02.

## Candidate and release

- Source/runtime SHA: `39c29da91ed6a0f733bbcc43c06373231214ad4f`
- Version/tag: `1.0.233` / `v1.0.233`; local and origin tag point to the SHA.
- Release channel: production.
- Service PID after restart: `168724`.
- Migration: canonical release migration step completed; schema verification
  passed. No manual SQL or destructive migration was used.

## Gates

- Durable corpus: PASS — 100 flights, 3,985 positions, 49 durable events;
  stream/replay/durable parity, Temporal.Instant round-trip, idempotency,
  restart, ordering, and duplicate checks passed.
- Focused Time Machine/Flight Intelligence/API tests: PASS — 3 tests.
- Airport Operations quality: PASS — 3 scenarios, 0 contradictions.
- Production/browser gate: PASS — SSE, data layer, desktop/tablet/mobile,
  responsive sweep, and visual smoke all passed.
- Health/schema: PASS — application, database, receiver, and SSE healthy.

## Canary

- Window: 2026-10-02 09:05:11–09:50:19 CEST; 45 minutes 8 seconds of natural
  traffic.
- Production FlightEvent rows before deployment: 0. For the exact bounded
  canary interval, V1 rows were 117 / 895 before/after; 778 rows were created,
  approximately 17.3 rows/minute. A post-window audit observed 904 total rows.
- All audited rows report `detectorVersion=flight-intelligence-v1`.
- Type counts created during the exact canary interval: `AIRSPACE_ENTRY` 352,
  `AIRSPACE_EXIT` 41, `APPROACH` 78, `CRUISE_ENTER` 25, `DIVERSION` 5, `GO_AROUND` 1,
  `HOLDING` 1, `HOLDING_CANDIDATE` 9, `LANDING` 2, `LEVEL_OFF` 196,
  `ORBIT` 2, `TOP_OF_DESCENT` 59, `UNUSUAL_TURN` 9.
- Duplicate event keys: 0.
- Sequence violations audited: 0 repeated landings, 0 go-arounds after
  landing, 0 hold exits without a hold, and 0 holding-after-landing cases.
- PID remained stable; health stayed OK; no material Flight Intelligence,
  Prisma, Temporal, SSE, or persistence errors were observed.

## Performance and I/O

- CPU samples: approximately 39–49% under observed traffic.
- RSS samples: approximately 0.75–1.21 GB, bounded after GC.
- DB transactions increased from 7,658,483 to 7,682,678; tuple inserts from
  7,322,710 to 7,341,610; tuple updates from 12,801,608 to 12,816,639.
- Node `write_bytes` increased from 23.98 MB to 192.35 MB during the sampled
  window, with periodic archive/cache bursts. No FlightEvent-specific write
  storm was observed.

No rollback condition was met.
