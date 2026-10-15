# Nasazení a provoz

Produkční vydání je explicitní provozní akce a řídí se dokumentem
[RELEASE.md](../../RELEASE.md). Nevydávejte z vývojového worktree, neresetujte
produkční databázi a nezveřejňujte přesné souřadnice přijímače. Chyby databáze
a volitelných providerů nesmí vyřadit živý radar.

## Ověření výkonu produkce

Po řízeném vydání spusťte [read-only výkonnostní test
T58](t58-production-soak.md). Jediný příkaz pro GitHub Actions sbírá
hodinovou provozní diagnostiku, porovnává ji s T57 a ukládá anonymizované
výsledky v samostatné archivní větvi bez změn produkce.
Podrobný postup je v
[T58-PRODUCTION-SOAK.md](../../cs/T58-PRODUCTION-SOAK.md).
