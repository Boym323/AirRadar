# Inventář odmítnutých slovenských ATC záznamů

Tento inventář zaznamenává audit importu slovenského ENR 2.1 provedený proti
oficiálnímu LPS eAIP s účinností od 3. září 2026.

## Počáteční odmítnutí

První běh parseru odmítl 17 konkrétních záznamů:

- `PARSER_STRUCTURE` (5): BRATISLAVA CTA SECTOR WEST, CENTRAL a EAST a
  SECTOR FIS WEST a EAST. Zdrojová tabulka používá row spans a umisťuje
  vertikální limit před opakovaný class label; parser chybně vyhodnotil
  opakovaný label jako konec hodnoty.
- `STATE_BOUNDARY` (15): BRATISLAVA CTA SECTOR WEST, CENTRAL a EAST, SECTOR
  FIS WEST a EAST, BRATISLAVA TMA2/3/4, KOŠICE TMA1B/1C/2/3/4 a POPRAD
  TMA3/4. Tyto záznamy používají oficiální popis státní hranice a řeší se přes
  oficiální základní geometrii hranic GKÚ/ZBGIS.
- `ARC` (2): BRATISLAVA TMA1 a PIEŠŤANY TMA1. Ty se řeší z oficiálních ARP
  souřadnic a radiusů na stránkách LPS AD 2.

Kategorie se překrývají: pět strukturálních záznamů je zároveň mezi záznamy
hranice, takže unikátní počet počátečních rejectů je 17, nikoli 22.

## Aktuální výsledek

Aktuální dry run přijímá 25 persistovatelných slovenských záznamů včetně
`BRATISLAVA FIR` a přeskakuje 0 konkrétních záznamů. Šest má přímou source
geometrii a 18 deterministicky boundary-resolved geometrii. Aktuální počty
typů jsou 19 TMA, 3 CTA sector a 2 FIS/other.

`BRATISLAVA CTA` je agregát uvádějící, že se skládá ze tří CTA sektorů, a
neduplikuje se jako samostatný polygonový záznam. `BRATISLAVA FIR` se
konstruuje z textové definice LPS plus oficiálního národního polygonu ZBGIS,
přičemž v source reference zůstává zachována dvojí provenience.

Zdroj: [LPS Slovakia eAIP ENR 2.1](https://aim.lps.sk/web/eAIP_SR/AIP_SR_EFF_03SEP2026/html/LZ-ENR-2.1-en-SK.html).
