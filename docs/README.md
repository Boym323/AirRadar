# AirRadar — technical documentation

This directory contains versioned technical Markdown documentation.
English is the canonical reference. Update a corresponding Czech page
in the same commit whenever its English source changes.

The practical wiki has separate English and Czech trees in `docs/wiki/en/`
and `docs/wiki/cs/`, with a shared language index at `docs/wiki/README.md`.

`npm run docs:check` requires Czech counterparts for all Markdown pages in
`docs/` outside wiki, including research. It checks bilingual wiki parity,
structure, approximate translation length, corresponding local links,
valid link targets and known translation failure markers.

## Quick start for agents

- [Codex context router](CODEX-CONTEXT.md)
- [Agent guidance](agents/README.md)
- [Architecture decisions](decisions/README.md)
- [Operations runbooks](operations/RUNBOOKS.md)

## Authoritative documentation

- [Architecture](ARCHITECTURE.md)
- [Data flows](DATA-FLOWS.md)
- [Runtime invariants](RUNTIME-INVARIANTS.md)
- [Development](DEVELOPMENT.md)
- [Release and deployment](RELEASE.md)
- [Data sources](DATA-SOURCES.md)
- [Features and routes](FEATURES.md)
- [Visual system](VISUAL-SYSTEM.md)

## Specialized technical documentation

- [Airport Movement Intelligence V2](AIRPORT-MOVEMENT-INTELLIGENCE-V2.md)
- [Dynamic airspace activation](AIRSPACE-ACTIVATION.md)
- [Czech airspace activity](AIRSPACE-ACTIVITY.md)
- [Altitude provenance](ALTITUDE-PROVENANCE.md)
- [Multi-country ATC/ATS](ATC-ATS-MULTI-COUNTRY.md)
- [ATC sector traffic context](atc-sector-traffic.md)
- [Slovak ATC rejects](ATC-SK-REJECT-INVENTORY.md)
- [Slovak ATC eAIP sync](ATC-SLOVAKIA.md)
- [Czech ATS routes](ATS_ROUTES.md)
- [Coverage analytics](COVERAGE-ANALYTICS.md)
- [Flight Intelligence V2 audit](FLIGHT-INTELLIGENCE-V2-AUDIT.md)
- [Flight Story](FLIGHT-STORY.md)
- [Map Context](MAP-CONTEXT.md)
- [Global map time](MAP-TIME.md)
- [Recovery runbook](RECOVERY.md)
- [Route Intelligence V2 agents](ROUTE-INTELLIGENCE-V2-AGENTS.md)
- [Route Intelligence V2 contracts](ROUTE-INTELLIGENCE-V2-CONTRACTS.md)
- [Route Intelligence](ROUTE-INTELLIGENCE.md)
- [SSE Delta V2](SSE-DELTA-V2.md)
- [Time Machine](TIME-MACHINE.md)

## Research and audit reports

- [AirRadar intelligence roadmap — parallel implementation report](research/AIRRADAR-INTELLIGENCE-ROADMAP-PARALLEL-IMPLEMENTATION-REPORT.md)
- [Intelligence roadmap progress](research/intelligence-roadmap-progress.md)
- [Rendering / performance audit](research/rendering-performance-audit.md)
- [Rendering / performance improvement report](research/RENDERING-PERFORMANCE-POLISH-REPORT.md)

A practical overview is also available in the [Czech GitHub Wiki](https://github.com/Boym323/AirRadar/wiki/%C4%8Ce%C5%A1tina).
