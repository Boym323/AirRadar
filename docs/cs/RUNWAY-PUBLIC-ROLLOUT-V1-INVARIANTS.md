# Invarianty Runway Public Rollout V1

1. `PUBLIC_ACTIVE` vyžaduje nakonfigurované PUBLIC, efektivní PUBLIC a readiness PASS.
2. SHADOW plus PASS/calibration eligibility vede pouze na `READY_FOR_PUBLIC_CONFIG`.
3. Nakonfigurované PUBLIC bez aktivního efektivního PUBLIC vede na `PUBLIC_FAIL_CLOSED`.
4. DISABLED nikdy nepožaduje změnu konfigurace.
5. Rollout decision je odvozený a neukládá se.
6. Runway Change zůstává nezávislá capability.
