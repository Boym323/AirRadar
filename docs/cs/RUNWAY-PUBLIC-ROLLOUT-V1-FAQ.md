# FAQ Runway Public Rollout V1

**Zveřejní tato změna Runway?** Ne. Pouze hlásí, kdy lze ručně posoudit explicitní změnu konfigurace.

**Povýší PASS Runway automaticky?** Ne. PASS v SHADOW vede pouze na `READY_FOR_PUBLIC_CONFIG`.

**Co se stane při regresi readiness po PUBLIC konfiguraci?** Existující graduation enforcement stáhne efektivní policy do SHADOW a rollout hlásí `PUBLIC_FAIL_CLOSED`.

**Povýší se tím i Runway Change?** Ne. Runway Change zůstává nezávislá.
