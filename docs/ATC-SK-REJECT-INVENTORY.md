# Slovak ATC reject inventory

This inventory records the Slovak ENR 2.1 import audit performed against the
official LPS eAIP effective 3 September 2026.

## Initial rejects

The initial parser run rejected 17 concrete records:

- `PARSER_STRUCTURE` (5): BRATISLAVA CTA SECTOR WEST, CENTRAL and EAST, and
  SECTOR FIS WEST and EAST. The source table uses row spans and places the
  vertical-limit value before a repeated class label; the parser incorrectly
  treated the repeated label as the end of the value.
- `STATE_BOUNDARY` (15): BRATISLAVA CTA SECTOR WEST, CENTRAL and EAST, SECTOR
  FIS WEST and EAST, BRATISLAVA TMA2/3/4, KOŠICE TMA1B/1C/2/3/4, and POPRAD
  TMA3/4. These records use the official state-boundary description and are
  resolved through the official GKÚ/ZBGIS basic-level boundary geometry.
- `ARC` (2): BRATISLAVA TMA1 and PIEŠŤANY TMA1. These are resolved from the
  official ARP coordinates and radii in the LPS AD 2 pages.

The categories overlap: the five structural records are also among the
boundary records, so the unique initial reject count is 17, not 22.

## Current result

The current dry run accepts 25 persistable Slovak records, including
`BRATISLAVA FIR`, and skips
0 concrete records. Six have direct source geometry and 18 have deterministic
boundary-resolved geometry. Current type counts are 19 TMA, 3 CTA sector and
2 FIS/other.

`BRATISLAVA CTA` is an aggregate saying it consists of the three CTA sectors
and is not duplicated as an independent polygon record. `BRATISLAVA FIR` is
constructed from the LPS textual definition plus the official ZBGIS national
polygon, with dual provenance retained in the source reference.

Source: [LPS Slovakia eAIP ENR 2.1](https://aim.lps.sk/web/eAIP_SR/AIP_SR_EFF_03SEP2026/html/LZ-ENR-2.1-en-SK.html).
