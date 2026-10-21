# Předarchivační kontrola V1 — 21. 10. 2026

**Stav: NESCHVÁLENO k definitivní archivaci.** Režim pouze údržby je zamýšlená politika, nikoli prokázaný výsledek stabilizace. Při této přípravě dokumentace nebylo provedeno produkční nasazení, zápis do databáze, restart služby, archivace repozitáře ani push do main.

## Vlastnictví a nástupnický projekt

- Referenční aplikace: [AirRadar V1](https://github.com/Boym323/AirRadar); produkční data i dosavadní vydávací proces zůstávají zachovány.
- Samostatný nástupce: [AirRadarV2](https://github.com/Boym323/AirRadarV2). V2 má vlastní infrastrukturu a zdrojový kód; migrace V1 ani automatické přepnutí provozu se neprovádějí.
- V1 přijímá jen ověřené opravy chyb a zabezpečení a nezbytnou provozní dokumentaci. Nové funkce a rozsáhlé refaktory patří do V2.

## Důkazy při kontrole

- Prověřený commit main V1: `7b7624d3bb83509050863a4f3c64e8b324b5dfb5` (21. 10. 2026).
- Poslední pozorované úspěšné CI na main bylo pro `53f137d8`; **nejde** o certifikaci aktuální hlavy větve.
- T58 měření [#39633253019](https://github.com/Boym323/AirRadar/actions/runs/39633253019) a [#39649188552](https://github.com/Boym323/AirRadar/actions/runs/39649188552) skončila při autentizovaném ověření diagnostiky, ještě před sběrem vzorků. Z logu nelze určit, zda šlo o rozdílný token nebo chybu navazující kontroly.
- [PR #1100](https://github.com/Boym323/AirRadar/pull/1100) obsahuje rozsáhlé opravy, ale **není** sloučeno ani produkčně ověřeno. Jeho CI selhalo na kontrole české dokumentace a evidovaný browser test vykazuje chyby MapLibre symbol workeru.
- [PR #1101](https://github.com/Boym323/AirRadar/pull/1101) se týká dřívějšího plánu přepisu V2 a **nesmí** být automaticky začleněno do zmrazené V1.
- Produkční mapování Prisma schématu a reálné databázové důkazy souběhu/obnovy workerů nejsou podle auditu PR #1100 dostupné.
- Nově přidané anglické zadání samostatné V2 dosud nemá českou verzi; kontrola parity dokumentace zůstává blokována, dokud nebude doplněna.

## Nezbytné podmínky definitivního zmrazení V1

1. Bez obcházení autentizace vyřešit příčinu selhání T58 preflightu. Získat srovnatelnou, platnou produkční referenci pouze čtením.
2. Vědomě vypořádat otevřená PR; na přesném kandidátním SHA ověřit MapLibre browser testy a ovládání desktopu i mobilu.
3. Ověřit `npm ci`, audit produkčních závislostí, Prisma mapování a rollback, lint, TypeScript, jednotkové/integrační testy, registr funkcí, českou dokumentaci, vizuální kontroly, CodeQL a produkční testy. Potvrdit zachování požadovaných funkcí.
4. Teprve na základě výslovného schválení vydat a ověřit poslední verzi připravenou k bezpečnému návratu. Zálohovat a uchovat historická databázová data. Ověřit health, readsb, SSE, načtení assetů, mapu a provozní logy.
5. Zapsat ověřený commit/tag, důkazy testů, postup obnovy a konečné rozhodnutí. Až **potom** lze nastavit GitHub repozitář jako archivovaný/read-only; odkazy a dokumentace zůstanou dostupné.

**Bezpečnost:** Push změn aplikace do V1 `main` může vyvolat automatické produkční nasazení. Do průchodu všech kontrol pracovat odděleně. Tato zpráva není potvrzením úspěšných testů ani oprávněním k nasazení.
