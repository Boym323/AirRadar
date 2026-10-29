# AirRadar V1 — finální 24hodinový produkční monitoring

Datum reportu: 2026-10-29  
Verdikt: **INSUFFICIENT_EVIDENCE**

## Rozsah a zdroje

Vyhodnocené období je přesně `2026-10-28T19:52:02.990Z` až
`2026-10-29T19:52:02.990Z`. Použity byly pouze skutečné řádky produkčního
JSONL `/var/lib/airradar/monitoring/sample-2026-10-28.jsonl` a
`sample-2026-10-29.jsonl` a journal jednotky
`airradar-cpu-db-monitor.service`. Nebyly vytvořeny syntetické vzorky,
nebyl proveden restart ani změna produkční konfigurace.

V intervalu je 934 použitelných JSONL vzorků a 934 odpovídajících úspěšných
journal událostí. První vzorek je přesně na začátku intervalu; poslední je
`2026-10-29T19:50:47.215Z`, tedy 75,775 s před jeho koncem. Tolerance timeru
je 75 s, takže koncové pokrytí není splněno. Skutečný span použitelných dat je
23,98 h, nikoli úplných 24 h.

## Naměřené runtime metriky

| Metrika | P50 | P95 | maximum |
|---|---:|---:|---:|
| CPU procesu | 11,8843 % | 24,0337 % | 100 % |
| RSS | 913,12 MiB | 1 017,50 MiB | 1 022,89 MiB |
| event-loop P99 | 28,410 ms | 49,938 ms | 130,286 ms |

V minutových event-loop oknech bylo zaznamenáno maximum zpoždění
`3 602,907 ms`; maximum hodnoty oknového P99 bylo `84,148 ms`. Jde o
odlišné veličiny: první je maximální delay, druhá P99 okna.

## PostgreSQL

- `xact_commit`: delta **nedostupná**. Hodnota byla monotónní mezi vzorky,
  ale `database.stats_reset` je ve všech 934 vzorcích `null`; hranici
  akumulace proto nelze ověřit.
- `xact_rollback`: delta **nedostupná** ze stejného důvodu. Pozorované raw
  hodnoty vzrostly z `1 958 943` na `1 958 944`.
- WAL `stats_reset` byl stabilní na `2026-09-06T20:03:35.203Z`; proto je WAL
  delta použitelná: `wal_records` **5 516 073**, `wal_bytes`
  **3 401 817 945**, `wal_fpi` **470 515**, `wal_buffers_full` **28 500**.
- Maximální `lock_waiting`: **0**.
- Maximální počet všech čekajících sessions: **9**.
- Maximální `idle_in_transaction`: **2**.

`stats_reset=null` není důkaz resetu, ale ani důkaz kontinuity. Transakční
delta proto není klasifikována jako PASS.

## Dostupnost, mezery a duplicity

Journal obsahuje 934 úspěšných sběrů. Při cadence `OnUnitActiveSec=60s` a
`RandomizedDelaySec=15s` bylo identifikováno 671 mezer delších než 75 s;
nejdelší mezera byla 376,645 s. Podle cadence-aware výpočtu je evidovaná
dostupnost **58,01 % (934 / 1 610 očekávaných událostí)**. Tento výsledek
je konzervativní a vychází z reálných journal timestampů, nikoli z ideální
minutové mřížky.

Přesné duplicitní `recordedAt`: **0**. Současně zůstává nesplněno koncové
pokrytí a v datech jsou dlouhé mezery; neúplnost proto nelze označit jako
PASS_WITH_LIMITATIONS.

## Stabilita procesu, restarty a resety

Byly pozorovány dva fingerprinty procesu. Ke změně došlo v
`2026-10-29T15:30:47.215Z`:

- před změnou: `b8bcc671f19d58f972026bad6657da27fc49791eddf5094d7beeab26a9d7c32f`
- po změně: `a8839bd77ff54b26cfb606e3682d9fe19e0e2c84645f65b7eab271674b793304`

To je důkaz přerušení identity procesu nebo nasazení v průběhu intervalu;
jediný stabilní proces přes celé období doložen není. Databázový čítač
neukázal pokles a WAL reset marker se nezměnil. Transakční reset však nelze
vyloučit kvůli `stats_reset=null`.

CPU databázového hostitele je nedostupné: všech 934 vzorků má
`hostCpu.status=unavailable` a `reason=not_configured`. Tato část auditu
tedy není PASS a nebyla nahrazena CPU hostitele AirRadaru.

## Porovnání s T57/T58

T57 historicky vykázal 18 segmentů identity, ale pozdější audit ukázal, že
šlo o artefakt starého výpočtu `startedAt`. Opravený T58 běh
`#40682255974` měl 61/61 vzorků a jeden stabilní segment. Aktuální 24hodinový
interval má opět dva fingerprinty a rozsáhlé mezery; proto nelze převzít
stabilitu z T58 ani tvrdit kontinuální procesní výkon.

## Závěr

**INSUFFICIENT_EVIDENCE.** Důvodem jsou současně nedostatečné koncové pokrytí
24hodinového intervalu, nízká cadence-aware dostupnost, dlouhé chybějící
úseky, změna fingerprintu, `stats_reset=null` znemožňující ověřenou
transakční deltu a úplná nedostupnost CPU databázového hostitele. Report
proto nepřevádí neúplná data na PASS a nečiní žádný závěr o nepozorovaných
úsecích.
