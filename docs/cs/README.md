# AirRadar – dokumentace česky

Tato složka obsahuje úplné české zrcadlo Markdown dokumentace projektu pod
`docs/`. Anglické soubory zůstávají technickým zdrojem pravdy; změna
anglického dokumentu musí ve stejném commitu aktualizovat také odpovídající
český soubor.

Praktická wiki má vlastní dvojjazyčný strom v `docs/wiki/en/` a
`docs/wiki/cs/`. Jazykový rozcestník `docs/wiki/README.md` je společný pro
oba jazyky.

`npm run docs:check` kontroluje rekurzivně všechny Markdown dokumenty pod
`docs/` mimo wiki a vyžaduje jejich zrcadlo v `docs/cs/`, včetně
`research/`. Zvlášť kontroluje paritu celé EN/CZ wiki. Ověřuje existenci,
Markdown strukturu, přiměřený rozsah překladu, logickou shodu odkazů, existenci
lokálních link targets a známé chybové markery po neúspěšném překladu.

## Autoritativní dokumentace

- [Architektura](ARCHITECTURE.md)
- [Datové toky](DATA-FLOWS.md)
- [Runtime invarianty](RUNTIME-INVARIANTS.md)
- [Vývoj](DEVELOPMENT.md)
- [Vydání a nasazení](RELEASE.md)
- [Zdroje dat](DATA-SOURCES.md)
- [Funkce a routy](FEATURES.md)
- [Vizuální systém](VISUAL-SYSTEM.md)

## Specializovaná technická dokumentace

- [Airport Movement Intelligence V2](AIRPORT-MOVEMENT-INTELLIGENCE-V2.md)
- [Dynamická aktivace vzdušného prostoru](AIRSPACE-ACTIVATION.md)
- [Aktivita českého vzdušného prostoru](AIRSPACE-ACTIVITY.md)
- [Provenience výšky](ALTITUDE-PROVENANCE.md)
- [ATC/ATS pro více zemí](ATC-ATS-MULTI-COUNTRY.md)
- [Kontext provozu ATC sektorů](atc-sector-traffic.md)
- [Inventář odmítnutých slovenských ATC záznamů](ATC-SK-REJECT-INVENTORY.md)
- [Slovenský ATC / eAIP sync](ATC-SLOVAKIA.md)
- [České ATS tratě](ATS_ROUTES.md)
- [Analytika pokrytí](COVERAGE-ANALYTICS.md)
- [Audit Flight Intelligence V2](FLIGHT-INTELLIGENCE-V2-AUDIT.md)
- [Flight Story](FLIGHT-STORY.md)
- [Map Context](MAP-CONTEXT.md)
- [Global Map Time](MAP-TIME.md)
- [Recovery runbook](RECOVERY.md)
- [Agenti Route Intelligence V2](ROUTE-INTELLIGENCE-V2-AGENTS.md)
- [Kontrakty Route Intelligence V2](ROUTE-INTELLIGENCE-V2-CONTRACTS.md)
- [Route Intelligence](ROUTE-INTELLIGENCE.md)
- [SSE Delta V2](SSE-DELTA-V2.md)
- [Time Machine](TIME-MACHINE.md)

## Výzkumné a auditní reporty

- [AirRadar Intelligence Roadmap – report paralelní implementace](research/AIRRADAR-INTELLIGENCE-ROADMAP-PARALLEL-IMPLEMENTATION-REPORT.md)
- [Postup Intelligence roadmap](research/intelligence-roadmap-progress.md)
- [Audit renderingu / výkonu](research/rendering-performance-audit.md)
- [Report úprav renderingu / výkonu](research/RENDERING-PERFORMANCE-POLISH-REPORT.md)

Praktický úvod je také v [české části GitHub Wiki](https://github.com/Boym323/AirRadar/wiki/%C4%8Ce%C5%A1tina).
