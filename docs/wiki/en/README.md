# AirRadar Wiki

AirRadar is a dark-mode ADS-B radar for a local `readsb` receiver. Live state
stays in RAM and is delivered over Server-Sent Events (SSE). PostgreSQL stores
sampled history, reference data, and daily statistics.

## Start here

- [Getting started](getting-started.md)
- [Architecture and data flow](architecture.md)
- [Configuration](configuration.md)
- [Development and testing](development.md)
- [Deployment and operations](operations.md)

## Authoritative documentation

The technical source of truth is maintained in [architecture](../../ARCHITECTURE.md),
[data flows](../../DATA-FLOWS.md), [runtime invariants](../../RUNTIME-INVARIANTS.md),
[development](../../DEVELOPMENT.md), [release](../../RELEASE.md),
[data sources](../../DATA-SOURCES.md), and [features](../../FEATURES.md).

Keep the Czech pages in `../cs/` synchronized with these pages.
