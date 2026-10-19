# Rozcestník pokynů pro agenty

[English](../../agents/README.md)

Kořenový [AGENTS.md](../../../AGENTS.md) je jediným vstupem do globálních instrukcí. Pro selektivní čtení používej [rozcestník kontextu Codexu](../CODEX-CONTEXT.md).

## Závazný postup pro úlohy

- [Postup výkonového inženýrství](PERFORMANCE-WORKFLOW.md): krátká opakovaně použitelná pravidla pro CPU, paměť, SSE, Rust a T58.
- [Pravidla vývoje](../DEVELOPMENT.md): přímé commity do `main`, jediný zapisující agent, měření, testy a pravidla release.
- [Schválené zadání 19. 10. 2026: přímý `main` a produkční checkout](CODEX-DIRECT-MAIN-PRODUCTION-2026-10-19.md): závazný pracovní režim úkolu, bezpečnost, refaktoring a ověření nasazení.
- [Plán konsolidace pro přímý vývoj do `main`](AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md): historické priority refaktoru a diagnostik; pro umístění pracovního checkoutu platí novější výslovně schválené zadání.
- [Aktuální zadání 18. 10. 2026: redukce zbytečné runtime práce](RUNTIME-REDUNDANT-WORK-2026-10-18.md): priority P0–P3 z T58 a ověření na shodné A/B zátěži; otevírat jen pro tento úkol.

- [Aktuální zadání 18. 10. 2026: vyřazení nepotřebných dat a funkcí](DATA-FEATURE-RETIREMENT-AUDIT-2026-10-18.md): konzumenti, evidence, bezpečné odstranění a měřené úspory; otevírat jen pro tento úkol.

- [Schválené vyřazení funkcí 18. 10. 2026 — plán realizace](APPROVED-FEATURE-RETIREMENT-2026-10-18.md): schválených 15 položek, dávky podle závislostí a přesná pravidla ověření; čti jen při tomto úkolu.

- [Druhé kolo čištění — výsledky a rozhodnutí (18. 10. 2026)](CLEANUP-ROUND2-2026-10-18.md): ověřená odstranění, změřený rozdíl artefaktů, aktivní experimentální konzumenti a zbývající měření; otevírat jen při pokračování.

- [Třetí kolo čištění radarové mapy (18. 10. 2026)](CLEANUP-ROUND3-2026-10-18.md): nasazené optimalizace ATC/Navigation Integrity, testy a kandidáti na další měření; číst jen při pokračování.

## Zachovaná historická zadání

Následující dlouhá zadání jsou **datované historické podklady**, ne povinný kontext každého běhu: [autonomní výkonový audit](AIRRADAR_PERFORMANCE_AGENT.md) a [zadání z 17. 10. 2026](AirRadar_zadani_kompletniho_vykonnostniho_auditu_a_optimalizaci_2026-10-17.md). Čti pouze příslušnou část při návratu k danému šetření a ověřuj verze i tvrzení.
