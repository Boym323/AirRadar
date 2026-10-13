# Autonomní optimalizace výkonu a spolehlivosti

[English version](../../performance/AUTONOMOUS-OPTIMIZATION.md)

Stav: runtime oprava je nasazena; probíhá post-release soak. Poslední
aktualizace:
2026-10-13 (Europe/Prague).

## Rozsah a důkazy

Zpráva zachycuje produkční šetření pro measurement ID
`9b6f1bd2-1efa-4846-a1cc-a45b086d16ca`. Zdrojový artefakt zůstává v
`/tmp/airradar-t57-v5-aSXmmm/soak.ndjson`; není kopírován do repozitáře ani
odesílán. Analyzátor odmítl zpracování bez autorizovaných diagnostik, proto
jsou níže uvedená čísla odvozena z omezených vzorků a korelována s lokálními
záznamy systemd.

Výchozí soak byl pořízen na verzi `1.0.437`, commitu `3596e96e`. Během šetření
produkce přešla přes `1.0.438`; potvrzená oprava je nyní nasazena jako verze
`1.0.440`, commit `d6831804`, build z `2026-10-13T12:36:09Z`. Produkce stále
běží jako `airradar.service` v jednom Node procesu s politikou
`Restart=on-failure` a bez limitu `MemoryMax` pro službu; tlak na paměť a
zaznamenané OOM nastaly v obklopujícím `system.slice`.

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

Potvrzeným selháním je růst paměti do podmínek tlaku cgroup a ukončení hlavního
procesu, spolu s vysokým CPU a zpožděním event loopu. Samotná service cgroup má
`MemoryMax=infinity`, takže důkazy neurčují lokální hard limit služby. Omezená
retenční diagnostika nepotvrdila jednu neomezenou mapu nebo trail, proto nebyla
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

Hlavní optimalizace hot path je nyní nasazena. Validátor výsledků eventů
Operational Twin udržuje omezený reverzní index od ICAO hex na ID čekajících
výsledků, prochází jen letadla z aktuálního lokálního snapshotu a přeskočí práci
s body trailu, pokud se časové okno výsledku nemůže překrývat s aktuální pravdou.
Vyřešení, expirace, kapacitní evikce i reset odstraňují záznamy z obou map a
zachovávají původní omezený kontrakt fronty.

Změna byla sloučena v PR #847 (`f4bbf269`) a vydána s opravami identity release
v PR #848 (`954fab24`) a #851 (`d6831804`). CI prošlo úplným Vitest/typecheck gate, prepared
buildem, kritickým runtime smoke testem, produkční browser bránou,
výkonnostní regresí a CodeQL. Syntetický benchmark event-outcome proběhl jako
regresní kontrola, ale jeho scénář nebyl použit jako důkaz produkčního zrychlení.

Post-release důkaz v 2026-10-13 14:42 CEST: veřejný health vrátil `200`,
databáze i local-beast zdroj byly zdravé, `/api/version` vrátil
`1.0.440` / `d6831804` / `production`, služba byla aktivní s `NRestarts=0` a
nový proces měl přibližně 0,7 GiB residentní paměti. Tag `v1.0.440` ukazuje na
přesný plný commit artefaktu `d683180489e063164e511bb1e7fd31b3fe1b7399`.
Jde o první pozorování po restartu, nikoli o důkaz, že otázka úniku je uzavřena.
Historický tag
`v1.0.439` ukazuje na `f4bbf269`, protože vznikl prvním automatizovaným
nasazením před sloučením opravy release identity; záměrně se nepřepisuje.
PR #851 nyní před přijetím existujícího nebo nově vytvořeného tagu vyřeší a
ověří cíl z validovaného manifestu artefaktu.

V 2026-10-13 14:43 CEST první uložený vzorek po restartu zaznamenal p95
`twin.eventOutcome.local` `0,231 ms`, p95 Operational Twin `0,414 ms` a RSS
procesu `754 MiB`, zatímco v postiženém segmentu byl hot path přibližně
`5,21–5,38 s`. Stejný vzorek stále ukázal degradaci route/DB
(`databaseCallP95Ms` `2,54 s`, route circuit otevřený), takže oprava indexu řeší
potvrzený hot path Twin, ale netvrdí, že odstranila nezávislý tlak databáze nebo
providerů. 24hodinový soak zůstává otevřený.

Incident ledger používá stabilní identifikátory `runtime-cpu`,
`runtime-event_loop`, `runtime-database_call`, `runtime-route_circuit` a
`runtime-availability`. V každém vzorku se ukládá jen stav, čas, čítače a
omezené percentily. Chyba vzorkování se započítá do dostupnosti, ale její
text ani odpověď poskytovatele se neukládá. Historie zůstává omezena na
1 440 vzorků a 2 MiB.

## Ověření a další krok

Prošly cílené testy health probe, watchdogu, přechodů incidentů, persistence
telemetrie a úklidu omezeného event-outcome indexu. Úplný CI typecheck a Vitest
gate prošly. Po release je nutný 24hodinový soak s kontrolou RSS, event loopu,
DB settlementu a incident ledgeru. Pokud RSS znovu poroste do podmínek tlaku
systémové paměti, dalším krokem bude autorizovaný heap/retainer capture
korelovaný s těmito agregovanými čítači; monitor heap snapshoty neukládá.

Při této validaci se nesmí zaměnit selhání monitorovacího požadavku za restart
procesu: dostupnost veřejného endpointu, stáří zdroje, systemd stav, PID a
cgroup paměť se vyhodnocují odděleně. Monitor také nesmí restartovat kvůli
jednomu pomalému DB požadavku; restartovací watchdog vyžaduje současně starý
poslední úspěch i starý poslední pokus.
