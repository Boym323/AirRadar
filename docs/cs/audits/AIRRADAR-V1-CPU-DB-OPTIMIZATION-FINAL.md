# AirRadar V1 — finální report optimalizace CPU a PostgreSQL

Datum: 2026-10-28  
Rozsah: pouze AirRadar V1; AirRadarV2 nebyl měněn.  
Verdikt: **PASS_WITH_LIMITATIONS**  
CPU: **INSUFFICIENT_EVIDENCE**  
DB: **NO_CHANGE_JUSTIFIED**

## Výsledek

Produkční implementace je zdravá a optimalizace ReceiverCoverageHourly z PR
#1129 je aktivní. Izolovaný PostgreSQL 17 A/B test prokázal výrazně méně
round-tripů a nižší latenci flush při zachování parity výsledků, ale neprokázal
nižší CPU celého produkčního serveru. Další produkční optimalizace proto není
současnými důkazy odůvodněna. Nebylo změněno schéma, indexy, sampling,
retence, V8 limit, datové kontrakty ani produkční nastavení.

## Verze, identita a bezpečnost produkčního měření

| Položka | Důkaz |
|---|---|
| Auditovaný GitHub `main` | `b105f3379db62fa2cec4bbd03650b51d739ed5c1` |
| Implementace optimalizace | `f17a19f635f0cec38e03a7bff786e7cdf24a3197` |
| Finálně nasazený commit/release | `b105f337`, `1.0.566`, build `2026-10-28T16:21:08Z` |
| Start procesu | `2026-10-28T13:28:12.500Z` |
| Identita procesu | stabilní PID/store identita během admin vzorku |
| Native akcelerace | aktivní Rust BEAST parser a Rust CRC |
| Coverage flag | v nasazeném `.env` není explicitní; výchozí atomic režim je `true` |
| Health | `/api/health` OK; databáze, receiver a readsb OK |

Všechny produkční dotazy byly read-only: bez forced GC, profileru, resetu
statistik, `EXPLAIN ANALYZE`, syntetické zátěže, restartu nebo změny konfigurace.

## Produkční CPU baseline

Byl použit autorizovaný admin-mode T57 endpoint; token-free T58 nebyl považován
za ekvivalent. Aktuální proces měl:

| Metrika | Pozorování |
|---|---:|
| Process CPU interval | 13,84 % jednoho logického jádra |
| RSS / heap used | 740,5 / 384,7 MiB |
| Event loop P50/P95/P99 | 20,087 / 20,922 / 38,666 ms |
| GC count / kumulativní pauza | 30 816 / 63 610,9 ms |
| GC maximum / průměrná pauza | 14,86 / 2,77 ms |
| Aktivní SSE klienti | 0 |
| Event-loop stall evidence | vypnuto; žádný stall nad 1 s |

Stabilní veřejný běh [T58 #40682255974](https://github.com/Boym323/AirRadar/actions/runs/40682255974)
měl 61/61 vzorků, 3 601,6 s a jediný segment. Veřejný režim ale neobsahoval
privátní hot-path CPU, GC, retention ani SQL wait atribuci; potvrzuje tedy
kontinuitu, ne optimalizaci celého procesu.

Kumulativní atribuce hot paths je inkluzivní a překrývá se:

| Cesta | Volání | CPU ms | Wait ms | Výklad |
|---|---:|---:|---:|---|
| `ingest.local-beast` | 367 521 | 137 776 | 0 | největší přímý CPU kandidát; Rust je aktivní |
| `snapshot.network` | 9 113 | 83 319 | 0 | další kandidát, zahrnuje vnořený ingest |
| `history.persist` | 3 310 | 79 605 | 3 563 | DB/aplikační práce, překrývá transaction |
| `network.metadata` | 3 297 | 31 585 | 46 919 | převážně čekání, ne CPU hotspot |
| `snapshot.trail-update` | 10 883 641 | 46 785 | 0 | mnoho volání, malá cena jednoho volání |

Bez kontrolovaného baseline/candidate A/B se žádná z těchto cest neměnila.

## PostgreSQL baseline

Read-only statistiky byly získány z PostgreSQL 17.10. `pg_stat_statements` již
existoval; extension ani statistiky nebyly resetovány.

| Metrika | Výsledek |
|---|---:|
| Databázová spojení | 5 během delta okna 66,65 s |
| Transakce/s | 3,69; rollback/s 0 |
| Inserts/s / updates/s / deletes/s | 4,82 / 5,34 / 0 |
| WAL bytes/s / records/s | 56 367 / 61,1 |
| WAL sync/s | 3,08 |
| Kumulativní cache hit ratio | 96,976 % |
| Deadlocky | 0 |
| Dlouhá transakce/lock wait | nepozorováno; sessions čekaly na `ClientRead` |
| CPU PostgreSQL hostu | z aplikačního hostu nedostupné |

Nejvyšší kumulativní skupiny `pg_stat_statements` byly
`navigationIntegrityObservation` (4,54M volání, 745,8 s), `flightPosition`
(3,28M, 291,0 s) a `receiverDailyStats` (23 441, 245,7 s). Jsou to skutečné
frekvenční kandidáty, ale dostupná evidence neizoluje bezpečnou změnu s
prokázaným přínosem pro celý systém.

## ReceiverCoverageHourly a PR #1129

Produkční status ukázal atomic batching: 84/84 flushů commitlo, 0 selhání,
17 029 řádků bylo zvažováno, 879 vloženo a 16 150 aktualizováno. Průměr byl
202,7 řádku/flush, poslední flush 11 ms, kumulativní délka transakcí 3 056 ms
a maximum 214 ms. Atomic path používá shared transaction advisory lock, ORM
fallback odpovídající exclusive lock a čte trvalé řádky znovu pod lockem.
Mixed-mode, rollback/retry, restart cache a provider union mají integrační testy.

Sloučený [PR #1129](https://github.com/Boym323/AirRadar/pull/1129),
[validační běh #40694966340](https://github.com/Boym323/AirRadar/actions/runs/40694966340)
a [aktuální rerun #40724374938](https://github.com/Boym323/AirRadar/actions/runs/40724374938)
prokazují izolovaný test bez zásahu do produkčního flagu; JSON artifact je
[zde](https://github.com/Boym323/AirRadar/actions/runs/40724374938/artifacts/12827282283).

### Izolovaný A/B výsledek

Disposable PostgreSQL 17 databáze použila shodná data pro 50, 250, 1 000 a
5 000 bucketů. Výsledné počty a provider sety byly shodné.

| Buckety | ORM P50 | Atomic P50 | ORM / atomic round-trips | WAL P50 | Parita |
|---:|---:|---:|---:|---:|:---:|
| 50 | 37,234 ms | 2,569 ms | 103 / 4 | 8 312 / 8 312 B | PASS |
| 250 | 145,641 ms | 6,398 ms | 503 / 4 | 105 464 / 105 464 B | PASS |
| 1 000 | 517,204 ms | 23,817 ms | 2 003 / 4 | 435 528 / 435 528 B | PASS |
| 5 000 | 2 537,966 ms | 110,339 ms | 10 003 / 4 | 2 145 496 / 2 145 496 B | PASS |

PostgreSQL backend CPU nebylo v Actions dostupné kvůli oddělenému PID
namespace. Test proto dokazuje per-flush latenci a round-trip zlepšení, nikoli
produkční PostgreSQL CPU nebo throughput celého serveru.

## Žebříček root cause a rozhodnutí

CPU kandidáti jsou (1) objem Rust BEAST ingestu a (2) zpracování network
snapshotu. Obě cesty jsou záměrně frekventované a native akcelerace je aktivní.
Databázové kandidáty jsou (1) časté inserty navigation integrity a (2) časté
inserty FlightPosition. Jde o záměrně trvalé cesty; bez nového production
proof se nemění schéma, indexy ani sampling. ReceiverCoverageHourly již řeší
PR #1129.

## Srovnání před/po a funkční parita

Nový candidate nebyl nasazen, takže whole-production before/after delta není
aplikovatelná:

| Oblast | Výsledek |
|---|---|
| CPU | INSUFFICIENT_EVIDENCE; chybí whole-process A/B |
| PostgreSQL CPU | INSUFFICIENT_EVIDENCE; vzdálený host není dostupný |
| Receiver flush latency | IMPROVED pouze v izolovaném A/B |
| WAL | NO_CHANGE_JUSTIFIED ve shodném workloadu |
| Event loop / RAM | bez candidate změny; bez regresního tvrzení |
| Funkční parita | PASS pro atomic/fallback integration a digesty |

## Testy, CI, deployment a rollback

- Full Vitest: 297 souborů prošlo, 5 přeskočeno; 1 991 testů prošlo,
  20 přeskočeno.
- Typecheck prošel; ESLint má 0 errors a 4 existující warnings.
- PostgreSQL 17 atomic i locked ORM integration a A/B benchmark prošly ve
  [workflow #40724374938](https://github.com/Boym323/AirRadar/actions/runs/40724374938).
- CI [#40696132199](https://github.com/Boym323/AirRadar/actions/runs/40696132199)
  a CodeQL [#40696132276](https://github.com/Boym323/AirRadar/actions/runs/40696132276)
  prošly na mergnutém implementačním commitu.
- PR #1129 je mergnuté; finální dokumentační release je nasazený jako
  `b105f337` / `1.0.566` standardním workflow.
- Rollback je standardní code rollback/redeploy; schema rollback není třeba.

## Omezení a neúspěšné experimenty

Veřejný T58 neposkytuje admin hot paths. DB server je oddělený host, proto z
aplikačního hostu nelze číst PostgreSQL process CPU ani cgroup counters.
`pg_stat_statements` je kumulativní a nebyl resetován. Async atribuce se
překrývá. Produkční A/B atomic versus fallback nebyl proveden, protože by
vyžadoval změnu live flagu pouze kvůli benchmarku. Nebyla zavedena spekulativní
CPU optimalizace; starší pre-lock čísla zůstávají jen historickou evidencí.

## Finální rozhodnutí

**PASS_WITH_LIMITATIONS.** Identita, health, Rust akcelerace, atomic coverage
režim, parita a bezpečná read-only měření jsou ověřeny. PR #1129 je objektivně
úspěšná izolovaná write-path optimalizace, ale žádné zrychlení celého produkčního
CPU nebo PostgreSQL CPU se neprohlašuje. Další validní optimalizace vyžaduje
matched admin-mode baseline/candidate měření včetně CPU metrik PostgreSQL hostu.

Související důkazy: [T58 identity report](AIRRADAR-V1-T58-IDENTITY-RELIABILITY-2026-10-28.md),
[CPU response audit](AIRRADAR-V1-CPU-RESPONSE-AUDIT-2026-10-28.md) a
[PR #1129 benchmark report](../../../artifacts/performance/2026-10-28-v1-postgres-write-optimization.md).
