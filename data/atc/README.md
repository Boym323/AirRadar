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
`SFC`, `FL245`-style flight levels, or `UNL` for an open upper limit. Do not
put local unit conversion logic into the resolver.

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

The template file in this directory is documentation only and contains no
operational Czech sector or frequency data.

For Czech coverage, start with the official [AIP publication from AIM ŘLP
ČR](https://aim.rlp.cz/ais_data/aip/control/aip_obsah_cz.htm), especially the
published ATS-airspace and communication sections, and record the exact AIP
amendment/effective date in the import source block. The public AIM dataset
catalog currently lists AIXM 5.1 terrain/obstacle data, not a ready-to-import
ATC sector/frequency dataset; those files must not be treated as an ATC source.
