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

Po nejméně 24 hodinách spusťte `npm run monitor:report`. Ve stejném časovém
okně porovnejte delta čítačů transakcí, WAL a lock waitů. Mezery ve vzorcích
jsou mezery, nikoli zdravé nuly.

## 24hodinová evidence a návrh dashboardu

Grafana má být navržena až podle skutečně nasbíraných polí: CPU/RSS procesu,
event-loop P99, WAL za minutu, commit/rollback rate, lock waits, dostupnost
vzorků a případně CPU celého hostitele. Navržené alerty pokrývají mezeru ve
vzorcích, nedostupnou telemetrii, růst RSS, event-loop P99, lock waits,
anomálii rollbacků a růst WAL. Tato změna Grafanu ani exporter neinstaluje.

## Produkční evidence (2026-10-28)

Standardní deployment dokončil commit `83c183b0aa3409961553052d76d557533cb2a850`,
verzi `1.0.567`, kanál `production`. CI
[40732407283](https://github.com/Boym323/AirRadar/actions/runs/40732407283) a
CodeQL [40732407279](https://github.com/Boym323/AirRadar/actions/runs/40732407279)
prošly; `/api/version` i health endpointy v produkci vrátily úspěch.

Dirty checkout byl obnoven cíleně, bez slepého resetu. Dva soubory MapLibre
byly výstupem `maplibre-gl@6.14.0`; původní stav je zachován v lokální auditní
referenci `backup/production-generated-maplibre-4eabcd6`.

Dva skutečné systemd canary běhy prošly včetně Node V8 JIT, autentizované
runtime telemetrie, PostgreSQL statistik, validního JSONL, režimů `0600` a
kontroly úniku credentials. CPU vzdáleného PostgreSQL hostitele je
`unavailable` (`not_configured`), nikoli nula.

Timer zůstává záměrně vypnutý. Role `airradar` není read-only: má zápisová
oprávnění na 35 aplikačních tabulkách a CREATE na databázi/schema. Je nutná
samostatná least-privilege monitorovací role nebo schválená ekvivalentní změna.
Dosavadní evidence má pouze čtyři vzorky v neúplném okně; 24hodinová
kontinuita, retence, výpadky a časově sladěné agregace proto nejsou potvrzené.
