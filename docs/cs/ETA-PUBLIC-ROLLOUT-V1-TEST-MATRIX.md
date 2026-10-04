# ETA Public Rollout V1 — test matrix

| Configured | Effective | Readiness | Calibration | Očekávaný rollout |
| --- | --- | --- | --- | --- |
| SHADOW | SHADOW | WAIT/FAIL | není eligible | SHADOW_COLLECTING |
| SHADOW | SHADOW | PASS | manual review eligible | READY_FOR_PUBLIC_CONFIG |
| PUBLIC | PUBLIC | PASS | eligible | PUBLIC_ACTIVE |
| PUBLIC | SHADOW | WAIT/FAIL | není eligible | PUBLIC_FAIL_CLOSED |
| DISABLED | DISABLED | libovolný | libovolná | DISABLED |

Regresní suite navíc uzamyká existující dvouklíčový guard veřejné ETA a ověřuje, že rollout model neobsahuje persistence, streaming ani cestu pro změnu environment konfigurace.
