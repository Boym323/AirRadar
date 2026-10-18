# Rozcestník kontextu pro Codex

[English](../CODEX-CONTEXT.md)

Jde o **navigační rozcestník, nikoli další pravidla**. Nejprve čti kořenový [AGENTS.md](../../AGENTS.md) a dodržuj jeho bezpečnostní pravidla. Otevírej jen dokumenty a kód relevantní pro daný úkol; nenačítej celé složky, generované seznamy funkcí ani historické reporty.

## Směrování úkolů

| Úkol | Začni zde | Ověř skutečný kód |
| --- | --- | --- |
| BEAST/SBS ingest, CRC24, Rust | [Nativní addon](../../native/airradar-native/README.md) | `native/airradar-native/`, relevantní adaptéry v `lib/` a testy parity |
| Stav letadel, ingest, SSE, event loop | [Datové toky](DATA-FLOWS.md) a [invarianty](RUNTIME-INVARIANTS.md) | `lib/server/`, relevantní `app/api/`, testy |
| Historie, migrace, Prisma | [Vývoj](DEVELOPMENT.md) | `prisma/contract.prisma`, `migrations/app/`, DB služby |
| Integrace, omezení poskytovatelů | [Datové zdroje](DATA-SOURCES.md) | konkrétní provider, konfigurace a testy |
| T58, zátěž, CPU a GC | [Průvodce T58](T58-PRODUCTION-SOAK.md) a [výkonový postup](agents/PERFORMANCE-WORKFLOW.md) | měřicí skripty a workflow |
| CI, vydání a obnova | [Vydání](RELEASE.md) a [rozcestník postupů](operations/RUNBOOKS.md) | relevantní `.github/workflows/` a `deploy/` |
| UI, mapa, přístupnost | [Vizuální systém](VISUAL-SYSTEM.md) | relevantní `app/`, `components/`, překlady a testy |
| Routy a vlastnictví funkcí | [Registr funkcí](../features.registry.json) | relevantní `app/` routa a část [FEATURES.md](FEATURES.md) |

## Pravidla čtení a reportování

1. Najdi vlastníka pomocí názvů souborů a cíleného hledání (`rg --files`, `rg -n`); čti jen odpovídající části kódu a dokumentace.
2. Aktuální kód a úspěšné testy mají přednost před zastaralým textem. Dokumentace určuje zamýšlené kontrakty, ale nepotvrzuje produkční deploy.
3. Starý benchmark, commit, PR, tag ani stav „právě probíhá“ nepovažuj za aktuální. Čerstvá GitHub/produkční data ověřuj s časem a jen v povoleném režimu.
4. Místo celého `CHANGELOG.md` (~400 KB) používej `git log -- <path>` nebo cílené hledání. Stejně tak nenačítej celý generovaný `FEATURES.md`, pokud to není nutné.
5. U výkonových změn dolož srovnatelný baseline a candidate, koncové percentily, regrese a omezení. Mikrobenchmark není důkaz zrychlení produkce.
6. Před PR spusť cílené kontroly a [revizi dopadu na dokumentaci](operations/RUNBOOKS.md); aktualizuj odpovídající `docs/cs/`. Dodržuj [hranice vývoje](DEVELOPMENT.md). Bez výslovného povolení neprováděj merge ani deploy.

## Zdroje pravdy

[Architektura](ARCHITECTURE.md) popisuje vlastnictví; [invarianty](RUNTIME-INVARIANTS.md) závazné kontrakty; [vývoj](DEVELOPMENT.md) postup agentů; [vydání](RELEASE.md) produkční zásahy. [Rozhodnutí](decisions/README.md) uchovávají důvody. Soubory v `artifacts/`, `docs/audits/`, `docs/research/` a datované výkonové reporty jsou **historické důkazy**, nikoli aktuální stav provozu.
