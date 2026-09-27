# České ATS tratě (ENR 3.2)

AirRadar v1.5A připravuje validovaný file-backed dataset českých ATS tratí z
oficiální stránky AIM ŘLP ČR eAIP ENR 3.2. Nezapisuje do PostgreSQL a netvrdí,
že je publikovaný route segment právě aktivní.

Oficiální zdroj:

- `https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-3.2-en-GB.html`

## Příkazy

```bash
npm run ats:sync:cz -- --dry-run
npm run ats:sync:cz
npm run ats:status:cz
```

Výchozí generovaný soubor je:

```text
data/ats/generated/cz-routes.json
```

Lze jej přepsat přes `ATS_CZ_ROUTES_PATH`.

Sync načte ENR 3.2 a aktuální český publication record, parsuje strojově
čitelná eAIP/AIXM annotations, validuje výsledek a poté atomicky nahradí
existující JSON. Selhání fetch, parse, kontroly publication date nebo
geometry-distance ponechá předchozí dataset beze změny.

## Parsovaná data

Každá route zachovává:

- route designátor a stabilní eAIP source identifier;
- významné body a jejich autoritativní publikované souřadnice;
- identitu designated-point oproti navaid;
- marker zahraničního EAD maintaineru (`*ED`, `*EP`, `*LO`, `*LZ`);
- segment MAG tracks, GEO DIST, RNAV accuracy, vertikální limity a směr IFR cruising;
- publication metadata CDR1/CDR2/CDR3, jsou-li přítomna;
- airway discontinuities;
- lidsky čitelné route/segment remarks relevantní k publikovanému řádku.

Parser přiřadí segment pouze k významným bodům bezprostředně před a za jeho
řádkem. `AWY discontinuation` tento řetězec explicitně přeruší. Strukturované
route identifikátory zmíněné uvnitř remarks (například publikovaná permanentní
alternativní route) jsou pouze reference a neparsují se jako nové route headers.

## Bezpečnostní sémantika

`availabilityStatus` je v tomto datasetu vždy `UNKNOWN`. ENR 3.2 je
publikační zdroj, nikoli real-time route-availability feed. CDR metadata jako
`CDR1 H24` se zachovávají jako publikovaná metadata, ale AirRadar je nesmí
samotná převést na live stav `ACTIVE`.

Jako další parser guard se každý publikovaný GEO DIST porovnává s great-circle
vzdáleností vypočtenou z publikovaných souřadnic obou endpointů. Významný
nesoulad způsobí selhání syncu místo emitování odhadnuté geometrie.

Tato fáze záměrně nepřidává mapovou vrstvu ani veřejné API. Ty patří do v1.5B,
která může tento soubor používat bez změny PostgreSQL schématu.

## Terminální postupy

Data SID/STAR se záměrně nemíchají do ATS route dokumentu. Procedure pipeline
vlastní `lib/procedures` a používá sdílené V2 kontrakty z
`lib/route-intelligence/contracts.ts`:

```text
official CZ/SK/AT AD 2 eAIP → procedures:sync → parse → validate
→ data/procedures/generated/procedures.json → ProcedureRepository
```

Spusťte `npm run procedures:sync -- --dry-run` pro validaci aktuální
oficiální publikace bez zápisu. Pomocí `--country=CZ,SK,AT` a/nebo
`--airport=LKPR,LZIB,LOWW` lze sync omezit. Generovaný soubor je jediný
runtime zdroj; selhání jsou fail-safe a zachovávají předchozí soubor.

Parser přijímá strojově čitelné eAIP/native text řádky a explicitní
discontinuities. Chybějící souřadnice zůstávají partial geometry. Nikdy
neprovádí OCR diagramu ani nepovažuje neověřený dataset za produkční navigační data.
