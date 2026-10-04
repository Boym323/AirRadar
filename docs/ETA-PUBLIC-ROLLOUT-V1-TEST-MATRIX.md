# ETA Public Rollout V1 — test matrix

| Configured | Effective | Readiness | Calibration | Expected rollout |
| --- | --- | --- | --- | --- |
| SHADOW | SHADOW | WAIT/FAIL | not eligible | SHADOW_COLLECTING |
| SHADOW | SHADOW | PASS | manual review eligible | READY_FOR_PUBLIC_CONFIG |
| PUBLIC | PUBLIC | PASS | eligible | PUBLIC_ACTIVE |
| PUBLIC | SHADOW | WAIT/FAIL | not eligible | PUBLIC_FAIL_CLOSED |
| DISABLED | DISABLED | any | any | DISABLED |

The regression suite also locks the existing public ETA two-key guard and verifies that the rollout model contains no persistence, streaming or environment mutation path.
