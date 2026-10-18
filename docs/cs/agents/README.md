# Rozcestník pokynů pro agenty

[English](../../agents/README.md)

Kořenový [AGENTS.md](../../../AGENTS.md) je jediným vstupem do globálních instrukcí. Pro selektivní čtení používej [rozcestník kontextu Codexu](../CODEX-CONTEXT.md).

## Závazný postup pro úlohy

- [Postup výkonového inženýrství](PERFORMANCE-WORKFLOW.md): krátká opakovaně použitelná pravidla pro CPU, paměť, SSE, Rust a T58.
- [Pravidla vývoje](../DEVELOPMENT.md): přímé commity do `main`, jediný zapisující agent, měření, testy a pravidla release.
- [Plán konsolidace pro přímý vývoj do `main`](AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md): priority refaktoru, veřejné diagnostiky a validace.
- [Aktuální zadání 18. 10. 2026: redukce zbytečné runtime práce](RUNTIME-REDUNDANT-WORK-2026-10-18.md): priority P0–P3 z T58 a ověření na shodné A/B zátěži; otevírat jen pro tento úkol.

- [Aktuální zadání 18. 10. 2026: vyřazení nepotřebných dat a funkcí](DATA-FEATURE-RETIREMENT-AUDIT-2026-10-18.md): konzumenti, evidence, bezpečné odstranění a měřené úspory; otevírat jen pro tento úkol.

## Zachovaná historická zadání

Následující dlouhá zadání jsou **datované historické podklady**, ne povinný kontext každého běhu: [autonomní výkonový audit](AIRRADAR_PERFORMANCE_AGENT.md) a [zadání z 17. 10. 2026](AirRadar_zadani_kompletniho_vykonnostniho_auditu_a_optimalizaci_2026-10-17.md). Čti pouze příslušnou část při návratu k danému šetření a ověřuj verze i tvrzení.
