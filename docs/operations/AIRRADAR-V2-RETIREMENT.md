# AirRadarV2 final retirement handoff

**Status, 27 October 2026:** selected V2 functionality has been migrated into production V1, and full V2 Git history is preserved and independently restorable. **External V2 DEV LXC, its dedicated GitHub runner, proxy/DNS and separate DEV database have not been proven stopped. The original V2 repository remains unarchived and undeleted.**

## 1. Verified migration and recovery evidence

- V1 `main` `8347c8e81e3fba485f31948b9334db5a67b1c81a`; migration pull requests [#1115](https://github.com/Boym323/AirRadar/pull/1115), [#1117](https://github.com/Boym323/AirRadar/pull/1117), [#1118](https://github.com/Boym323/AirRadar/pull/1118) merged. [Production validation/deploy](https://github.com/Boym323/AirRadar/actions/runs/40518315130) passed.
- Independent read-only [public production smoke](https://github.com/Boym323/AirRadar/actions/runs/40526497468) passed **7/7**: exact release in `/api/version`, local ADS-B source and DB in `/api/health`, HTTP 200 HTML for `/`, `/airports` and `/system`, HTTP 200 SSE headers for `/api/stream` v1 and v2. This is not a real-browser/GPU test, long-duration failover test or event-delivery assertion.
- Latest [read-only integration audit](https://github.com/Boym323/AirRadar/actions/runs/40522415295): 3 VERIFIED HEALTHY, 1 DEGRADED (34 route-cache concurrency bypasses, no timeouts or DB connection failures), 13 NOT VERIFIED. A successful audit workflow means the report was produced; **its actual verdict is DEGRADED**, not fully accepted.
- Complete restorable V2 [Git bundle in the isolated V1 archive branch](https://github.com/Boym323/AirRadar/tree/archive/airradarv2-complete-history-20261027): SHA-256 `12d3c50172cf3e51e5bde50e3f1c667cbba2bfc0153895128e102a474ddd7c36`; 158 refs including 34 branches and 63 tags; original main `7f0ad16bc7a4577a4348b188941a07c8f18b01c1`. `git bundle verify`, full mirror clone and exact ref comparison passed. **Download and retain an independent copy outside GitHub before permanently deleting V2.**

## 2. DEV access remains a retirement gate

A one-time [V2 DEV self-hosted-runner read-only inventory](https://github.com/Boym323/AirRadarV2/actions/runs/40525895966) was launched on the isolated audit branch `audit/v2-retirement-preflight-20261027`. Its job must actually run and report results to establish active units and local ports. A queued job does **not** prove that V2 services are stopped; the runner could be unavailable or busy.

## 3. Non-mutating inventory on the real V2 LXC

First verify you are on the **V2 development host**, never V1 production:

```bash
hostnamectl --static
systemctl list-units --all 'airradarv2*' 'actions.runner.Boym323-AirRadarV2*'
systemctl list-unit-files | grep -Ei 'airradarv2|actions.runner.Boym323-AirRadarV2' || true
systemctl list-timers --all | grep -Ei 'airradarv2|g04-retention' || true
ss -lntup | grep -E ':(4100|4101|4114)\b' || true
```

The [V2 auto-deploy runbook](https://github.com/Boym323/AirRadarV2/blob/main/docs/runbooks/DEV-MAIN-AUTODEPLOY.md) references `airradarv2-engine.service`, `actions.runner.Boym323-AirRadarV2.airradarv2-dev.service` (or `airradarv2-runner.service`), `airradarv2-g02-live-auto.timer`, older `airradarv2-main-deploy.timer`, optional `airradarv2-g04-canary.service` and **on a separate database LXC** `airradarv2-g04-retention.timer`. These are documented possibilities, not confirmed live observations.

## 4. Safe DEV shutdown once independent backup and consumers are checked

1. On V2 app LXC disable/stop **only individually identified V2-only engine/canary units and V2-specific timers**, using e.g. `sudo systemctl disable --now EXACT.service`. Confirm `systemctl is-active` and `is-enabled` per unit. Never use unreviewed wildcard stop commands; V1 and shared services must not change.
2. Stop and unregister the **V2 repository-scoped self-hosted GitHub runner last**, after diagnostics and deploys complete, or the diagnostics job will terminate itself. Use its actual unit name, not a guessed one.
3. On the **separate V2 database LXC**, inventory data owners and consumers; export/retain important DEV data. Only then disable the dedicated retention timer. Do **not** issue `dropdb`, `DROP ROLE`, or delete backups until an explicit data-retention review.
4. Remove only the **V2-specific reverse-proxy site/upstream**. Check `nginx -t` before `systemctl reload nginx`; **never stop the shared Nginx service**. Check V2 DNS and TLS before removal.
5. Repeat V1 production GET smoke and SSE handshake after V2 shutdown; if anything unexpectedly degrades, restore only the specific V2 units and routing that were changed. Leave V1 and its database untouched.

## 5. GitHub archival / deletion

After the preceding gates are met and an independent mirror is retained, use [AirRadarV2 Settings](https://github.com/Boym323/AirRadarV2/settings) → General → Danger Zone → **Archive this repository**. This makes it read-only but reversible; see [GitHub documentation](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories).

For final **deletion** after independent backup and off-GitHub shutdown verification, Settings → General → Danger Zone → **Delete this repository** and confirm `Boym323/AirRadarV2`. This requires GitHub repository administration access not available to the connected ChatGPT GitHub tools. The original V2 has **not** been deleted, archived or proven stopped.

Source-of-truth checklist: [AirRadar #1116](https://github.com/Boym323/AirRadar/issues/1116).
