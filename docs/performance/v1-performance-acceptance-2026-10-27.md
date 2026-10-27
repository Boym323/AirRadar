# AirRadar V1 – performance acceptance (27 October 2026)

**Result:** `PASS_WITH_LIMITATIONS`.

This document records the current V1 production acceptance. Values are
aggregated and contain no secrets, tokens, aircraft identities, PIDs or raw
diagnostic responses.

## Production identity and health

- version `1.0.555`, commit `a202cfb1`, channel `production`;
- `airradar.service` active with `NRestarts=0`;
- `/api/health` reports healthy PostgreSQL and local BEAST/JSON failover;
- `/api/system/status` confirms `rustActive=true`, `parserBackend=rust`, and
  `crcBackend=rust`;
- `/api/aircraft`, SSE v1 and SSE v2 deliver data;
- no journal errors were observed after the final restart.

## Enabled and disabled switches

The following configured switches were confirmed at runtime:

| Switch | State | Actual use |
| --- | --- | --- |
| `AIRRADAR_NATIVE_BEAST` | `1` | Rust BEAST backend active |
| `AIRRADAR_NATIVE_BEAST_PARSER` | `1` | Rust parser confirmed by system status |
| `AIRRADAR_NATIVE_BEAST_CRC` | `1` | Rust CRC confirmed by system status |
| `AIRRADAR_WEATHER_BATCH_INSERT_ENABLED` | `true` | active; no new A/B was run for this switch |
| `AIRRADAR_TRACK_FUSION_SHADOW_ENABLED` | `true` | configured active |
| `AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED` | `true` | configured active |
| `AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED` | `true` | T57 runtime reports forensics inactive |
| `AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED` | `true` | configured active |

Disabled or unused switches:

- `AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED=0`; historical and new evidence did
  not show a sufficient inline CRC benefit;
- `AIRRADAR_NATIVE_ATC` is unset; the deployed addon lacked the required ATC
  symbol, so it remains disabled;
- `AIRRADAR_ATC_RESOLUTION_ENABLED=false` and
  `AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED=false`;
- `AIRRADAR_ATC_LATITUDE_INDEX` was removed from the production `.env` after
  testing and uses the default OFF state;
- stall evidence and the T58 CPU profiler are disabled.

Admin auxiliary telemetry now contains every field required by T57, including
`atcShadowPredictionKeys`. Its current value is `0`: the shadow-map producer
was retired in V1 and no runtime map is allocated. Public projections do not
expose this field.

## Controlled latitude-index A/B

The original 180-second baseline was not fully comparable, so a controlled
A/B test was used. Each branch collected 58 samples at 10-second intervals
for 600.6 seconds.

| Metric | Index OFF | Index ON |
| --- | ---: | ---: |
| CPU mean / P95 / P99 | 17.663 / 37.843 / 65.033% | 19.491 / 46.518 / 100.000% |
| RSS P50 / P95 / P99 | 1333.793 / 1418.078 / 1419.047 MiB | 1292.250 / 1347.156 / 1358.453 MiB |
| event-loop P95 metric P95 | 21.496 ms | 21.643 ms |
| event-loop P99 metric P95 | 39.584 ms | 54.329 ms |
| PostgreSQL transactions/min | 389.834 | 324.600 |
| PostgreSQL inserts/updates/min | 375.3 / 237.6 | 309.0 / 213.8 |

Index ON had lower RSS and database activity, but higher Node CPU and
event-loop P99. ATC resolution was disabled in the running V1, so the
latitude-index path was not exercised by production ingest. The difference
therefore cannot be attributed to the index, and the switch was not retained.

## T57/T58

- T57 admin preflight: `TELEMETRY_READY`.
- T57 read-only chunk: 31/31 samples, 0 missing, one stable segment,
  `PASS_WITH_LIMITATIONS`.
- T57 CPU mean/P95: `12.013 / 14.163%`.
- T57 RSS P50/P95: `699.848 / 1313.637 MiB`.
- T57 event-loop-window P99 P95: `33.128 ms`; maximum window: `640.156 ms`.
- T58 read-only: 13/13 samples, zero flagged intervals,
  `PASS_WITH_LIMITATIONS`.
- T58 CPU P50/P95/max: `18.264 / 24.636 / 24.636%`.
- T58 rolling event-loop P99 P95: `57.049 ms`.

Cgroup throttling was `controller_disabled`; this cannot be interpreted as
zero throttling. A full 24-hour T57 soak was not part of this acceptance.

## Source change, tests and rollback

The missing auxiliary telemetry field was fixed in [PR #1120](https://github.com/Boym323/AirRadar/pull/1120)
in [memory-retention-diagnostics.ts](../../lib/server/memory-retention-diagnostics.ts)
and [memory-retention-diagnostics.test.ts](../../tests/memory-retention-diagnostics.test.ts).
It was deployed through the standard CI pipeline; no schema, ingest, security
control or existing API contract changed.

Validation passed: focused T57 projection 22/22, unit 1816 passed, integration
169 passed, Rust unit 7/7, typecheck, CodeQL and synthetic 1×/2×/4× load.

The configuration rollback is stored at
`/var/backups/airradar/20261027T160928Z-optimization-baseline/.env`.
Source rollback must use a revert PR and the standard release pipeline; do not
use `git reset --hard` or manually copy source into production.
