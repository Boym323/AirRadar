# Slovenský ATC / eAIP sync

AirRadar může importovat konzervativní podmnožinu publikovaného slovenského
ATS vzdušného prostoru z oficiální publikace LPS SR AIM eAIP ENR 2.1.

## Zdroj

Sync přijímá pouze HTTPS dokumenty z `aim.lps.sk` v oficiálním eAIP stromu.
Odvozuje kandidátní AIRAC adresáře z 28denního cyklu, nejprve zkouší aktuální
cyklus a zachovává omezený fallback na předchozí cyklus kvůli rozdílům v
názvech publikací. Běžící služba AirRadar nikdy nekontaktuje LPS AIM; zdroj
načítá pouze operátor příkazem synchronizace.

Importovaný source name je `Slovak eAIP`. Každý persistovaný sektor zachovává
přesnou source URL, effective date a verification timestamp, používá
`country = SK` a sdílí existující schéma `AtcSector` a resolver s českými
daty. `BRATISLAVA FIR` kombinuje definici LPS ENR 2.1 s oficiálním národním
polygonem GKÚ Bratislava/ZBGIS; oba zdroje se zachovávají v source reference.

## Pravidla geometrie

Adaptér v1 je záměrně fail-closed.

- Explicitní souřadnicové polygony z ENR 2.1 se přijímají, pokud je přijme
  běžný ATC import validator.
- Publikovaný segment `along state boundary` se přijme pouze tehdy, když
  injektovaný oficiální boundary provider GKÚ/ZBGIS dokáže vyřešit oba
  publikované endpointy v rámci produkční tolerance. Normalizovaný source
  artefakt je `data/atc/sk-state-boundary.json`.
- Slovenské hranice s Polskem, Rakouskem, Maďarskem nebo Ukrajinou se řeší ze
  stejné oficiální státní hranice pouze mezi endpointy publikovanými v AIP;
  úplná hranice se nikdy nedosazuje za jednotlivý segment sektoru.
- Obecný `circular arc` se neimportuje, pokud jeho směr nelze reprezentovat
  jednoznačně. Není povolena přímá tětiva ani odhad clockwise/counter-clockwise.
- Pro produkční geometrii neexistuje fallback na komunitní data ani obecný GISCO.

Apply příkaz také odmítá automaticky označit jako obsolete jakýkoli dříve
importovaný sektor `Slovak eAIP`, který zmizí z aktuální persistovatelné
parsované sady. Skutečné AIP smazání/přejmenování proto vyžaduje explicitní
revizi a nelze je zaměnit za regresi upstream markupu, parseru nebo boundary
providera.

## Frekvence a sémantika

Importují se pouze podporované civilní VHF hlasové ATC frekvence podle
existující AirRadar frequency policy. Parser zachovává publikovanou ATC
jednotku/callsign, je-li přítomna, a nikdy nevytváří polohy vysílačů, protože
ENR 2.1 neurčuje autoritativní polohu transmitter site.

Publikovaný vzdušný prostor není provozní údaj aktivace. Existující runtime
model nadále zveřejňuje importované sektory s `activationStatus = UNKNOWN`,
dokud nebude později implementován samostatný autoritativní provozní feed.
Stejně tak existující aircraft-to-sector resolver znamená pouze to, že
pozice/výška letadla geometricky odpovídá publikovanému sektoru; nikdy se
nesmí prezentovat jako důkaz, že letadlo komunikuje na uvedené frekvenci.

Adaptér zachovává normalizovaný `airspaceType`, publikovaný `airspaceClass`,
je-li přítomen, a source-only text v `remarks`. Class zůstává nullable tam,
kde jej AIP řádek nepublikuje.

## Příkazy

Náhled aktuální oficiální publikace bez databázových změn:

```bash
npm run atc:sync:sk -- --dry-run
```

Porovnání aktuální publikace s uloženými slovenskými řádky:

```bash
npm run atc:status:sk
```

Apply spusťte až po revizi výstupu dry-run:

```bash
npm run atc:sync:sk
```

Sync používá existující transakční ATC importer. Nemění historii letadel.
Nullable sémantické sloupce pokrývá připravená aditivní Prisma migrace a musí
být aplikována před produkčním importem.

## Očekávané pokrytí v1

Adaptér má regression anchors pro sektory s explicitní geometrií včetně
`KOŠICE TMA 1A`, `PIEŠŤANY TMA 2`, `POPRAD TMA 1`, `POPRAD TMA 2` a
`ŽILINA TMA 3`. Produkční apply selže před jakýmkoli databázovým zápisem,
pokud některý z těchto anchorů zmizí z aktuálního parse.

Další řádky se importují, pokud jejich geometrie a frekvence splní stejná
pravidla. Řádky vyžadující nepodporovanou geometrii státní hranice nebo
nejednoznačné oblouky se hlásí jako source-limited/skipped místo odhadování.
