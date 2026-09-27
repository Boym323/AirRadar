# Extreme altitude historical audit

Generated 2026-09-27 from the current database. This audit is SELECT-only. It did not run a release, restart production, or execute INSERT/UPDATE/DELETE/backfill.

## Baseline

| Population | >50k | >60k | >70k | >80k | >90k | >100k |
|---|---:|---:|---:|---:|---:|---:|
| Flight.maxAltitude | 541 | 523 | 469 | **336** | 248 | 99 |
| FlightPosition.altitude | 6,305 | 5,736 | 4,025 | 1,641 | 677 | 193 |

The position table contained 4,445,945 rows and 1,168,481 NULL altitudes at the final run. The known repaired AC12 rows are therefore absent from the current altitude-value counts. The retained extreme data occurred on 2026-09-27, approximately 09:05–10:47 UTC, with 1,833 points at or above the audit threshold.

## Primary population: 336 Flights with maxAltitude >80k

The current conservative classifier assigns:

| Classification | Flights |
|---|---:|
| CONFIRMED_OR_NEAR_CERTAIN_BUG | 0 |
| HIGHLY_SUSPICIOUS | 100 |
| POSSIBLE | 19 |
| LIKELY_LEGITIMATE | 0 |
| UNKNOWN | 217 |
| **Total** | **336** |

`UNKNOWN` means that retained data does not independently prove either legitimacy or corruption. It must not be interpreted as a legitimate count. The classifier is deliberately conservative because historical `FlightPosition` has no raw-frame, receiver, provider, release, or per-field provenance.

There are 31 currently retained flights with an extreme point above 100,000 ft (37 points). The separate `Flight.maxAltitude >100k` count is 99 because `maxAltitude` is a denormalized historical maximum and can remain above the currently retained non-NULL point population; this is a data-consistency finding, not evidence that all 99 have recoverable >100k points.

## Pattern and root-cause findings

- 94 profiles match a sustained-extreme shape; 41 have a single-point-spike shape; 201 have no reliable pattern from the retained rows.
- The strongest repeated signal is an implausible temporal jump, frequently among ordinary airliners. This supports a decoder/ingest corruption hypothesis, but does not identify the exact transform.
- No independent feet/meters transform was confirmed. The script records a possible unit signature only as a hypothesis; it is not used as an automatic repair decision.
- A `~2x` neighbor relationship is reported separately and was not reused as the sole repair classifier.
- The aircraft-type distribution is led by A320 (59), B738 (57), A21N (32), B38M (29), A20N (27), and A321 (20). This is supporting evidence against many rows being legitimate high-altitude operations, not a type-only classifier.
- No retained field identifies LOCAL vs NETWORK, Beast/readsb vs ADSB.lol/ADSBHub, MLAT/TIS-B, RSSI, message quality, or receiver distance. Those requested dimensions are `UNKNOWN`, not inferred from absence.
- The service journal does show repeated `adsb.lol` provider starts/restarts during the broader day, including around the extreme-value period, but there is no durable row-level join from those logs to historical `FlightPosition`; this is only a source-pipeline hypothesis.

## Release/history correlation

The repository history contains altitude-related changes on 2026-09-27, including the DF17 Q-bit correction (`b2866ed7`), AC12/AC13 decoder work (`016d36d0`), and the subsequent DF17/18 AC12/GNSS/barometric correction (`6bc7201e`). The extreme retained values cluster before the known affected window and cannot be assigned to one commit from database timestamps alone. This is a temporal hypothesis only; raw Beast/readsb traces are required for attribution.

No local tar1090/readsb/Beast trace archive, PBS snapshot, or raw message archive was found in the searched project/runtime paths. The available journal contains provider lifecycle messages but no raw altitude payloads.

## Repairability and downstream impact

No additional data is safe to repair from this audit alone. Exact remediation would require an independent raw archive or a separately approved point-by-point reference. Potential downstream impact of any future confirmed bug class includes `FlightPosition`, denormalized `Flight.maxAltitude`, history API playback, vertical-rate/altitude analytics, ATC sector analytics, intelligence evidence, daily altitude coverage, and any derived history aggregates. `FlightEvent` must be reviewed independently; this audit performs no event mutation.

Detailed profiles, points, top 100 values, pattern JSON, and release-correlation metadata are in the sibling export files in this directory.
