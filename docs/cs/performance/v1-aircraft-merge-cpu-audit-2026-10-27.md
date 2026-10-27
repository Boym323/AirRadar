# AirRadar V1: CPU audit slučování letadel

Datum: 2026-10-27  
Rozsah: `Boym323/AirRadar` V1, větev `main` na revizi `a71dbbec`  
Produkce: bez nasazení v rámci tohoto auditu

## Operational Twin

Aktuální V1 nemá živý Operational Twin evaluator. `lib/server/operational-twin.ts`,
`situation` API i Track Fusion Shadow consumer jsou odstraněné; retirement test
`tests/feature-retirement-e.test.ts` to výslovně ověřuje. V `AircraftStateService`
zůstává pouze kanonický ingest, source merge a continuity membership. Nebyl proto
přidán optimalizační kód ani samostatné PR pro neexistující runtime práci.

`benchmark-load-scaling.ts` tuto skutečnost také dokumentuje: syntetické Digital
Twin/Flight Intelligence timings se neměří, protože tyto algoritmy jsou retired.

## Zjištěný bottleneck

V8 CPU profil nad deterministickým slučováním 5 000 + 5 000 pozorování ukázal
nejvíce vzorků v `altitude-provenance.ts`:

- `observation`: 355 vzorků,
- `selectAltitudeObservationCore`: 313 vzorků,
- GC: 472 vzorků.

Map union byl lineární a nebyl nahrazen jiným backendem. PostgreSQL, BEAST,
SSE ani veřejné API nebyly touto změnou dotčeny.

## Provedená změna

- výběr výšky používá jeden společný kandidátní průchod místo opakovaných
  `filter` průchodů;
- pro jediného kandidáta se znovu nepřiděluje validační pole a nevolá se řazení;
- `mergeAircraftObservations` cachuje stáří lokálního/network pozorování v rámci
  jednoho merge, takže emergency/squawk arbitration neparsuje stejný timestamp
  opakovaně;
- emergency/squawk nejprve ověří, zda vůbec existuje použitelná hodnota, a až
  potom počítá freshness;
- pořadí zdrojů, freshness limity, anomaly detection, provenance, identity,
  history a SSE payload zůstávají beze změny.

Nejde o incremental cache mezi snapshoty: časová expirace zůstává přesná a při
každém snapshotu se stále vyhodnocují všechny identity. Benchmark proto explicitně
reportuje poměr změněných/nezměněných vstupů a počet skutečných evaluací.

## Reprodukovatelné měření

Scénáře používají 50, 250, 1 000 a 5 000 lokálních pozorování, 50% překryv
s network mapou a poměry změněných vstupů 0%, 10% a 100%. Pro každý průchod se
reportuje P50/P95/P99/max wall latency, CPU, CPU na průchod, CPU na evaluaci a
počet evaluací. Při 5 000 pozorování na zdroj je union 7 500 identit a každá
varianta provádí 7 500 merge evaluací na průchod; změněný poměr tedy nefalšuje
výsledek předstíraným skipem.

Matched A/B ve stejném Node procesu, střídavě baseline/candidate, 4 kola,
7 vzorků na kolo, 10 merge průchodů na vzorek:

| metriku na 10 průchodů | `main` | kandidát | změna |
|---|---:|---:|---:|
| CPU P50 | 269,08 ms | 218,41 ms | −18,8 % |
| CPU P95 | 339,39 ms | 306,12 ms | −9,8 % |
| CPU P99 | 339,39 ms | 306,12 ms | −9,8 % |
| CPU max | 339,39 ms | 306,12 ms | −9,8 % |
| wall P50 | 247,23 ms | 200,34 ms | −19,0 % |
| wall P95 | 267,70 ms | 227,39 ms | −15,1 % |
| wall P99 | 267,70 ms | 227,39 ms | −15,1 % |
| wall max | 267,70 ms | 227,39 ms | −15,1 % |

CPU na jednu merge evaluaci klesl přibližně z 3,588 µs na 2,912 µs.

V samostatných procesech s `--expose-gc` byl heap po GC prakticky stejný
(42,75 vs. 42,71 MiB); RSS po GC 348,24 vs. 339,80 MiB. RSS je u tohoto krátkého
syntetického běhu pouze orientační kvůli V8 allocatoru. Syntetický blokující
turn pro 5 000 pozorování měl event-loop max přibližně 2 016,4 → 1 659,9 ms;
toto není produkční event-loop P95/P99 a nesmí být zaměněno za T57/T58 měření.

## Správnost a limity přejímky

- source-merge, altitude-provenance a feature-retirement testy: 35/35 passed;
- diferenciální kontrola proběhla nad identickými fixture/mapami v matched A/B;
  union, identity, source arbitration a altitude parity kontrolují stávající
  samostatné testy;
- produkční CPU/RAM/event-loop/PostgreSQL A/B po této změně nebylo provedeno,
  protože změna ještě není merge/release pipeline nasazená;
- produkční deployment, 10–15minutový read-only canary a případný rollback jsou
  záměrně ponechány release pipeline.

Další incremental processing Operational Twin se nepřidává: příslušný runtime je
ve V1 retired. Další optimalizace merge se má řešit až po novém profilu, zejména
pokud produkční profil ukáže jiný poměr altitude/emergency/network dat než tato
syntetická sada.
