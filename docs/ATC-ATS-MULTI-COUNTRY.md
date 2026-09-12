# ATC/ATS multi-country audit and implementation

## Current Czech implementation

CZ ATC is sourced from the official RLP eAIP and selected official boundary
providers, parsed in `lib/atc/cz-eaip.ts`, validated by the shared ATC import
format, and stored in `AtcSector`/`AtcTransmitter`. `/api/atc/sectors` reads
the same database rows for the resolver and MapLibre. CZ ATS is an offline
generated ENR 3.2 document consumed by `lib/ats/cz-routes.ts` and rendered by
the common `ats-routes` source/layers.

## Shared boundary introduced for SK

SK ATC uses the same import validator, database importer, boundary resolver,
API, sector matcher, and MapLibre source as CZ. SK ATS uses the same normalized
route/point/segment shape and the same GeoJSON generator. The provider-specific
code is limited to LPS SR eAIP discovery and table parsing in
`lib/atc/sk-eaip.ts` and `lib/ats/sk-eaip-routes.ts`.

All generated ATS features expose `countryCode`; source metadata contains the
provider, section and effective date. Stable dated URLs are used only by
bounded discovery fallback or fixtures; normal sync first reads the official
LPS SR menu.

## Safety findings

The existing Prisma model can store multiple countries without migration and
already retains source, source reference, validity and verification time.
The minimal semantic extension adds nullable `airspaceType`, `airspaceClass`
and `remarks` columns. It is backward-compatible with CZ rows, but the
prepared migration is not applied to production.

The SK ATC importer uses the official GKÚ Bratislava / ZBGIS basic-level
national-boundary artifact for SK state-boundary segments and Bratislava FIR,
and official LPS SR AD 2 ARP coordinates for the two published 7 NM arcs. It
never turns an AIP boundary reference into a chord. ATS continuation
notes terminate at the last authoritative Slovak point and are retained as
remarks.

Commands:

```text
npm run atc:sync:sk -- --dry-run
npm run atc:status:sk
npm run ats:sync:sk -- --dry-run
npm run ats:status:sk
```
