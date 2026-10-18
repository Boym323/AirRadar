# ADR-0001: Jediný vlastník živého stavu

[English](../../decisions/ADR-0001-single-live-owner.md)

Stav: **Přijato** (záznam existujícího kontraktu, nejde o nový návrh).

## Kontext

AirRadar přijímá místní pozice readsb, volitelná síťová pozorování, vzorkovanou historii a SSE zprávy. Více vlastníků stavu by duplikovalo polling, alerty, ukládání i statistiky a mohlo by narušit pořadí pozorování a identitu.

## Rozhodnutí

Použít jediný `AircraftStateService` v jednom procesu Node.js. Cesta místní readsb → omezená RAM → SSE musí fungovat bez volitelných obohacení a bez databáze. PostgreSQL slouží pro vzorkovanou historii, referenční/katalogová data a agregáty; síťová pozorování nesmějí předstírat důkazy lokálního přijímače.

## Důsledky a důkazy

Nespouštěj další samostatný poller z API nebo workeru. Zachovej omezené SSE/backpressure a fail-soft providery. Před změnou ověř [architekturu](../ARCHITECTURE.md), [invarianty](../RUNTIME-INVARIANTS.md), [toky dat](../DATA-FLOWS.md) a aktuální službu stavu. Tento ADR zdůvodňuje volbu, ale nepotvrzuje stav aktuální produkce.
