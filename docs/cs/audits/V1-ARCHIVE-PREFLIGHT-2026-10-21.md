# Předarchivační kontrola V1 — 21. 10. 2026

**Stav: NESCHVÁLENO k definitivní archivaci.** Režim pouze údržby je zamýšlená politika, nikoli prokázaný výsledek stabilizace. Při této přípravě dokumentace nebylo provedeno produkční nasazení, zápis do databáze, restart služby, archivace repozitáře ani push do main.

## Vlastnictví a nástupnický projekt

- Referenční aplikace: [AirRadar V1](https://github.com/Boym323/AirRadar); produkční data i dosavadní vydávací proces zůstávají zachovány.
- Samostatný nástupce: [AirRadarV2](https://github.com/Boym323/AirRadarV2). V2 má vlastní infrastrukturu a zdrojový kód; migrace V1 ani automatické přepnutí provozu se neprovádějí.
- V1 přijímá jen ověřené opravy chyb a zabezpečení a nezbytnou provozní dokumentaci. Nové funkce a rozsáhlé refaktory patří do V2.

## Důkazy při kontrole

- Aktuální `main` V1 po dokumentačním zmrazení: `d95351f4642d965657a92de2638d96a081a9aaa9`. [CI main #39667409657](https://github.com/Boym323/AirRadar/actions/runs/39667409657) prošlo a nasazení bylo správně přeskočeno, protože šlo pouze o dokumentaci.
- T58 měření [#39633253019](https://github.com/Boym323/AirRadar/actions/runs/39633253019) a [#39649188552](https://github.com/Boym323/AirRadar/actions/runs/39649188552) skončila při autentizovaném ověření diagnostiky před sběrem vzorků. Zda šlo o autentizaci nebo následnou diagnostickou projekci, zůstává **NEOVĚŘENO**.
- Původní [PR #1100](https://github.com/Boym323/AirRadar/pull/1100) bylo nahrazeno a uzavřeno bez sloučení. Jeho 41 neduplicitních souborových změn je nad aktuálním main připraveno v konceptu [PR #1104](https://github.com/Boym323/AirRadar/pull/1104). Žádný runtime kód zatím nebyl sloučen ani nasazen.
- [Release-preview #39668562558](https://github.com/Boym323/AirRadar/actions/runs/39668562558) úspěšně dokončilo produkční/core/browser testy, release testy/typecheck a výkon na kandidátu `9ac7acc0`. Samostatně prošel CodeQL i zátěžový benchmark. Dřívější lokální chybu MapLibre workeru tento CI browser běh **nezopakoval**; shoda se skutečnou produkcí ověřena není.
- Starý přepis V2 uvnitř V1 [PR #1101](https://github.com/Boym323/AirRadar/pull/1101) a neověřený upgrade Prisma RC [PR #1045](https://github.com/Boym323/AirRadar/pull/1045) byly uzavřeny bez sloučení. Nový vývoj patří pouze do AirRadarV2.
- Produkční mapování katalogu Prisma, prakticky ověřený rollback/obnova a souběžný delivery worker proti skutečné PostgreSQL zůstávají **NEOVĚŘENÉ**. Statické testy nenahrazují provozní důkazy.
- Dříve chybějící české dokumenty byly doplněny a kontrola lokalizace úspěšně prošla. Zbylé podmínky a zodpovědnost eviduje [issue #1103](https://github.com/Boym323/AirRadar/issues/1103).

## Nezbytné podmínky definitivního zmrazení V1

1. Bez obcházení autentizace vyřešit příčinu selhání T58 preflightu. Získat srovnatelnou, platnou produkční referenci pouze čtením.
2. Vědomě vypořádat otevřená PR; na přesném kandidátním SHA ověřit MapLibre browser testy a ovládání desktopu i mobilu.
3. Ověřit `npm ci`, audit produkčních závislostí, Prisma mapování a rollback, lint, TypeScript, jednotkové/integrační testy, registr funkcí, českou dokumentaci, vizuální kontroly, CodeQL a produkční testy. Potvrdit zachování požadovaných funkcí.
4. Teprve na základě výslovného schválení vydat a ověřit poslední verzi připravenou k bezpečnému návratu. Zálohovat a uchovat historická databázová data. Ověřit health, readsb, SSE, načtení assetů, mapu a provozní logy.
5. Zapsat ověřený commit/tag, důkazy testů, postup obnovy a konečné rozhodnutí. Až **potom** lze nastavit GitHub repozitář jako archivovaný/read-only; odkazy a dokumentace zůstanou dostupné.

**Bezpečnost:** Push změn aplikace do V1 `main` může vyvolat automatické produkční nasazení. Do průchodu všech kontrol pracovat odděleně. Tato zpráva není potvrzením úspěšných testů ani oprávněním k nasazení.
