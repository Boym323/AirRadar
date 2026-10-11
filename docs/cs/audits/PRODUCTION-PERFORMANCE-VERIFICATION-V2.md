# Ověření produkčního výkonu AirRadar V2

Měřicí zpráva pro issue #822 a produkční dopad PR #826, #827 a #829.

## Rozsah a hranice důkazů

- Datum měření: 11. 10. 2026, CEST; důkazy byly získány mezi 20:34:02 a
  20:34:24 CEST (18:34:02–18:34:24 UTC).
- Nasazená verze: v1.0.431, commit `cdc907ac` (úplný commit z release briefu:
  `cdc907ac8c350a710b48174899b4d9160459ad57`).
- Start produkčního procesu: 11. 10. 2026 20:29:13.546 CEST.
- Lokální checkout je novější než nasazený build; zdroj byl pouze ověřen.
  Nebyl spuštěn release ani produkční build.
- Zdroje: `/api/health`, `/api/system/status`, `/api/system/integrations`,
  `/api/system/runtime-performance`, `/api/system/runtime-history`, systemd a
  journal, read-only kontrola PostgreSQL a předchozí audit V1.
- Kumulativní čítače PostgreSQL byly zaznamenány včetně `stats_reset`; nebyly
  resetovány a nejsou vydávány za post-release sazby bez odpovídajícího rozdílu.

## Výsledek

Nasazení je zdravé a běží na v1.0.431. Retenční optimalizace je ve zdroji a
produkční plán nového dotazu je očekávaný bounded index scan přes
`flightPosition_recordedAt_idx_fd5b4732`. Stabilní procentuální zrychlení však
nelze tvrdit: původní vzorek měl jen tři volání a audit nespustil nový retenční
job.

Nevyřešeným bottleneckem zůstává route enrichment. Ve snapshotu 20:34 CEST bylo
10 PostgreSQL timeoutů, 63 bypassů kvůli souběhu, 9 bypassů po backoffu a 42
úspěšných SQL vzorků s P50 9 ms, P95 2 642 ms a P99/max 2 754 ms. To potvrzuje
problém, ale zatím nerozděluje čekání na pool, samotné SQL a plánování v Node.
Externí routeset provider byl současně v cooldownu; jeho chyby nejsou důkazem
problému PostgreSQL.

## Stav produkce

| Položka | Zjištěná hodnota |
| --- | --- |
| Aplikace | `ok`, produkční kanál |
| Verze / commit | v1.0.431 / `cdc907ac` |
| Build time | 11. 10. 2026 20:25:24 CEST |
| Start procesu | 11. 10. 2026 20:29:13.546 CEST |
| Status sample | 11. 10. 2026 20:34:02.877 CEST |
| Uptime | 294,5 s |
| Deployment | systemd stop/start dokončen; služba active/running |
| Veřejný health | HTTP 200; aplikace, DB i source `ok` |
| Receiver | live; v health vzorku 62 aircraft |
| PostgreSQL | 17.10; DB `airradar`; připojena |
| Poslední Integration Health | 11. 10. 2026 20:34:08.089 CEST; provider blocked; DB route timeouty |
| Poslední runtime history | 11. 10. 2026 20:33:17.235 CEST |
| Uptime LXC/Proxmox | NOT MEASURED |

Předchozí proces skončil v 20:29:02 CEST po 43m49s CPU času a s peakem 1,3 GB.
Nový proces nastartoval v 20:29:13 CEST. Ukončení hlásilo timeouty několika
shutdown kroků, ale systemd označil stop jako úspěšný a nový proces naběhl.

### Čistota oken

| Okno do 20:34:08 CEST | Vzorky | Před release | Po release | Klasifikace |
| --- | ---: | ---: | ---: | --- |
| 1 hodina | 60 | 55 | 5 | smíšené; není čisté post-release |
| 6 hodin | 356 | 351 | 5 | smíšené; není čisté post-release |
| 24 hodin | 1 440 | 1 435 | 5 | smíšené; není čisté post-release |
| Přesné post-release minute vzorky | 5 | 0 | 5 | příliš krátké |

## PostgreSQL

Minute health probe neměl v žádném okně neúspěšný vzorek:

| Okno | Vzorky | P50 | P95 | P99 | Max | Selhané probe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 hodina | 60 | 122 ms | 417 ms | 2 099 ms | 2 099 ms | 0 |
| 6 hodin | 356 | 61 ms | 336 ms | 1 450 ms | 4 757 ms | 0 |
| 24 hodin | 1 440 | 16 ms | 323 ms | 1 085 ms | 7 539 ms | 0 |

Read-only kontrola v 20:34:23.852 CEST zjistila 13 backendů, 1 aktivní dotaz a
žádný udělený lock wait. `flightPosition` měl odhad 5 028 163 řádků, tabulku
812 MiB a indexy 619 MiB; 33 223 dead rows. Poslední autovacuum bylo v
15:59:32 CEST. `max_connections=100`, `shared_buffers=128 MiB`, `work_mem=4
MiB`, `track_io_timing=on`, `track_wal_io_timing=off`.

Checkpoint/WAL čítače jsou kumulativní od 6. 9. 2026 22:03:35 CEST: 10 039
časovaných checkpointů, 41 vyžádaných a 98 318 538 461 WAL bytes. Sazby za
časové okno, Proxmox, DB-LXC CPU/RAM a sdílené storage I/O jsou NOT MEASURED.

## FlightPosition retention

`lib/server/history.ts` vybírá expirovaná ID pouze predikátem `recordedAt` a
bounded limitem, potom maže podle ID. Test potvrzuje odstranění `ORDER BY id` a
bounded mazání. Produkční index je:

```text
flightPosition_recordedAt_idx_fd5b4732 ON public."flightPosition" ("recordedAt")
```

Produkční EXPLAIN má tvar `Limit -> Index Scan` přes tento index, bez sortu a
`Gather Merge`. Index měl 6 795 scanů.

V1 dotaz má v `pg_stat_statements` 3 volání, celkem 12 119,38 ms, průměr
4 039,79 ms a 24 825 řádků. Nový tvar má kumulativně 9 volání a 1,36 ms. Kvůli
malému původnímu vzorku, nesouladu reset/deployment hranice a absenci nového
retenčního běhu nejde o stabilní procentuální zrychlení.

Po restartu: `lastRunAt=null`, `rowsDeleted=0`, `batches=0`, `failureCount=0`.
Produkční retention nebyla spuštěna kvůli benchmarku. Verdikt: PASS WITH
LIMITATIONS; časové ověření je PENDING.

## Route cache

V 20:34:08.089 CEST:

| Metrika | Hodnota |
| --- | ---: |
| Úspěšné SQL timing vzorky za poslední hodinu | 42 |
| SQL P50 / P95 / P99 / max | 9 / 2 642 / 2 754 / 2 754 ms |
| DB hit / miss | 179 / 1 733 |
| DB errors / bypasses | 1 559 / 7 788 |
| PostgreSQL timeout / query / connection failures | 10 / 0 / 0 |
| Bypass backoff / concurrency / unconfigured | 9 / 63 / 0 |
| RAM hits, persistované 24h čítače | 43 985 |
| Platné DB cache entries | 106 |

Lookup používá primární index `cacheKey` a single-row limit. ATC version lookup
také používá primární index. Chybějící index tedy není doloženou příčinou.
Aktuální implementace drží slot až do skutečného dokončení SQL; timeout 750 ms
slot předčasně neuvolňuje.

Routeset provider byl v cooldownu a měl 55 přeskočených požadavků. Oddělení
SQL execution / connection-pool wait / application queue je NOT MEASURED.
Verdikt: FAIL.

## ATC, Node.js a SSE

`AtcDatasetVersion` měl 178 version SELECTů, celkem 2,50 ms, průměr 0,01 ms a
178 scanů primárního klíče. Významná DB zátěž verzovacím SELECTem se nepotvrdila.
Reprezentativní hit/miss, invalidace, load count, geometrické transformace,
paměť a DB verification failures jsou NOT MEASURED.

Runtime history obsahuje smíšená okna: RSS P50/P95/max je 1 118/1 266/1 709
MiB za 1h, 1 419/1 795/1 868 MiB za 6h a 1 442/1 890/1 941 MiB za 24h.
Heap P50/P95/max je 630/920/1 410 MiB, 802/1 401/1 554 MiB a 828/1 405/1 613
MiB. Aktuální veřejný snapshot: RSS 1 218 232 320 B, heap 1 034 115 064 B,
cgroup 1 215 455 232 B, 60 aircraft a 0 SSE clients.

CPU, GC distribuce, event-loop P95/P99, SSE payload volume a DB operace/min
nejsou změřeny v čistém post-release soaku. Nula SSE klientů neověřuje fanout.

## Verdikty

| Oblast | Verdikt |
| --- | --- |
| A. FlightPosition retention | PASS WITH LIMITATIONS |
| B. Flight history index | PASS WITH LIMITATIONS |
| C. ATC dataset cache | PASS WITH LIMITATIONS |
| D. Route PostgreSQL cache | FAIL |
| E. PostgreSQL Health | PASS WITH LIMITATIONS |
| F. Runtime CPU/RAM | PASS WITH LIMITATIONS |
| G. Event loop | NOT MEASURED |
| H. SSE | NOT MEASURED |

## Závěry a další postup

Retention změnu ponechat; plán je ověřený, ale procentuální přínos zatím
netvrdit. Neměnit globální PostgreSQL nastavení, nerestartovat PostgreSQL,
neprovádět REINDEX/VACUUM FULL a nezvyšovat route timeouty.

Další cílené měření musí oddělit čekání ve frontě, získání connection, SQL
execution a caller timeout. Pro 1h/6h/24h se mají použít pouze okna na jednom
commitu a jednom process lifetime, se záznamem `stats_reset`, process start,
route timeout/error/bypass delta a odpovídajících `pg_stat_statements` delta.
Issue #822 zůstává otevřená, protože mechanismus route SQL timeoutů a
reprezentativní post-release retenční vzorek nejsou uzavřené.

Read-only opakování používá `/api/health`, `/api/system/status`,
`/api/system/integrations`, `/api/system/runtime-performance`,
`/api/system/runtime-history` a `systemctl show airradar.service`; PostgreSQL
kontrola má používat read-only transakci, `pg_stat_statements`, activity/locks,
indexy, `EXPLAIN (COSTS, SETTINGS, BUFFERS OFF)`, autovacuum, checkpointer, WAL a
`pg_stat_io`. Statistiky neresetovat a retention nespouštět pouze kvůli měření.
