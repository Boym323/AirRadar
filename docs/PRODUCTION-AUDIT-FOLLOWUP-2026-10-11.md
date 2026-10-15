# Produkční incident – 11. 10. 2026

## Co je potvrzeno (read-only audit)
- `airradar.service` se během aktivního T5.7C měření opakovaně restartovala. Z auditní zprávy nelze bez systemd/cgroup detailu prokázat, zda šlo o OOM, watchdog, deploy nebo externí restart.
- ADSBDB má stav `UPSTREAM_UNAVAILABLE` a má fungovat fail-soft přes tar1090 a PostgreSQL; ADSB.lol routeset fallback byl následně odstraněn.
- ADSBDB persistent cache měla po nedávném restartu necheckpointované mutace. Výchozí hodinový interval checkpointu znamená, že samotné `dirty=true` před termínem není selhání.
- Navigation Integrity odmítá mnoho neúplných či zastaralých dat; chybí oddělení legitimně nezpůsobilých letadel od problémů časování.

## Bezpečný post-release postup – P0, bez změn produkce
1. Ověřit shodu nasazeného commitu a procesního startu pomocí `/api/version`, `systemctl show airradar.service -p MainPID -p ExecMainStartTimestamp -p NRestarts -p Result -p ExecMainStatus` a `journalctl -u airradar.service --since '2026-10-11 10:00' --no-pager`. Nespouštět restart.
2. Zjistit OOM bez změny hosta: `journalctl -k --since '2026-10-11 10:00' --no-pager`; číst cgroup memory.events/memory.peak příslušné jednotky a korelovat s runtime telemetry, nevyvozovat diagnózu z RSS samotného.
3. Pokud stále běží `t57-production-soak.mjs`, **neukončovat** jej. Po skončení vyhodnotit NDJSON skriptem `node scripts/t57-production-soak.mjs --analyze <private-file.ndjson>` pouze s cestou potvrzenou operátorem. Nenahrávat NDJSON do PR.
4. ADSBDB: pouze číst `/api/system/status` s admin session. Sledovat `providerStatus`, `consecutiveFailures`, `lastSuccessAt`, `lastFailureAt`, `persistence.nextCheckpointAt`, `checkpointFailures`, `dirtyAgeMs`. Neprovádět hromadné upstream testy. Případná chyba vzdálené služby se neopraví deaktivací ochrany před přetížením.
5. Route DB: sledovat 24h `dbHit/dbMiss/dbError/dbBypassed` v administraci, neprovádět migraci bez samostatného souhlasu a předprodukční validace.
6. Navigation Integrity: porovnat `rejectionReasons` a počty akceschopných selhání po nasazení změny. `no_integrity_fields`, `on_ground` a `no_position` nejsou důkazem GNSS útoku. Veřejné predikce neaktivovat bez maturity gate.

## Co tento PR **nedělá**
- Neřeší neznámou příčinu restartu bez produkčních logů.
- Nezaručuje dostupnost ADSBDB, neopravuje cizí API ani nenasazuje změny na hosta.
- Nemění 60min periodu checkpointu, neukončuje měření a neotvírá placené API.
