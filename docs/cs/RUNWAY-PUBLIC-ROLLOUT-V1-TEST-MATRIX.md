# Testovací matice Runway Public Rollout V1

| Konfigurace | Efektivní režim | Readiness | Calibration review | Očekávaný stav |
| --- | --- | --- | --- | --- |
| SHADOW | SHADOW | WAIT/FAIL | false | SHADOW_COLLECTING |
| SHADOW | SHADOW | PASS | true | READY_FOR_PUBLIC_CONFIG |
| PUBLIC | PUBLIC | PASS | true | PUBLIC_ACTIVE |
| PUBLIC | SHADOW | WAIT/FAIL | false | PUBLIC_FAIL_CLOSED |
| DISABLED | DISABLED | libovolné | libovolné | DISABLED |

Matice je záměrně provozní. `READY_FOR_PUBLIC_CONFIG` nikdy nemění konfiguraci a existující Runway advisory stále před veřejnou serializací vyžaduje freshness, známou confidence, dostupnou runway, explicitní PUBLIC konfiguraci a readiness PASS.
