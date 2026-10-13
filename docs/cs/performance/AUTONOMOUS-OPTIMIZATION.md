# Autonomní optimalizace výkonu a spolehlivosti

[English version](../../performance/AUTONOMOUS-OPTIMIZATION.md)

Stav: probíhá implementace a release validace. Poslední aktualizace:
2026-10-13 (Europe/Prague).

## Rozsah a důkazy

Zpráva zachycuje produkční šetření pro measurement ID
`9b6f1bd2-1efa-4846-a1cc-a45b086d16ca`. Zdrojový artefakt zůstává v
`/tmp/airradar-t57-v5-aSXmmm/soak.ndjson`; není kopírován do repozitáře ani
odesílán. Analyzátor odmítl zpracování bez autorizovaných diagnostik, proto
jsou níže uvedená čísla odvozena z omezených vzorků a korelována s lokálními
záznamy systemd.

Produkce běžela na verzi `1.0.437`, commitu `3596e96e`, v jednom Node procesu.
Systemd potvrdil tři ukončení OOM killerem s maximem přibližně 1,9 GiB.

## Základní stav

Soak měl tři validní segmenty: 45, 26 a 19 vzorků. CPU p95 bylo přibližně
92 %, 99 % a 100 %, RSS dosáhl 1,91, 1,92 a 1,73 GiB a maximum p99 zpoždění
event loopu bylo 8,3, 6,5 a 9,6 s. Route-cache circuit byl otevřen ve 44/45,
25/26 a 19/19 vzorcích.

| Segment | Vzorky | UTC interval | CPU p50 / p95 | RSS p50 / maximum | maximum event-loop p99 |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 45 | 08:22:10–09:15:12 | 82,9 % / 92,0 % | 1,84 / 1,91 GiB | 8,3 s |
| 2 | 26 | 09:22:13–09:50:11 | 77,8 % / 99,0 % | 1,38 / 1,92 GiB | 6,5 s |
| 3 | 19 | 09:54:11–10:22:15 | 93,1 % / 100 % | 1,68 / 1,73 GiB | 9,6 s |

## Korelace procesních segmentů

Mezery v soaku nejsou považovány za deployment. Journal potvrdil OOM v 11:21:03,
11:53:03 a 13:26:47 CEST, pokaždé s výsledkem systemd `oom-kill`; proces byl
automaticky restartován. Dřívější čisté SIGTERM restarty jsou od této korelace
oddělené. Po posledním restartu health endpoint opět hlásil lokální zdrojová
data, ale produkce stále běžela na `1.0.437` až do tohoto release.

## Posouzení hlavní příčiny

Potvrzeným selháním je růst paměti až k limitu cgroup a ukončení hlavního
procesu, spolu s vysokým CPU a zpožděním event loopu. Omezená retenční
diagnostika nepotvrdila jednu neomezenou mapu nebo trail, proto nebyla
provedena spekulativní změna interního algoritmu.

Potvrzenou odstranitelnou režií je minutový watchdog volající plný
`/api/system/status`. Nyní používá `/api/health?watchdog=1`, který vrací jen
připravenost a čerstvost ADSB.lol.

Vzorky dále ukázaly, že na konci třetího segmentu měly inkluzivní hot-path
percentily přibližně `history.persist` a `history.transaction` 55,6 s,
`network.metadata` a `atc.resolve` 4,5 s a `snapshot.apply.total` 3,7 s.
Měření je záměrně popsané jako inkluzivní: vnořené scope se nesčítají jako
exkluzivní CPU. Route-cache měří čas do vypořádání Promise, včetně čekání na
pool a síť; neměří serverový SQL čas.

## Trvalý monitoring

Existující 60sekundová telemetrie s retencí 24 hodin nyní ukládá také PID/build,
CPU, event-loop, GC, p95 vypořádání DB volání, stav circuitu, vybrané hot-path
p95 hodnoty a počty retenčních struktur. Incidenty mají stabilní ID a jsou
omezeny na agregované hodnoty. Prahy jsou CPU p95 >85 %, event-loop p99 >1 000
ms, DB p95 >1 000 ms, circuit otevřený >50 % a dostupnost <95 %. Tři po sobě
jdoucí okna znamenají critical, tři z pěti degraded a aktuální porušení warning.

Monitor neukládá payloady ani tajné údaje a nemůže měnit kód, konfiguraci,
schéma nebo release.

Incident ledger používá stabilní identifikátory `runtime-cpu`,
`runtime-event_loop`, `runtime-database_call`, `runtime-route_circuit` a
`runtime-availability`. V každém vzorku se ukládá jen stav, čas, čítače a
omezené percentily. Chyba vzorkování se započítá do dostupnosti, ale její
text ani odpověď poskytovatele se neukládá. Historie zůstává omezena na
1 440 vzorků a 2 MiB.

## Ověření a další krok

Prošly cílené testy health probe, watchdogu, přechodů incidentů a persistence
telemetrie; typecheck prochází. Po release je nutný nový soak s kontrolou RSS,
event loopu, DB settlementu a incident ledgeru. Pokud RSS znovu poroste k limitu,
dalším krokem bude autorizovaný heap/retainer capture korelovaný s těmito
agregovanými čítači; monitor heap snapshoty neukládá.

Při této validaci se nesmí zaměnit selhání monitorovacího požadavku za restart
procesu: dostupnost veřejného endpointu, stáří zdroje, systemd stav, PID a
cgroup paměť se vyhodnocují odděleně. Monitor také nesmí restartovat kvůli
jednomu pomalému DB požadavku; restartovací watchdog vyžaduje současně starý
poslední úspěch i starý poslední pokus.
