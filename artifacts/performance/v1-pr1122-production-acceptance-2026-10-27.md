# V1 PR #1122 – produkční výkonnostní přejímka

Datum: 2026-10-27

Projekt: `Boym323/AirRadar` V1

Produkce: `1.0.557`, commit `5c4d8037`

Baseline: `a71dbbec`

Node: `v22.23.3`
Měření: read-only, 15 minut, 10 s interval, 91/91 vzorků, 0 mezer

## A. Produkce

### Identita a stabilita

| Kontrola | Výsledek |
|---|---:|
| `/api/health` | HTTP 200, `status=ok`, PostgreSQL OK, readsb/BEAST live |
| `/api/version` | `1.0.557` / `5c4d8037` / `production` |
| `/api/system/status` | OK; admin projection dostupná; Rust aktivní |
| `/api/system/runtime-performance` | OK; process-local schema v4 |
| `/api/aircraft` | HTTP 200; v průběhu 23–51 letadel |
| SSE V1 | HTTP 200; probe 2 737 473 B za 3 s; klient po probe uzavřen |
| SSE V2 | HTTP 200; probe 655 281 B za 3 s; klient po probe uzavřen |
| `airradar.service` | `active/running`, `NRestarts=0`, stejný start/PID |
| Rust BEAST parser / CRC | `rustActive=true`, `parserBackend=rust`, `crcBackend=rust` |

SSE probe byl krátký diagnostický klient, nikoli syntetická produkční zátěž. Během
15minutového okna byli aktivní SSE klienti 0; veřejná runtime projekce neposkytuje
kumulativní V1/V2 byte counters, proto běžný přenos nelze z tohoto rozhraní přesně
kvantifikovat.

### CPU, paměť, event-loop a GC

CPU je normalizováno na jedno jádro; CPU čas a wall time nejsou zaměňovány.

| Metrika | Výsledek |
|---|---:|
| CPU mean / P50 | 19,46 % / 19,32 % |
| CPU P95 / P99 / max | 29,13 % / 40,70 % / 40,70 % |
| CPU čas za okno | 174 380 ms |
| RSS P50 / P95 / P99 / max | 1 348,96 / 1 459,64 / 1 474,18 / 1 474,18 MiB |
| heap used P50 / P95 / P99 / max | 427,32 / 993,90 / 1 177,37 / 1 177,37 MiB |
| event-loop lag P95 metric P95 | 20,99 ms |
| event-loop lag P99 metric P95 / P99 | 45,15 / 72,29 ms |
| nejvyšší single-window max | 671,61 ms |
| GC count / major GC | 4 315 / 44 |
| GC pause celkem / podíl okna | 13 703,5 ms / 1,52 % |
| GC recent max / průměrný pause P95 | 25,95 / 3,62 ms |

RSS vzrostl z přibližně 576 MiB na 1,43 GiB; po posledním major GC byl heap přibližně
270 MiB, ale RSS zůstal vysoký. Po skončení odběru služba sama snížila heap přibližně
na 469 MiB a RSS na 1,41 GiB. Jde o významný paměťový nález, nikoli o důkaz konkrétního
leaku; měření neprovádělo heap snapshot ani profiler.

### Ingest, letadla a DB

| Metrika | Delta za 15 min |
|---|---:|
| letadla P50 / P95 / min–max | 41 / 50 / 23–51 |
| lokální BEAST frames received / decoded / decode errors | 708 697 / 379 805 / 328 892 |
| lokální reconnects | 0 |
| Comm-B frames / decoded / ambiguous / rejected | 103 036 / 62 830 / 22 / 40 184 |
| network bytes / lines / parsed / malformed | 352 726 772 / 3 663 378 / 3 663 360 / 0 |
| snapshot apply | 297 volání, 19,81/min |
| altitude candidates counter | 392 005 |

`altitude candidates` zahrnuje také decoder/failover cesty; nelze jej vydávat za
čistý počet merge evaluací. Samostatný timer pro `mergeAircraftObservations` ani
altitude selection nasazená instrumentace nemá.

PostgreSQL read-only delta:

| PostgreSQL statistika | Delta | Přibližně/min |
|---|---:|---:|
| commits | 4 677 | 311,8 |
| rollbacks | 0 | 0 |
| inserted / updated / deleted tuples | 4 608 / 3 441 / 10 | 307,2 / 229,4 / 0,7 |
| deadlocks | 0 | 0 |
| app transaction failures/timeouts | 0 / 0 | 0 / 0 |

V `pg_stat_activity` nebyl pozorován lock wait ani deadlock. Nejčastější stav byl
běžný `ClientRead/idle`; aktivní backend byl nejvýše 1. Aplikační DB instrumentace
ukázala nejvíce práce v `history.snapshot` (484 transakcí) a `receiver` agregacích.

### Hot paths

Timer hodnoty jsou za 15 minut a jsou inclusive/overlapping, proto se nesčítají.

| Cesta | volání | CPU ms | wall ms | wait ms |
|---|---:|---:|---:|---:|
| `ingest.local-beast` | 31 213 | 9 777,8 | 9 777,8 | 0 |
| `history.persist` | 297 | 5 050,5 | 5 493,1 | 442,5 |
| `history.transaction` | 297 | 5 044,5 | 5 487,0 | 442,5 |
| `snapshot.network` | 816 | 4 925,7 | 4 925,7 | 0 |
| `snapshot.network.ingest` | 816 | 4 191,7 | 4 191,7 | 0 |
| `snapshot.trail-update` | 628 696 | 2 711,5 | 2 711,5 | 0 |
| `network.metadata` | 296 | 1 676,9 | 5 342,5 | 3 665,6 |
| `snapshot.navigationIntegrity` | 1 113 | 1 638,4 | 1 638,4 | 0 |
| `snapshot.apply.total` | 297 | 1 389,2 | 1 389,2 | 0 |

`snapshot.source-merge` nebyl mezi top-12 cestami. Z endpointu je tedy dostupná
jen konzervativní informace, že pokud counter existoval mimo top-12, byl pod cutoffem
poslední zobrazené cesty (~1 389 ms, <0,80 % pozorovaného process CPU); skutečný
čas merge nebyl přímo vydán. `mergeAircraftObservations` a altitude selection mají
counter/provenance data, nikoli samostatné CPU časování.

## B. Izolované A/B

Obě revize běžely v oddělených worktree na stejném hostu, Node `v22.23.3`, stejných
fixture/configuracích, se stejným 50% překryvem map. Každý scénář měl warm-up, 7
vzorků po 10 průchodech, 4 opakování a střídání pořadí baseline/kandidát. Výsledky
jsou mediány přes čtyři procesní běhy. Procento je `(candidate-baseline)/baseline`;
záporné číslo znamená zrychlení.

| Letadel na zdroj | Změněno | CPU P50 ms | Wall P50 ms | CPU P95 ms | Wall P95 ms | Parita |
|---:|---:|---:|---:|---:|---:|:---:|
| 50 | 0 % | 4,76 → 6,76 (+42,0 %) | 3,99 → 4,02 (+0,6 %) | 12,14 → 11,43 (-5,9 %) | 5,14 → 4,88 (-5,1 %) | PASS |
| 50 | 10 % | 2,26 → 2,14 (-5,5 %) | 1,39 → 1,47 (+5,7 %) | 3,40 → 3,28 (-3,4 %) | 1,93 → 1,82 (-6,0 %) | PASS |
| 50 | 100 % | 1,59 → 1,31 (-17,9 %) | 1,45 → 1,29 (-11,4 %) | 2,82 → 2,44 (-13,4 %) | 1,80 → 1,57 (-12,7 %) | PASS |
| 250 | 0 % | 9,61 → 8,38 (-12,9 %) | 7,74 → 6,65 (-14,1 %) | 31,62 → 28,84 (-8,8 %) | 15,32 → 13,34 (-12,9 %) | PASS |
| 250 | 10 % | 6,22 → 6,59 (+5,9 %) | 5,73 → 5,82 (+1,5 %) | 8,64 → 8,01 (-7,3 %) | 6,99 → 6,84 (-2,2 %) | PASS |
| 250 | 100 % | 6,36 → 6,04 (-5,1 %) | 5,86 → 5,72 (-2,2 %) | 9,94 → 8,10 (-18,5 %) | 9,12 → 6,72 (-26,3 %) | PASS |
| 1 000 | 0 % | 32,53 → 33,23 (+2,2 %) | 27,91 → 28,69 (+2,8 %) | 41,58 → 36,08 (-13,2 %) | 31,37 → 31,29 (-0,3 %) | PASS |
| 1 000 | 10 % | 32,36 → 31,39 (-3,0 %) | 29,15 → 27,76 (-4,8 %) | 39,17 → 37,38 (-4,6 %) | 34,03 → 31,81 (-6,5 %) | PASS |
| 1 000 | 100 % | 32,79 → 31,62 (-3,6 %) | 28,77 → 27,28 (-5,2 %) | 35,33 → 38,88 (+10,1 %) | 32,38 → 34,78 (+7,4 %) | PASS |
| 5 000 | 0 % | 301,25 → 303,13 (+0,6 %) | 206,30 → 202,60 (-1,8 %) | 318,15 → 336,72 (+5,8 %) | 215,21 → 235,52 (+9,4 %) | PASS |
| 5 000 | 10 % | 306,96 → 324,10 (+5,6 %) | 213,67 → 216,92 (+1,5 %) | 325,49 → 331,47 (+1,8 %) | 225,98 → 264,47 (+17,0 %) | PASS |
| 5 000 | 100 % | 306,15 → 320,39 (+4,7 %) | 216,84 → 217,83 (+0,5 %) | 325,82 → 323,68 (-0,7 %) | 224,40 → 234,77 (+4,6 %) | PASS |

Po forced GC v samostatných procesech byl heap po GC na 5 000 prakticky shodný
(přibližně 16,5 / 17,2 / 20,5 MiB podle změněného poměru). RSS po GC kandidáta byl
přibližně o 2,9–3,1 % nižší, což je pouze orientační V8 allocator evidence.

Paritní digest byl shodný ve všech 12 scénářích a všech opakováních. Kontroloval
union, identitu a pořadí výsledků, source arbitration, altitude provenance a
emergency/squawk pole. Focused testy na obou revizích: **35/35 passed**.

Historické číslo z dokumentace PR (`269,08 → 218,41 ms`, `-18,8 %`) se v tomto
opakovaném běhu stejného PR fixture neprojevilo jako stabilní workload-independent
zrychlení. Proto je zde neprezentuji jako aktuální reprodukované měření.

## C. Závěr

1. **Samotné slučování:** produkční endpoint neposkytl samostatný `source-merge`
   counter; v top-12 nebyl. Dostupná horní mez je pod ~1,389 s za 15 min, tedy
   pod ~0,80 % pozorovaného process CPU. Izolované A/B je smíšené a na 5 000
   letadlech nevykázalo konzistentní úsporu; nelze tvrdit 18,8 % pro celý server.
2. **Frekvence cesty:** merge/altitude counters nejsou čistě rozlišené. `altitudeCandidates`
   narostl o 392 005, ale zahrnuje také BEAST decoder a failover. Snapshot ingest
   proběhl 297× lokálně a 816× network; samotný merge timing nebyl veřejně
   vydán mimo top-12.
3. **Podíl na CPU:** největší prokazatelné cesty byly lokální BEAST ingest,
   history persistence/transaction, network snapshot a network metadata. Merge
   je podle dostupné top-12 projekce menší než cutoff, nikoli dominantní hotspot.
4. **Event-loop/GC:** event-loop P99 metric P95 45,15 ms a P99 72,29 ms; max
   window 671,61 ms. GC pause share 1,52 %. Produkční zrychlení PR na event-loop
   ani GC z tohoto okna nebylo prokázáno.
5. **Největší další nález:** paměťový růst RSS/cgroup z ~576 MiB na ~1,43 GiB,
   s peakem ~1,51 GiB. To je vhodnější kandidát k samostatnému, bezpečnému
   memory-retention auditu než další optimalizace merge.

### Doporučení

PR #1122 zůstává funkčně/paritně přijatelná a produkce je stabilní, ale další
CPU optimalizaci merge bych nyní neprováděl. Nejprve bych samostatně ověřil
paměťový růst a rozšířil read-only runtime projection o explicitní timer pro
`snapshot.source-merge` a altitude selection. Teprve potom má smysl cílit další
optimalizaci podle nového profilu. Operational Twin se ve V1 neměří, protože je
retired.
