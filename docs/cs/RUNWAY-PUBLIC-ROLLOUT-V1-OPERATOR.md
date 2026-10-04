# Provozní poznámky Runway Public Rollout V1

Rozhodnutí `READY_FOR_PUBLIC_CONFIG` znamená pouze to, že existující Runway readiness je PASS a graduation calibration je způsobilá k ručnímu review. Není to oprávnění k automatické změně produkce.

Před ruční změnou `AIRRADAR_PREDICTIVE_RUNWAY_STATUS` na `PUBLIC` má operátor zkontrolovat readiness report a calibration evidence ve stejném deployment kontextu. Po ruční změně zůstává autoritativní runtime graduation gate: při regresi readiness stáhne efektivní Runway policy zpět do SHADOW a rollout rozhodnutí přejde na `PUBLIC_FAIL_CLOSED`.

Rollback je proto pouze konfigurační: nastavit Runway capability zpět na SHADOW. Tato rollout vrstva nevyžaduje databázovou migraci, backfill ani přepis prediction state.
