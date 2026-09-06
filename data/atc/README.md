# ATC dataset imports

This directory is reserved for locally maintained ATC reference data. No
verified Czech AIP dataset is bundled with AirRadar.

## JSON schema

An import document has `schemaVersion: 1`, one `source` block, and `sectors`
and `transmitters` arrays. `source.name`, `source.reference`,
`source.effectiveDate`, and `source.lastVerifiedAt` are required. Sector
geometry is an array of polygon rings; coordinates are always
`[longitude, latitude]`. Multiple rings represent separated parts of one
sector. Frequencies are numeric MHz values with at most three decimal places.

Altitude values are normalized during import: use a number for feet AMSL,
`1000 AGL`, `SFC`, `FL245`-style flight levels, or `UNL` for an open upper
limit. AGL/FL/SFC/UNL references are retained on the imported sector. Do not
put local unit conversion logic into the resolver. Frequencies may include
VHF and explicitly published UHF values up to 400 MHz.

The row-level `sourceReference`, `lastVerifiedAt`, `validFrom`, and `validTo`
fields may override the source defaults. `validTo: null` means no known end.
Date-only values are interpreted as UTC; an end date covers that whole UTC
day.

## Import workflow

1. Obtain the official or otherwise authoritative publication and confirm its
   meaning, effective date, geometry, vertical limits, and frequencies.
2. Create a JSON document following the schema above. Keep the publication or
   URL in `source.reference`; do not import screen-scraped or community-only
   frequency tables as production data.
3. Validate the complete document without writing:

   ```bash
   npm run atc:import -- --dry-run data/atc/cz-atc.json
   ```

4. Review added, updated, unchanged, and obsolete IDs. A non-dry import is
   transactional and updates rows by their stable `id`.

   ```bash
   npm run atc:import -- data/atc/cz-atc.json
   ```

Missing IDs from the same source are retained but expired at the new dataset
effective date; flight history is never touched. Re-running the same document
does not create duplicates. Restart the application after an import so the
in-process resolver cache observes the new dataset.

## Czech eAIP sync

The reproducible Czech ACC adapter downloads only the official AIM/eAIP host,
reads ENR 2.1 plus official GEN 0.2 amendment metadata, parses the XHTML DOM,
normalizes coordinates/arcs/limits/frequencies, validates the complete result,
and then calls the same importer above. AIM is not contacted by the running
radar service.

```bash
npm run atc:sync:cz -- --dry-run
npm run atc:sync:cz
npm run atc:status:cz
```

The sync accepts only concrete `PRAHA ACC` / `PRAHA RADAR` operational
sectors. FIR/CTA/TMA/FIC rows and aggregate sector rows are classified but are
not imported. `CWA`/`CCA` arcs are deterministically densified. AIP remains
the source of ATC semantics; when it marks a side as a state boundary, the
sync obtains the missing WGS84 polyline from the official [ČÚZK Data50
service](https://ags.cuzk.gov.cz/arcgis/rest/services/DATA50/MapServer),
using its [official metadata](https://geoportal.gov.cz/php/micka/record/basic/CZ-CUZK-DATA50-V?dlang=eng).
The process-local provider fetches Data50 once per sync, snaps only within a
bounded tolerance, joins connected state/tripoint features, and rejects
ambiguous, disconnected or self-intersecting results. There is no straight
line fallback; intersecting AIP/Data50 walks are split into validated rings,
never repaired with a guessed line. Data50 attribution is [ČÚZK Data50, CC BY
4.0](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx). Generated
snapshots and downloaded source files are not committed; the current official
dataset belongs in PostgreSQL only after an explicit, fully validated sync.

The template file in this directory is documentation only and contains no
operational Czech sector or frequency data.

For Czech coverage, start with the official [AIP publication from AIM ŘLP
ČR](https://aim.rlp.cz/ais_data/aip/control/aip_obsah_cz.htm), especially the
published ATS-airspace and communication sections, and record the exact AIP
amendment/effective date in the import source block. The public AIM dataset
catalog currently lists AIXM 5.1 terrain/obstacle data, not a ready-to-import
ATC sector/frequency dataset; those files must not be treated as an ATC source.
