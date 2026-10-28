# Monitoring CPU AirRadaru a PostgreSQL

Monitor z issue #1134 je volitelný read-only sampler. Ukládá sanitizované
vzorky JSONL do `/var/lib/airradar/monitoring`, adresář má režim `0700` a
soubory `0600`. Výchozí retence je 14 dní, nejvýše 90 dní. Neukládá SQL text,
identifikátory letadel ani přihlašovací údaje.

Vzorek spojuje autentizovaný admin endpoint
`/api/system/runtime-performance` (schema 4) s CPU procesu, RSS a event-loop
P95/P99; bounded dotazy na PostgreSQL 17 `pg_stat_database`, `pg_stat_wal` a
`pg_stat_activity`; a volitelně agregovaný `pg_stat_statements`. Volitelný
node_exporter se označuje jako CPU celého DB hostitele, nikdy jako CPU procesu
PostgreSQL.

Při chybějícím admin cookie nebo povinné telemetrii sampler skončí chybou.
Nedostupný exporter je `unavailable`, nikoli nulová hodnota.

Všechny PostgreSQL dotazy vzorku běží v jedné explicitní transakci
`BEGIN TRANSACTION READ ONLY` / `COMMIT`. Volitelné statistiky používají
savepoint, takže chybějící view neukončí transakci v aborted stavu. Jde o
ochranu sdíleného aplikačního účtu do hloubky, nikoli o least-privilege roli.

## Instalace a canary

Po instalaci jednotek vytvořte `/etc/airradar/monitoring.env` s režimem `0600`:

```dotenv
# Musí odpovídat airradar.service. Produkce naslouchá na
# 192.168.1.142:3000, nikoliv na 127.0.0.1:3000.
AIRRADAR_MONITOR_BASE_URL=http://192.168.1.142:3000
# Preferujte existující serverový admin secret, session se obnoví při každém běhu:
AIRRADAR_MONITOR_ADMIN_TOKEN=...
DATABASE_URL=postgresql://airradar:...@db-host:5432/airradar?sslmode=require
# Volitelná URL soukromého exporteru, například http://10.0.0.20:9100
# AIRRADAR_MONITOR_NODE_EXPORTER_URL=http://10.0.0.20:9100
```

Token je existující serverový admin secret; sampler při každém běhu vytvoří
osmihodinovou session. Nejde o nové oprávnění databáze.
Exporter nesmí poslouchat na veřejném rozhraní a monitor nesmí zapisovat do DB.
Nepřidávejte superuser ani široká tabulková oprávnění.

Před aktivací timeru proveďte dva jednorázové canary vzorky přes
`systemctl start airradar-cpu-db-monitor.service`, zkontrolujte journal a
vznik právě jednoho validního vzorku při každém spuštění. Timer lze aktivovat
teprve poté ručně administrátorem příkazem
`systemctl enable --now airradar-cpu-db-monitor.timer`; deployment jej
neaktivuje automaticky.

```bash
sudo systemctl daemon-reload
sudo systemctl start airradar-cpu-db-monitor.service
sudo journalctl -u airradar-cpu-db-monitor.service -n 50 --no-pager
```

Po nejméně 24 hodinách spusťte `npm run monitor:report`. Sampler nyní čte
existující autentizovanou diagnostiku `/api/system/status` a ukládá pouze
SHA-256 fingerprint z `application.startedAt` a `application.commit`; PID,
secret ani interní ID diagnostického store se neukládají. Chybějící identita v
kterémkoli vzorku znamená `unknown`; změněný fingerprint prokazuje restart nebo
změnu nasazeného commitu.

Report používá explicitní hranice okna a koncovou toleranci
`OnUnitActiveSec + RandomizedDelaySec`; nevyžaduje, aby dva vzorky byly od sebe
přesně 86400 sekund. Vnitřní mezery zůstávají mezerami. U PostgreSQL čítačů
`observedContinuity` znamená pouze monotónnost mezi sousedními vzorky,
`verifiedContinuity` navíc vyžaduje známé a nezměněné `stats_reset`. Pokud je
`stats_reset` null nebo chybí, delta čítače zůstává `UNKNOWN`. Ve stejném okně
porovnejte delta čítačů transakcí, WAL a lock waitů.

## 24hodinová evidence a návrh dashboardu

Grafana má být navržena až podle skutečně nasbíraných polí: CPU/RSS procesu,
event-loop P99, WAL za minutu, commit/rollback rate, lock waits, dostupnost
vzorků a případně CPU celého hostitele. Navržené alerty pokrývají mezeru ve
vzorcích, nedostupnou telemetrii, růst RSS, event-loop P99, lock waits,
anomálii rollbacků a růst WAL. Tato změna Grafanu ani exporter neinstaluje.

## Produkční evidence (2026-10-28)

Standardní deployment dokončil commit `e6af8056123d2127b8a3268a182897e213465a37`,
verzi `1.0.570`, kanál `production`. Monitoring validation
[40746357194](https://github.com/Boym323/AirRadar/actions/runs/40746357194), CI
[40746355401](https://github.com/Boym323/AirRadar/actions/runs/40746355401) a
CodeQL [40746354202](https://github.com/Boym323/AirRadar/actions/runs/40746354202)
prošly; `/api/version` i health endpointy v produkci vrátily úspěch.

Dirty checkout byl obnoven cíleně, bez slepého resetu. Dva soubory MapLibre
byly výstupem `maplibre-gl@6.14.0`; původní stav je zachován v lokální auditní
referenci `backup/production-generated-maplibre-4eabcd6`.

Dva skutečné systemd canary běhy prošly včetně Node V8 JIT, autentizované
runtime telemetrie, PostgreSQL statistik a `pg_read_all_stats=true`. Ochranný
test potvrdil `transaction_read_only=on`; `CREATE TABLE` skončilo chybou `25006`
a objekt nevznikl. Canary vzorky i všech 12 aktuálních JSONL vzorků jsou validní,
režimy jsou `0600` a nebyly
nalezeny credentials. CPU vzdáleného PostgreSQL hostitele je `unavailable`
(`not_configured`), nikoli nula. Minutový timer je `enabled/active` a první
automatický trigger proběhl úspěšně.

Sdílená role `airradar` zůstává bezpečnostním kompromisem: používá ji aplikace
a má zápisová oprávnění na aplikačních tabulkách. Explicitní read-only
transakce brání zápisu tohoto sampleru, ale neodebírá širší oprávnění účtu a
není least-privilege řešením. Aktuální report má 12 vzorků od `16:58:03Z` do
`18:46:48Z`, tedy stále neúplné 24hodinové okno. 24hodinová kontinuita,
retence, výpadky a časově sladěné agregace proto nejsou potvrzené.

Navazující živý audit a přesný další krok jsou v
[`artifacts/airradar-v1-monitoring-progress-2026-10-28.md`](../../artifacts/airradar-v1-monitoring-progress-2026-10-28.md).
