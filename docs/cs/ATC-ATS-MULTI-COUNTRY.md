# Audit a implementace ATC/ATS pro více zemí

## Aktuální česká implementace

CZ ATC pochází z oficiálního RLP eAIP a vybraných oficiálních providerů
hranic, parsuje se v `lib/atc/cz-eaip.ts`, validuje sdíleným ATC importním
formátem a ukládá do `AtcSector`/`AtcTransmitter`. `/api/atc/sectors`
čte stejné databázové řádky pro resolver i MapLibre. CZ ATS je offline
generovaný dokument ENR 3.2 používaný `lib/ats/cz-routes.ts` a vykreslovaný
společným source/layers `ats-routes`.

## Sdílená hranice zavedená pro SK

SK ATC používá stejný import validator, databázový importer, boundary resolver,
API, sector matcher a MapLibre source jako CZ. SK ATS používá stejný
normalizovaný tvar route/point/segment a stejný GeoJSON generator.
Provider-specific kód je omezen na discovery LPS SR eAIP a parsování tabulek v
`lib/atc/sk-eaip.ts` a `lib/ats/sk-eaip-routes.ts`.

Všechny generované ATS features zveřejňují `countryCode`; source metadata
obsahují providera, sekci a effective date. Stabilní datované URL se používají
pouze jako omezený discovery fallback nebo fixtures; běžný sync nejprve čte
oficiální menu LPS SR.

## Rakouská implementace (audit / pre-production)

Rakousko se objevuje z oficiálního
[Austro Control AIP entrypointu](https://eaip.austrocontrol.at/), nikoli z
natvrdo zadaného datovaného adresáře. Discovery parser vybírá publikaci
splňující `effectiveFrom <= now < effectiveUntil` a budoucí publikaci hlásí
samostatně. Audit 12. 9. 2026 vybral 4. 9. 2026 (AMDT 357, AIRAC AMDT 312) a
nalezl 1. 10. 2026 jako budoucí; rollover fixtures pokrývají obě strany hranice.

`lib/atc/austro-control.ts` používá omezené HTTPS HTML/PDF fetch, validuje PDF
magic bytes/content type a extrahuje nativní textovou vrstvu PDF pomocí
`pdfjs-dist`. ENR 2.1 zachovává source výrazy vertikálních limitů v remarks,
včetně multi-class a podmíněného AGL/AMSL textu. `FIR WIEN` a řádky TMA/CTA
obsahující `along State Boundary` se řeší pouze přes commitnutý artefakt BEV;
nepoužívá se přímá čára ani neautoritativní náhrada.

Auditovaným zdrojem je oficiální
[BEV Verwaltungsgrenzen (VGD) INSPIRE dataset](https://data.bev.gv.at/geonetwork/srv/metadata/793160c9-426a-43a6-ba6b-9702c5dff89b),
identifikátor datasetu
`https://doi.org/10.48677/793160c9-426a-43a6-ba6b-9702c5dff89b`,
INSPIRE referenční datum `01.10.2025`, doručený jako
[SHP](https://data.bev.gv.at/download/Verwaltungsgrenzen/shp/20251001/AT_INSPIRE_AB_AdministrativeBoundaries_SHP_CSV_20251001.zip).
Metadata deklarují `CC BY 4.0`, source CRS EPSG:3416
(ETRS_1989_LAEA) a obsahují národní státní hranici. Reprodukovatelný generator
`scripts/generate-at-boundary.mjs` filtruje záznamy národní úrovně
`1stOrder`, transformuje do EPSG:4326 pomocí `proj4`, aplikuje
endpoint-preserving ~2m Douglas–Peucker simplification a zapisuje commitnutý
odvozený artefakt `data/atc/at-state-boundary.json`. Artefakt zaznamenává
atribuci, source URL, CRS, transformaci, SHA-256 checksum
`341c5f932f1065c17c3f5a96037a822e2454fb7c54210a939645d07a87a7d783`,
482 line segmentů a 61 441 vertices. Runtime resolver používá maximální
endpoint snap 5 km kvůli generalizované reprezentaci AIP/BEV a hlásí provider
provenienci. Redistribuci pokrývá
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0) se zaznamenanou atribucí BEV.

Rakouský ATS audit parsoval nativní PDF ENR 3.2 do sdíleného tvaru
route/point/segment: 25 routes a 63 segmentů. ENR 3.1 `NIL` a ENR 3.3
specifically designated routes `NIL` se považují za zdravé zero-route
datasety. Reference FRA z ENR 3.3 zůstávají pouze metadata; negenerují se žádné
syntetické ATS LineStrings.

Příkazy:

```text
npm run atc:sync:at -- --dry-run
npm run atc:status:at
npm run ats:sync:at -- --dry-run
npm run ats:status:at
```

AT implementace nemá změnu Prisma schématu ani produkční import. Blokátor
licencování/provenience BEV je pro auditovaný dataset vyřešen a geometry
odvozená z hranice je validována generátorem, provider testem a dry-run
importem. Produkční zapnutí stále vyžaduje, aby operátor spustil zdokumentovaný
import/release postup; tento worktree nic nenasadil ani nezměnil produkční data.

## Bezpečnostní zjištění

Existující Prisma model může ukládat více zemí bez migrace a už zachovává
source, source reference, validity a verification time. Minimální sémantické
rozšíření přidává nullable sloupce `airspaceType`, `airspaceClass` a
`remarks`. Je zpětně kompatibilní s CZ řádky, ale připravená migrace není
aplikována do produkce.

SK ATC importer používá oficiální základní národní boundary artefakt GKÚ
Bratislava / ZBGIS pro slovenské state-boundary segmenty a Bratislava FIR a
oficiální LPS SR AD 2 ARP souřadnice pro dva publikované oblouky 7 NM. Nikdy
nemění AIP boundary reference na tětivu. Poznámky ATS continuation končí v
posledním autoritativním slovenském bodě a zachovávají se jako remarks.

Příkazy:

```text
npm run atc:sync:sk -- --dry-run
npm run atc:status:sk
npm run ats:sync:sk -- --dry-run
npm run ats:status:sk
```
