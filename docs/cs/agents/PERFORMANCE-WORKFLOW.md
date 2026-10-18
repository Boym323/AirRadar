# Postup výkonového agenta

[English](../../agents/PERFORMANCE-WORKFLOW.md)

Toto je **aktuální stručný postup**. Doplňuje, nikoli nahrazuje [AGENTS.md](../../../AGENTS.md), [pravidla vývoje](../DEVELOPMENT.md) a [runtime invarianty](../RUNTIME-INVARIANTS.md).

## Nejprve prokaž příčinu

1. Najdi konkrétní modul a testy; prozkoumej aktuální kód a poslední změny, ne celý repozitář.
2. Změř výchozí stav: commit, zátěž, počet vzorků, verze, konfiguraci, p50/p95/p99/max, CPU/RSS/heap/GC/event loop či DB/I/O dle potřeby.
3. Odděl prokázanou příčinu od hypotézy. Bez důkazů nepřičítej blokaci event loopu GC ani snapshotu.
4. V izolované větvi uprav jednu omezenou výkonnostní cestu. Zachovej identitu, prioritu zdrojů, historii a soukromí dat.
5. Spusť cílené testy parity a regresí, relevantní typecheck/lint a srovnatelné měření před/po. Přepis do Rust/C++ musí prokázat čistý přínos včetně režie rozhraní a parity fallbacku.
6. Rozliš skutečně ověřené výsledky a nejistoty. Historické T58 jsou důkazem pouze pro původní commit; čerstvá read-only měření popisují [postupy T58](../T58-PRODUCTION-SOAK.md).

## Hranice předání

Dodej malé kontrolovatelné PR s tabulkou metrik, odkazy na CI, riziky rollbacku a dopadem na dokumentaci. Bez výslovného souhlasu neměň destruktivně DB, běžící konfiguraci, neprováděj merge ani nasazení. Staré rozsáhlé prompty jsou v [archivu agentů](README.md) a nenačítají se automaticky.
