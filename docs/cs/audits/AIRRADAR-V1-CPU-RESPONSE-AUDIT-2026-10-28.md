# AirRadar V1 — audit CPU a odezvy — 28. 10. 2026

Stav: dokončeno. Rozsah je pouze V1; V2 je vyloučena. Report uvádí měření,
nikoli hypotézy.

## Předběžné rozhodnutí

**Důkazy neodůvodňují změnu produkčního kódu.** Stávající změna
aircraft merge se znovu nepřebírá: izolovaný benchmark není důkazem výkonu
celého procesu a zadání uvádí nestabilní výsledky v A/B scénářích.

## Baseline a bezpečnost

- Nasazená verze: `v1.0.561`, commit `7b69ed2f`, build `2026-10-28T08:59:49Z`.
- Proces byl spuštěn `2026-10-28T09:03:50Z`; počáteční read-only kontrola viděla
  67 lokálních a 1 207 síťových letadel.
- Native akcelerace byla aktivní: Rust parser a Rust CRC.
- Počáteční runtime vzorek: CPU 17,79 % jednoho logického jádra, RSS 702,0 MiB,
  použitý heap 385,0 MiB, event-loop P50/P95/P99 20,087/21,185/42,795 ms.
- GC v počátečním vzorku: 6 003 událostí, kumulativní pauza 11 667 ms,
  průměr 3,375 ms, maximum 11,909 ms.
- Lokální receiver/readsb byl zdravý, zdroj živý a čerstvý.
- Nebyl proveden restart, build, nucený GC, inspector, syntetický provoz,
  změna ingestu/konfigurace ani zápis do databáze.

Počáteční vzorek je bodová health kontrola, nikoli 30minutový produkční
výsledek. Steady-state důkazy se sbírají existujícími read-only diagnostikami
T57/T58.

## Produkční měření

Run: [T58 read-only soak #40665798048](https://github.com/Boym323/AirRadar/actions/runs/40665798048).

Workflow byl spuštěn z `main` a prošel preflightem identity produkce. Všech
sedm read-only chunků dokončilo sběr po 60 s. Finální workflow krok narazil na
chybu parsování resume handoffu; journal byl stažen z artifactu a lokálně
analyzován. Chyba je v tomto commitu opravena.

T58 v public-only režimu dal 61/61 vzorků, ale 18 segmentů identity procesu.
CPU P50/P95 bylo 15,537/17,264 %, event-loop p99 P50/P95/max
38,633/42,009/42,009 ms, RSS P50/P95/max 722,563/742,227/742,227 MiB a heap
P50/P95/max 326,187/398,665/398,665 MiB. Hot-path CPU, SSE klienti, load
letadel, DB wait a major GC nebyly ve veřejném režimu měřeny. Produkce po soak
zůstala zdravá: v1.0.561, aktivní Rust parser/CRC, readsb i databáze healthy,
77–78 lokálních letadel. [Sanitizovaný artifact 12809865747](https://github.com/Boym323/AirRadar/actions/runs/40665798048/artifacts/12809865747).

| Metrika | Výsledek |
| --- | ---: |
| Vzorky / chybějící | 61 / 0 |
| Plánované trvání | 3 600 s |
| Stabilní proces/build | ne; 18 segmentů identity |
| Stabilní analyzovaný segment | 781,5 s |
| CPU P50 / P95 | 15,537 % / 17,264 % jednoho jádra |
| Event-loop p99 P50 / P95 / max | 38,633 / 42,009 / 42,009 ms |
| Event-loop max P50 / P95 / max | 608,174 / 629,146 / 629,146 ms |
| RSS P50 / P95 / max | 722,563 / 742,227 / 742,227 MiB |
| Heap P50 / P95 / max | 326,187 / 398,665 / 398,665 MiB |
| SSE klienti, load letadel, hot paths | NOT MEASURED ve public režimu |

| Oblast | Důkaz | Hranice interpretace |
| --- | --- | --- |
| CPU | CPU procesu P50/P95 a CPU operací | překrývající se async CPU není exkluzivní profiler |
| Event loop | minutová okna p95/p99/max | porovnávat jen ve stejném intervalu |
| GC/alokace | GC pauzy, heap/RSS, bounded retention | RSS sám o sobě nedokazuje leak |
| Ingest | lokální BEAST, síťový snapshot, decode countery | čekání na síť není CPU |
| Stav/trails | calls, počet letadel, CPU/wall atribuce | zachovat identitu, pořadí a limity trailů |
| Historie/DB | wall, CPU, wait a chyby | vysoký wall s nízkým CPU ukazuje na wait/I/O |
| SSE | serializace, fanout a klienti | nebyli přidáni syntetičtí klienti |

## Izolovaný reprodukovatelný profil

Node `v22.23.3`, Linux x64, commit `7b69ed2f`; deterministická data bez receiveru,
sítě, PostgreSQL a SSE. Příkazy:

```sh
npm run prisma:generate
npm run benchmark:runtime
```

P50/P95 snapshot-apply:

| Letadla | P50 | P95 |
| ---: | ---: | ---: |
| 50 | 0,875 ms | 1,221 ms |
| 250 | 2,570 ms | 5,279 ms |
| 1 000 | 5,341 ms | 7,200 ms |
| 5 000 | 27,145 ms | 49,255 ms |

U 5 000 letadel byl v syntetickém scénáři největší `snapshot.local.ingest`
(P50 25,167 ms), zatímco `snapshot.trail-update` měl přibližně 0,002 ms na
zaznamenané volání. Jde o škálovací signál, nikoli důkaz produkčního hotspotu.

Source-merge CPU rostlo přibližně lineárně; plně změněný scénář 5 000 letadel
trval 29,059 ms na průchod. Izolované měření neodůvodňuje změnu semantiky merge.

## Ověření a kompatibilita

- Relevantní V1 testy: 108 passed (merge/state, SSE delta, BEAST parser/decoder).
- Rust testy: 7 passed.
- Typecheck, feature registry a lint prošly; lint má 4 existující warnings a 0 errors.
- Česká kontrola dokumentace prošla před přidáním tohoto reportu.
- Kandidátní implementace nevznikla; nebyl proveden merge ani deployment.

## Omezení

T58 je pozorování přirozeného provozu, nikoli řízený replay. Izolovaný profil
neobsahuje DB, síť, TLS, proxy, přirozené SSE klienty ani skutečný BEAST mix.
Procentuální zrychlení nebude uvedeno bez párového baseline/candidate měření
celého procesu pro 50/250/1 000/5 000 letadel a poměry změněných dat.

Související důkazy: [T5.7 event-loop diagnostika](../../T5.7-EVENT-LOOP-DIAGNOSTICS.md),
[T58 protokol](../../T58-PRODUCTION-SOAK.md) a [předchozí V1 audit](PRODUCTION-PERFORMANCE-AUDIT-V1.md).

## Finální verdikt

**PASS_WITH_LIMITATIONS.** T58 neposkytl stabilní autentizované hot-path
důkazy, proto produkční kód zůstává beze změny a žádný přínos optimalizace se
netvrdí. Pro skutečnou optimalizaci je nutné admin-mode T58 na jednom stabilním
procesu/build, kandidát, párový A/B důkaz, CI/CodeQL, deployment a post-deploy
soak.

[English version](../../../docs/audits/AIRRADAR-V1-CPU-RESPONSE-AUDIT-2026-10-28.md)
