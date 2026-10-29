# AirRadar V1 — follow-up k 24h monitoringu

Navazuje na [24hodinový audit](AIRRADAR-V1-24H-PRODUCTION-MONITORING-2026-10-29.md),
jehož verdikt **INSUFFICIENT_EVIDENCE** zůstává nezměněn.

## Příčina pokrytí 58,01 %

Journal neukazuje pády sběrače. Jednotka ve sledovaném období opakovaně
skončila `Deactivated successfully` a JSONL řádek vznikl. Mezi úspěšnými
spuštěními však byly intervaly 80–120 s. Nasazený timer měl:

```ini
OnUnitActiveSec=1min
RandomizedDelaySec=15s
```

bez explicitního `AccuracySec`. Výchozí systemd accuracy přidává další
coalescing až řádově desítky sekund; tím vznikla cadence s 671 mezerami a 676
chybějícími intervaly. Oprava v repozitáři přidává `AccuracySec=1s`. Do
produkce nebyla aplikována a nebyl proveden restart.

## Fingerprint a deployment

Změna fingerprintu v `2026-10-29T15:30:47.215Z` odpovídá skutečnému rebootu:
journal uvádí zastavení `airradar.service` a timeru v 15:26:08 UTC, nový boot
v 15:28:32 UTC a nový Node proces `node[92]` v 15:28:34 UTC. Monitoring sample
v 15:30:47 UTC je první relevantní běh po tomto bootu; změna není klasifikována
jako pouhé kolísání timestampu.

## Event-loop delay 3 602,907 ms

Outlier patří do okna `2026-10-29T14:51:59.232Z`–`14:52:59.232Z` a byl
zachycen před rebootem. Journal v odpovídajícím úseku neobsahuje deployment,
restart ani service failure a současné historické vzorky neobsahují GC
počítadla. Příčina proto není zpětně prokázatelná; report ji nesmí připsat GC,
CPU ani databázi. Oprava zachovává v dalších vzorcích bounded `gcCount`,
`gcPauseMs`, `gcTotalPauseMs` a `gcMaxPauseMs`, takže nový audit může odlišit
GC pauzu od jiného blokování event loopu.

## DB-host CPU a `stats_reset=null`

Sampler nyní při chybějícím soukromém node_exporteru vykazuje
`hostCpu.status=unknown`, nikdy nulu. Volitelný exporter je stále pouze
read-only GET na `/metrics`; volitelný Bearer token se do vzorku ani journalu
neukládá. Exporter nebyl instalován ani aktivován.

`pg_stat_database.stats_reset=null` se zachovává jako legitimní neznámá hranice
statistik. Bez známé a stabilní hranice zůstávají transakční delty `UNKNOWN`;
nebyl přidán žádný syntetický reset ani delta.

## Testy

Cílený kontrakt monitoringu má 19/19 úspěšných testů. Pokrývá timer accuracy,
chybějící intervaly, duplicity, restart/fingerprint, neúplné období,
`stats_reset=null`, nedostupnou DB telemetrii, `UNKNOWN` CPU hostitele a
uchování GC kontextu. `systemd-analyze verify`, `node --check` a `git diff
--check` prošly.

## Návrh dalšího auditu

Po schválení PR nasadit pouze unit změnu a sampler kód běžným deploymentem,
ověřit `systemctl show ... -p AccuracyUSec`, provést minimálně dva skutečné
canary běhy bez restartu aplikace a poté spustit nový 24hodinový audit. Jeho
počátek i konec musí být stanoveny předem; při neúplném endpointu, mezeře,
neznámém fingerprintu, `stats_reset=null` nebo `hostCpu=unknown` musí zůstat
verdikt `INSUFFICIENT_EVIDENCE`.

Následná kontrola po merge odhalila, že původní release skript kopíroval jen
`airradar.service`; nový timer proto zůstal v systemd manageru s
`AccuracyUSec=1min`, přestože nový soubor už byl v checkoutu. Follow-up oprava
rozšiřuje deployment o oba monitoringové unity a po reloadu ověřuje
`AccuracyUSec=1s`. Kontrolní sběr se spouští až po tomto ověření.
