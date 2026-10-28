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

## Instalace a canary

Po instalaci jednotek vytvořte `/etc/airradar/monitoring.env` s režimem `0600`:

```dotenv
AIRRADAR_MONITOR_BASE_URL=http://127.0.0.1:3000
AIRRADAR_MONITOR_ADMIN_COOKIE=airradar_watchlist_session=...
DATABASE_URL=postgresql://airradar:...@db-host:5432/airradar?sslmode=require
# Volitelná URL soukromého exporteru, například http://10.0.0.20:9100
# AIRRADAR_MONITOR_NODE_EXPORTER_URL=http://10.0.0.20:9100
```

Cookie je existující krátkodobá admin session, nikoli nové oprávnění databáze.
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

Po nejméně 24 hodinách spusťte `npm run monitor:report`. Ve stejném časovém
okně porovnejte delta čítačů transakcí, WAL a lock waitů. Mezery ve vzorcích
jsou mezery, nikoli zdravé nuly.

## 24hodinová evidence a návrh dashboardu

Grafana má být navržena až podle skutečně nasbíraných polí: CPU/RSS procesu,
event-loop P99, WAL za minutu, commit/rollback rate, lock waits, dostupnost
vzorků a případně CPU celého hostitele. Navržené alerty pokrývají mezeru ve
vzorcích, nedostupnou telemetrii, růst RSS, event-loop P99, lock waits,
anomálii rollbacků a růst WAL. Tato změna Grafanu ani exporter neinstaluje.
