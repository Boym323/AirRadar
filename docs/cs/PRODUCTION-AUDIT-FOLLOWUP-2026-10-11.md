# Produkční incident – 11. 10. 2026

## Potvrzená zjištění (pouze čtecí audit)
- Služba `airradar.service` se opakovaně restartovala během aktivního měření T5.7C. Příčinu (OOM, watchdog, deployment nebo externí restart) nelze určit pouze z auditní zprávy; potřebujeme systemd a cgroup záznamy.
- ADSBDB hlásí `UPSTREAM_UNAVAILABLE`. Radar má při jeho výpadku pokračovat s místním tar1090 katalogem, PostgreSQL a volitelnými ADSB.lol trasami.
- Trvalá cache ADSBDB evidovala po nedávném restartu neuložené mutace. Běžná hodinová prodleva do checkpointu znamená, že `dirty=true` před termínem uložení není porucha.
- Navigation Integrity odmítá mnoho neúplných či zastaralých pozorování. Je třeba odlišit běžně nezpůsobilá letadla od závad časování a zdrojových dat.

## Bezpečný postup po nasazení – P0, beze změn produkce
1. Porovnat skutečně nasazený commit a začátek procesu přes `/api/version`, `systemctl show airradar.service -p MainPID -p ExecMainStartTimestamp -p NRestarts -p Result -p ExecMainStatus` a `journalctl -u airradar.service --since '2026-10-11 10:00' --no-pager`. Službu nerestartovat.
2. Prověřit OOM bez zásahu do hostitele pomocí `journalctl -k --since '2026-10-11 10:00' --no-pager`. Pročíst příslušné soubory cgroup `memory.events` a `memory.peak`, provést korelaci s runtime telemetrií. Samotné vysoké RSS nedokazuje únik paměti.
3. Pokud stále běží `t57-production-soak.mjs`, **neukončovat jej**. Po skončení analyzovat soukromý NDJSON journal příkazem `node scripts/t57-production-soak.mjs --analyze <private-file.ndjson>` s cestou potvrzenou správcem. Surový journal neukládat do PR.
4. ADSBDB: pouze číst administrátorský `/api/system/status`. Vyhodnotit `providerStatus`, `consecutiveFailures`, `lastSuccessAt`, `lastFailureAt`, `persistence.nextCheckpointAt`, `checkpointFailures` a `dirtyAgeMs`. Nevyvolávat hromadné upstream dotazy a nevypínat backoff.
5. Route DB: sledovat hodinová počitadla `dbHit/dbMiss/dbError/dbBypassed` v administraci. Neprovádět migraci bez samostatného souhlasu a předprodukční kontroly.
6. Navigation Integrity: po nasazení rozebrat `rejectionReasons` a poměr skutečných odmítnutí vůči platným pozorováním. Důvody `no_integrity_fields`, `on_ground` a `no_position` nejsou důkaz GNSS rušení. Veřejné predikce aktivovat až po úspěšné akceptaci.

## Omezení tohoto PR
- Bez přístupu k produkčním logům nelze opravit dosud neznámou příčinu restartů.
- Kód nemůže zaručit dostupnost cizí služby ADSBDB, jen bezpečný fallback a správný backoff. Nenahrazuje provozní ověření.
- Nemění výchozí hodinové checkpointy ani neukončuje T5.7 měření; nepovoluje nové placené API nebo jiné datové zdroje.
