# T1/T2 – sledování výkonu (pouze čtení)

Tyto nástroje přidávají **volitelnou diagnostiku**, nikoli nové načítání dat, dotazování databáze ani změny výchozího provozu.

## Pozorování procesových I/O operací

Na linuxovém serveru zjistěte **PID procesu Node.js služby AirRadar** (nikoli PID shellu). Spusťte:

```bash
AIRRADAR_AUDIT_PID=12345 AIRRADAR_AUDIT_DURATION_MS=60000 node scripts/audit-process-io.mjs
```

Nástroj pouze čte `/proc/<PID>/io` a `/proc/<PID>/stat` a kontroluje identitu procesu na začátku i na konci měření. Použijte více časových oken při porovnatelné provozní zátěži. Výsledky jsou **logické procesové zápisy, nikoli fyzické zápisy na disk ani určení konkrétních souborů**. Nástroj nezaznamenává názvy souborů, neinjektuje instrumentaci, nepovoluje rozšíření PostgreSQL ani nemění nastavení běžící služby. Volitelný výstup: `AIRRADAR_AUDIT_OUTPUT=/tmp/airradar-io.json` (pouze vytvoření nového souboru). Pokud chybí oprávnění pro čtení cílového procesu, nástroj skončí chybou.

## Volitelné opakovatelné výkonnostní limity

```bash
node scripts/audit-performance-regressions.mjs /tmp/measurements.json /tmp/budgets.json
```

Soubor limitů je JSON objekt mapující číselné položky reportu (cesty oddělené tečkami) na maximální povolené hodnoty, například `{"perMinute.write_bytes.mibPerMin":80}`. Chybějící a nečíselné metriky **znamenají neúspěšnou kontrolu**. Prahové hodnoty mají význam pouze při použití stejného prostředí a reprezentativní zátěže. Na sdílených CI runnerech nezapínejte pevné časové limity.

Před optimalizací historicky vysoké intenzity zápisů Node procesu doplňte samostatné, schválené, nízkonákladové měření podle cest k souborům. Samotné procesové I/O neprokazuje, že příčinou je cache.

Změna nezahrnuje nasazení, migraci, restart, čištění dat ani plánovanou úlohu.
