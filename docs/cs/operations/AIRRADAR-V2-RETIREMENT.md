# AirRadarV2: finální předávka a bezpečné odstavení

**Stav 27. 10. 2026:** migrace vybraných funkcí do produkční V1 a kompletní archivace Git historie V2 jsou dokončeny. **Externí V2 DEV LXC, repo-scoped GitHub runner, proxy, DNS a samostatná DEV DB nejsou prokazatelně odstaveny; původní repozitář V2 není smazán ani archivován.**

## 1. Hotové důkazy, které není nutné opakovat

- V1 `main` = `8347c8e81e3fba485f31948b9334db5a67b1c81a`. Migrační PR [#1115](https://github.com/Boym323/AirRadar/pull/1115), [#1117](https://github.com/Boym323/AirRadar/pull/1117) a [#1118](https://github.com/Boym323/AirRadar/pull/1118) byly sloučeny a [produkční CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/40518315130) prošlo.
- Nezávislý [produkční veřejný smoke](https://github.com/Boym323/AirRadar/actions/runs/40526497468): **7/7 PASS** — `/api/version` odpovídá `8347c8e8`, `/api/health` hlásí funkční lokální ADS-B zdroj a DB, `/`, `/airports`, `/system` vracejí HTTP 200 a SSE v1 i v2 dávají HTTP 200 `text/event-stream`. Test je pouze read-only a neprokazuje fyzické FPS, skutečné přijetí eventu ani dlouhodobý failover.
- [Provozní integrační audit](https://github.com/Boym323/AirRadar/actions/runs/40522415295): 3 `VERIFIED HEALTHY`, 1 `DEGRADED` (34 souběžných bypassů route-cache, **0 timeoutů a 0 chyb DB připojení**), 13 `NOT VERIFIED`. Poznámka: zelený workflow vyjadřuje úspěšné vytvoření reportu; **celkový verdict je DEGRADED**, nejde o kompletní produkční přejímku.
- **Úplný V2 Git bundle**: [izolovaná archivní větev V1](https://github.com/Boym323/AirRadar/tree/archive/airradarv2-complete-history-20261027), `AirRadarV2-full-history.bundle` SHA-256 `12d3c50172cf3e51e5bde50e3f1c667cbba2bfc0153895128e102a474ddd7c36`, 158 referencí (34 větví, 63 tagů). Úspěšný `git bundle verify`, clone mirror, kontrola ref i původního main `7f0ad16bc7a4577a4348b188941a07c8f18b01c1`. **Před smazáním ulož ZIP z GitHub Actions #40516350354 nebo archivní větve i mimo GitHub.**

## 2. Proč není DEV potvrzen jako odstavený

[Jednorázový read-only audit V2 DEV runneru](https://github.com/Boym323/AirRadarV2/actions/runs/40525895966) je oddělený od `main` na větvi `audit/v2-retirement-preflight-20261027`; na samostatném V2 `airradarv2-dev` runneru má zjistit skutečné služby a lokální porty. Dokud tento job neprojde, **nestačí samotná dokumentace k tvrzení, že DEV neběží**. Fronta může znamenat nedostupný či zaneprázdněný runner, nikoliv automaticky vypnutou V2.

## 3. Čtení stavu na původním V2 DEV LXC

Přihlásit se na **V2 DEV**, nikoli V1 produkční hostitel; nejprve ověřit hostname a skutečné služby. Nic neodstraňovat.

```bash
hostnamectl --static
systemctl list-units --all 'airradarv2*' 'actions.runner.Boym323-AirRadarV2*'
systemctl list-unit-files | grep -Ei 'airradarv2|actions.runner.Boym323-AirRadarV2' || true
systemctl list-timers --all | grep -Ei 'airradarv2|g04-retention' || true
ss -lntup | grep -E ':(4100|4101|4114)\b' || true
```

Podle [V2 runbooku](https://github.com/Boym323/AirRadarV2/blob/main/docs/runbooks/DEV-MAIN-AUTODEPLOY.md) jde zejména o `airradarv2-engine.service`, `actions.runner.Boym323-AirRadarV2.airradarv2-dev.service` nebo `airradarv2-runner.service`, `airradarv2-g02-live-auto.timer`, starý `airradarv2-main-deploy.timer`, `airradarv2-g04-canary.service`. Na **odděleném DB LXC** ještě `airradarv2-g04-retention.timer`. Tyto názvy jsou pouze z repozitáře, nejsou potvrzením aktivního stavu.

## 4. Zastavení bez rizika pro produkční V1

Až bude ověřená kopie archivu **mimo GitHub**, případná zachovávaná DEV data a že V2 již nemá konzumenty:

1. Na V2 aplikačním LXC vypnout **pouze přesně existující V2 engine, canary a V2-only timery** (`sudo systemctl disable --now JMENO.service` nebo `JMENO.timer`), zvlášť ověřit `systemctl is-active` a `is-enabled`. Nepoužívat wildcard jako parametr pro stop; žádná produkční V1 služba se nesmí změnit.
2. Repo-scoped **V2 GitHub Actions runner ukončit až nakonec**, po doběhnutí auditů/deployů; jinak si zastavením runneru přerušíte vlastní diagnostickou práci. Ověřit jeho přesný název a deaktivovat jen tento V2 unit. Odpojit registraci runneru v GitHub repozitáři.
3. Na **V2 DB LXC** nejprve zajistit/exportovat potřebná data, zaznamenat názvy DB/rolí a závislosti. Samostatnou retenční timer V2 lze pak deaktivovat, ale **žádné `dropdb`, `DROP ROLE` ani mazání backupů bez další přejímky**.
4. Na reverzní proxy odebrat pouze **samostatný V2 vhost/upstream** a ověřit `nginx -t` před `systemctl reload nginx`. **Nikdy nezastavovat sdílenou službu Nginx.** Posoudit V2 DNS a TLS certifikáty po zjištění závislostí.
5. Po odstavení V2 znovu ověřit HTTP 200 produkčních V1 `/api/version`, `/api/health`, `/`, `/airports` a SSE handshake. Pokud se něco zhorší, obnovit **jen zastavené V2 units** a jejich směrování, nezasahovat do V1/DB.

## 5. Archivace/smazání GitHub V2

Po potvrzení předchozích bodů a uloženém offline bundlu otevřít [AirRadarV2 Settings](https://github.com/Boym323/AirRadarV2/settings) → General → Danger Zone → **Archive this repository**. GitHub archivuje repo do read-only stavu bez ztráty historie; v případě potřeby jej lze znovu odarchivovat. [Dokumentace GitHubu](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories).

Pokud je cílem **úplné smazání**, provést je až po kontrole, že V2 runner, automatické úlohy, proxy a DB konzumenti nejsou aktivní a offline mirror existuje. GitHub Settings → General → Danger Zone → Delete this repository; potvrdit přesný název `Boym323/AirRadarV2`. Toto je samostatná nevratná administrátorská operace; dostupné GitHub připojení k ChatGPT ji neumí provést. **V2 není dosud smazána ani odstavená.**

Důkazní a provozní checklist: [AirRadar #1116](https://github.com/Boym323/AirRadar/issues/1116).
