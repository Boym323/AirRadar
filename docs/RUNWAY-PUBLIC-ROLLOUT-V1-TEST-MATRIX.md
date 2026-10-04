# Runway Public Rollout V1 test matrix

| Configured | Effective | Readiness | Calibration review | Expected state |
| --- | --- | --- | --- | --- |
| SHADOW | SHADOW | WAIT/FAIL | false | SHADOW_COLLECTING |
| SHADOW | SHADOW | PASS | true | READY_FOR_PUBLIC_CONFIG |
| PUBLIC | PUBLIC | PASS | true | PUBLIC_ACTIVE |
| PUBLIC | SHADOW | WAIT/FAIL | false | PUBLIC_FAIL_CLOSED |
| DISABLED | DISABLED | any | any | DISABLED |

The matrix is deliberately operator-facing. `READY_FOR_PUBLIC_CONFIG` never mutates configuration, and the existing Runway advisory still enforces freshness, confidence, availability, configured PUBLIC, and readiness PASS before serializing public data.
