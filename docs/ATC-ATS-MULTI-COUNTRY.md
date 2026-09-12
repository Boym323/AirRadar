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

## Austrian implementation (audit / pre-production)

Austria is discovered from the official [Austro Control AIP entrypoint](https://eaip.austrocontrol.at/), not from a hard-coded dated directory. The discovery parser selects the publication satisfying `effectiveFrom <= now < effectiveUntil` and reports a future publication separately. The 12 Sep 2026 audit selected 04 Sep 2026 (AMDT 357, AIRAC AMDT 312) and discovered 01 Oct 2026 as future; the rollover fixtures cover both sides of the boundary.

`lib/atc/austro-control.ts` uses bounded HTTPS HTML/PDF fetches, validates the PDF magic bytes/content type, and extracts the native PDF text layer with `pdfjs-dist`. ENR 2.1 preserves source vertical-limit expressions in remarks, including multi-class and conditional AGL/AMSL text. `FIR WIEN` and TMA/CTA rows containing `along State Boundary` resolve only through the committed BEV artifact; no straight-line or non-authoritative substitute is used.

The audited source is the official [BEV Verwaltungsgrenzen (VGD) INSPIRE dataset](https://data.bev.gv.at/geonetwork/srv/metadata/793160c9-426a-43a6-ba6b-9702c5dff89b), dataset identifier `https://doi.org/10.48677/793160c9-426a-43a6-ba6b-9702c5dff89b`, INSPIRE reference date `01.10.2025`, delivered as [SHP](https://data.bev.gv.at/download/Verwaltungsgrenzen/shp/20251001/AT_INSPIRE_AB_AdministrativeBoundaries_SHP_CSV_20251001.zip). The metadata declares `CC BY 4.0`, source CRS EPSG:3416 (ETRS_1989_LAEA), and includes the national state boundary. The reproducible generator `scripts/generate-at-boundary.mjs` filters the `1stOrder` national-level records, transforms to EPSG:4326 with `proj4`, applies endpoint-preserving ~2 m Douglas–Peucker simplification, and writes the committed derived artifact `data/atc/at-state-boundary.json`. The artifact records attribution, source URLs, CRS, transformation, SHA-256 checksum `341c5f932f1065c17c3f5a96037a822e2454fb7c54210a939645d07a87a7d783`, 482 line segments and 61,441 vertices. The runtime resolver uses a 5 km maximum endpoint snap to accommodate the generalized AIP/BEV representation and reports provider provenance. Redistribution is covered by [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) with the recorded BEV attribution.

The Austrian ATS audit parsed native PDF ENR 3.2 into the shared route/point/segment shape: 25 routes and 63 segments. ENR 3.1 `NIL` and ENR 3.3 specifically designated routes `NIL` are treated as healthy zero-route datasets. ENR 3.3 FRA references remain metadata-only; no synthetic ATS LineStrings are generated.

Commands:

```text
npm run atc:sync:at -- --dry-run
npm run atc:status:at
npm run ats:sync:at -- --dry-run
npm run ats:status:at
```

The AT implementation has no Prisma schema change or production import. The BEV licensing/provenance blocker is resolved for the audited dataset and the boundary-derived geometry is validated by the generator, provider test, and dry-run import. Production enablement still requires the operator to run the documented import/release procedure; this worktree has not deployed or modified production data.

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
