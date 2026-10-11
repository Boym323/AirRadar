# AirRadar PostgreSQL 17 — Issue #822 (2026-10-11)

Tento postup je **ruční a volitelný**. Žádný z SQL souborů se nespouští při CI, deployi ani `prisma db migrate`. **Samotný merge do main nic na PostgreSQL nezmění.**

## Zjištěný stav (Navicat + Proxmox)

- `airradar`: 6 863 MiB; všechny databáze: 9 507 MiB; datový adresář `/var/lib/postgresql/17/main`.
- Databázový LXC: 1 vCPU, 2 GiB RAM, 4 GiB bootdisk ~88 % obsazený.
- Protože velikost DB > bootdisk, **není ověřeno** skutečné umístění PostgreSQL dat a WAL. Nelze bezpečně tvrdit, že 4GiB bootdisk je místem databáze.
- `flightPosition`: ~5,97M živých / ~1,15M mrtvých řádků (16,19 %), poslední autovacuum 2026-10-06, ~33 kumulativních běhů.
- `flight`: ~29k mrtvých, ale autovacuum už běželo ~1029×; jeho interval neměníme.
- `routeEnrichmentCache`: 265 živých řádků / 560 kB; index `cacheKey` i `expiresAtMs` používán. Bez důkazu nepřidávat indexy.
- `xact_rollback` má ~6,9 % kumulativně; samotný counter nedokazuje chybu SQL ani root cause.
- `track_io_timing=off`, `pg_stat_statements` dostupné, ale neinstalované a `shared_preload_libraries` prázdné.
- DB health P99 i route SQL tail mohou být důsledkem host I/O/CPU, poolu nebo SQL. Z jednorázových statistik nelze potvrdit příčinu.

## Postup A — preflight, bez změn

1. Na DB LXC zjistit skutečné souborové systémy dat a WAL a místo na obou:
   ```bash
   findmnt -T /var/lib/postgresql/17/main
   findmnt -T /var/lib/postgresql/17/main/pg_wal
   df -hT /var/lib/postgresql/17/main /var/lib/postgresql/17/main/pg_wal /
   ```
   Pokud je na datovém nebo WAL filesystemu málo místa, NEPOKRAČOVAT; zkontrolovat úložiště, snapshoty/zálohy a růst WAL. Nenavyšovat 4GiB bootdisk naslepo bez znalosti mountů.
2. Ověřit poslední obnovitelnou zálohu PBS/PostgreSQL, případně naplánovat servisní okno.
3. V Navicatu se připojit k `airradar`, spustit `deploy/sql/issue-822-preflight.sql`, uložit výsledky a přesvědčit se, že tabulka nemá vlastní `autovacuum_vacuum_scale_factor`/`autovacuum_vacuum_threshold`. Pokud již ano, navržený skript úmyslně selže.
4. Z Integration Health uchovat referenční 60m i 24h P50/P95/P99 a hodnoty SQL cache, počet bypassů / timeoutů a časy restartů. Nezvyšovat timeouty pro zakrytí špiček.

## Postup B — konzervativní změna autovacuum

Na `airradar` **ručně** spustit `deploy/sql/issue-822-flightposition-autovacuum.sql`.

- Mění jen tabulkové parametry `flightPosition`: `autovacuum_vacuum_scale_factor = 0.10`, `autovacuum_vacuum_threshold = 10000`.
- Při ~6M živých záznamů je přibližný práh ~610k mrtvých řádků namísto ~1,2M pro globální výchozích 20 % (předem ověřit efektivní nastavení).
- `ALTER TABLE` bere krátký **ACCESS EXCLUSIVE lock**; skript s `lock_timeout=2s` raději selže, než aby dlouho blokoval produkční dotazy. Spustit při nízkém provozu.
- Nevolá `VACUUM FULL`, nemaže data, neprovádí `REINDEX` ani restart databáze. Autovacuum se spouští plánovačem PostgreSQL následně.
- Nejde o důkaz výkonového zlepšení. Dřívější vacuum na jednojádrovém LXC může krátkodobě zvýšit I/O/CPU; monitorovat.

## Postup C — vyhodnocení

- Po změně sledovat nejméně 60 min a 24 h: `n_dead_tup`, `autovacuum_count`, `last_autovacuum`, CPU a I/O na DB LXC i hostu, PostgreSQL wait events, DB health P95/P99, route-cache SQL P95/P99 a bypass/error counters.
- Při porovnávání kumulativních counterů vypočítat **rozdíl v časově shodném okně**, kontrolovat `stats_reset`, konzistentní verzi a identitu procesu. Percentily nejsou průkazné bez počtu vzorků a trendu.
- Pokud se údržba zhorší nebo začne nadměrně zatěžovat I/O, vrátit **pouze v případě, že od aplikace tuningu nikdo parametry neměnil** pomocí `deploy/sql/issue-822-flightposition-autovacuum-rollback.sql`.

## Další optimalizace pouze po důkazu

- `track_io_timing=on`: potenciálně užitečné pro detailní časy I/O, ale nejdříve ověřit režii na 1vCPU. Změny globálního nastavení serveru nejsou součástí tohoto PR.
- `pg_stat_statements`: pro skutečné pořadí pomalých SQL vyžaduje konfiguraci `shared_preload_libraries`, restart serveru a `CREATE EXTENSION` v `airradar`. Připravit samostatný bezpečný servisní zásah; neprovádět automatickým deployem aplikace.
- 1 vCPU a 128 MiB `shared_buffers`: kandidáti na posouzení, nikoli důvod pro automatické navýšení. CPU při ukázkovém snímku bylo nízké, `shared_buffers` závisí na RAM, sdílené host cache a zátěži PP Studia.
- `flight`: silná četnost použití indexů; nemažte je bez `EXPLAIN (ANALYZE, BUFFERS)` a prokázané absence kritických dotazů.
- PostgreSQL rollbacky: aplikace již obsahuje operativní atribuci; srovnávat při stejném časovém okně s `db-transaction-diagnostics`, nevyvozovat chyby z `xact_rollback` samotného.
- ADSB.lol 403 je externí přístupový problém; žádné změny DB nemají obcházet ochrannou blokaci.

**Provozní verdikt před skutečným nasazením:** kódové artefakty připravené; měření databáze a aplikace po změně **NEPROBĚHLO**, Issue #822 musí zůstat otevřené.
