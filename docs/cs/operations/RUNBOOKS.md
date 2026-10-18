# Rozcestník provozních a ověřovacích postupů

[English](../../operations/RUNBOOKS.md)

Rozcestník ukazuje na **existující závazné postupy**, neopravňuje k zásahu do produkce. Přednost mají kořenový [AGENTS.md](../../../AGENTS.md) a [postup vydání](../RELEASE.md).

## Vyber postup

| Situace | Hlavní zdroj |
| --- | --- |
| Produkční vydání, rollback a preflight | [Vydání](../RELEASE.md) |
| Výpadek, obnova a integrita dat | [Obnova](../RECOVERY.md) |
| Read-only měření T58 a canary | [Produkční T58](../T58-PRODUCTION-SOAK.md) |
| Výkonový audit agentem | [Výkonový postup](../agents/PERFORMANCE-WORKFLOW.md) |
| Selhání volitelných integrací | [Datové zdroje](../DATA-SOURCES.md) |
| Bezpečnostní kontrakty runtime | [Runtime invarianty](../RUNTIME-INVARIANTS.md) |

## Revize dopadu změn na dokumentaci

Při změnách aplikace spusť `node scripts/docs-impact-check.mjs --base <merge-base-sha>`. Vypisuje **doporučení** pro dotčenou dokumentaci a možný nesoulad EN/CZ; v CI vytváří shrnutí. Nic nemění a nenahrazuje `npm run docs:check`, `npm run features:check` ani lidskou kontrolu významové správnosti. Historické reporty (včetně minulých T58) jsou pouze důkazy; před operací vždy ověř aktuální commit a oprávnění.
