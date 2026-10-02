# Predictive Prospective Ground Truth V1

Result: **PARTIAL — HEALTHY RELEASE, INSUFFICIENT NATURAL LANDING EVIDENCE**

## Release and migration

- Version/tag: `1.0.250` / `v1.0.250` (remote tag PASS).
- Release/runtime SHA: `b39afe9171e722fabecf251a31375bb810d9577d`.
- Deployment start: `2026-10-02T16:23:19.181Z`.
- Runtime source diff since validated ancestor `426847fa7cbe41b695cc79f187d0339e171a325d`: none.
- Migration `20261002T1413_predictive_prospective_ground_truth_v1`: CURRENT.
- `public.flight.destinationProvenanceJson`: `text`, nullable, no default. The
  live schema was verified directly through `information_schema`.

Pre-migration backup: **MISSING**. Procedural deviation:
`PRE_MIGRATION_BACKUP_MISSING`. The post-deploy backup is not equivalent:

- Path: `/var/backups/airradar/airradar-post-1.0.250-20261002T162415Z.dump`
- Size: `335165812` bytes
- Timestamp: `2026-10-02 18:24:56.961769853 +0200`
- SHA-256: `3f0c2c49810ebb7bd62a43f9283321a14c79782d838e1cb62e76ed5f944bb19b`

## Gates and health

- `npm ci`, build, full quality gates, production core, SSE, and desktop/mobile browser gates: **PASS**.
- Full suite: 201 files, 1,415 passed, 10 skipped.
- Service active; PID `246554`; restart count `0`.
- Application, database, receiver, and SSE health: **PASS**.
- Airport data/operations path: **PASS** (database catalog, 5,887 rows).
- Flight Intelligence path: **PASS** (empty natural LANDING result; no
  post-release persistence failures observed).
- Aircraft Weather: `no_data` status with zero persistence failures; live
  source counters and accepted/persisted timestamps are advancing.
- Navigation Integrity: `degraded` diagnostic status from the current
  rejected-observation ratio, with observations and persistence advancing; no
  landing instrumentation defect was observed.
- Alerts & Fleets: **PASS** for the configured disabled/no-op state.
- Post-release `oom_kill`: `6`, unchanged from baseline.

## Natural canary

Read-only observation ran from `2026-10-02T16:28:50Z` through
`2026-10-02T17:29:44Z` (61 sampled minutes; over 60 minutes post-release).
Every sample was `health=ok/ok`, with stable RSS and no restart loop.

- Post-release natural `LANDING`: `0`
- Terminal evidence: `0`
- Immediate/delayed confirmations: `0` / `0`
- Unconfirmed/expired: `0 observed`
- Reported runway: `0`
- Duplicate, cross-ICAO, cross-lifecycle, wrong-airport, and oversized-evidence defects: `0 observed`; landing-specific validation was not applicable to an empty sample.

No synthetic production events or writes were generated. Passive collection
remains enabled; natural evidence is insufficient for a PASS classification.

## Destination provenance

Read-only validation inspected `188` rows. All used
`destination-provenance-v1`; there were `188` observations, maximum history
length `1` (limit `8`), zero invalid JSON, chronology, timestamp, adjacent
repeat, and as-of failures. The no-lookahead contract is preserved because each
observation retains its own `observedAt`.

## Performance sample

One fresh read-only 61-second sample (`17:56:23Z`–`17:57:24Z`) measured
`381.07` transactions/min, `224.33` inserts/min, `172.41` updates/min, and
`1.126 MB/min` WAL growth. Service memory was `962.15 MB` at start and
`961.72 MB` at end; one-core CPU averaged `39.26%`. The sample included
`16.65` FlightEvent inserts/min and `0` FlightEvent updates/min. Node physical
`write_bytes` was not exposed. No pending landing confirmation was observed.

## Predictive and collection status

ETA, RUNWAY, RUNWAY_CHANGE, and TRAJECTORY remain `SHADOW`. Collection totals
are 0 prospective landings, 0 ground confirmations, 0 reported-runway cases,
0 prospective airport diversity, and 188 provenance rows. Continue passive
collection toward at least 100 prospective landings, preferably 50
ground-confirmed cases; do not graduate capabilities or mix evidence versions.
