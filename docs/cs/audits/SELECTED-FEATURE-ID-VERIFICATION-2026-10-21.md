# Audit ID vybraných funkcí a externích rozhraní – 21. 10. 2026

Jde o **audit kódu a CI**, ne o produkční migraci ani potvrzení, že všech 90 ID je individuálně kompletně odstraněno. Výchozí stav: PR #1096, commit `a8b693bcd75d2fc0d254e10f5acc6eef4d52a259`. Strojově čitelný [inventář](../../audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json) obsahuje **všech 90 ID určených k odstranění**, doložené odstraněné vstupy a chráněné sdílené závislosti po skupinách.

## Rozsah a důkazy

- V matici je 90 REMOVE a 88 KEEP ID bez překryvu. Jen **8 ID** má jednoznačný samostatný popis v záznamech redukce; dalších **82 ID** má zatím **důkazy na úrovni skupiny**, protože původní úplný inventář názvů a souborů po jednotlivých ID není v repozitáři. Skupinový audit **není** důkaz úplného odstranění konkrétního ID.
- V PR je 601 změněných a 476 odstraněných souborů: **50 API rout**, **21 stránek** a **174 testovacích souborů**. Počty souborů nejsou počty odstraněných produktových funkcí.
- Poslední úspěšné CI, CodeQL a zátěž 1×/2×/4× jsou uvedeny v manifestu. Test `tests/selected-feature-matrix-audit.test.ts` kontroluje odstraněná API i zachované klíčové vstupy.
- Produkční řádky se počítají jedinou kanonickou metrikou `scanCodebase()` ze `scripts/code-metrics.mjs`. Test vypisuje v CI `AIRRADAR_AUDIT_CANONICAL_LOC`. Čisté smazané řádky PR **nejsou** totožné s LOC produkčního kódu.

## Kontrola po skupinách funkcí

| REMOVE ID | Počet | Zjištěný stav | Zachované závislosti / jistota |
| --- | ---: | --- | --- |
| J10 | 1 | Odstraněný produkční simulovaný přijímač | Testovací fixture zachována; skutečný readsb/Beast musí zůstat |
| R13 | 1 | Odstraněný marker přijímače a kružnice | Stav přijímače a pokrytí zachováno |
| H01–H13 mimo H03/H07 | 11 | Odstraněné historické stránky/Time Machine/Flight Story | FlightPosition a H07/H14 zachovány; skupinový důkaz |
| A03–A12 | 10 | Odstraněné rozšířené letištní analytiky | Katalog, skutečný provoz a počasí zůstávají |
| T01–T07, T11–T12 | 9 | Odstraněné ATC panely/procedury/plánovaná vrstva | ATS geometrie zachována; **T12 stále načítá data** |
| W05, W10–W14 | 6 | Odstraněné modely/fúze/předpovědní analytika | METAR, SIGMET a pozorovaná data zůstávají |
| P01–P15 | 15 | Odstraněná predikce a Flight Intelligence | Historie/schema a prázdná diagnostická kompatibilita zůstává |
| D01–D23 | 23 | Odstraněný Digital Twin | Navigation Integrity a historie zachovány |
| L01–L10, L13–L15 | 13 | Odstraněná pravidla, Fleet/Watchlist UI a API | **L11/L12 Push/Pushover a historické záznamy zachovány** |
| E08 | 1 | Odstraněná H1/FPN živá mapa | E07 RXW metadata a zprávy zůstávají |

## Ověřený rozsah produkčního kódu

GitHub Actions [CI běh 39564699980](https://github.com/Boym323/AirRadar/actions/runs/39564699980) vykázal výsledek původní funkce `scanCodebase()`: **91 775 neprázdných řádků produkčního kódu v 548 sledovaných souborech** (testovací kód: 29 462 řádků v 335 souborech). Jde o **8 225 řádků pod cílem 100 000**. Prošlo 1 880 testů, 15 přeskočeno; CI včetně browser/release validace, CodeQL i syntetická zátěž 1×/2×/4× jsou úspěšné. Toto je měření zdrojového kódu, *nikoli* měření výkonu běžící produkce nebo nasazení.

## Neuzavřená zjištění

**P1 – T12 stále zatěžuje běh:** `MapContextArchiveService.poll()` v `lib/server/map-context.ts:409–428` pravidelně spouští `pollAup()`, volá `getAirspaceActivity()` a archivuje nová plánovaná AUP/UUP data. Veřejné API plánované vrstvy je pryč, ale historické čtení i aktivní zapisovač zůstávají. Neničit historická data; prověřit potřebnost nového načítání a případně vypnout jen sběr.

**P1 – zastaralá architektura:** `docs/ARCHITECTURE.md` stále popisuje odstraněný Flight Story, Predictive, Digital Twin, AlertEngine a simulovaný přijímač jako aktivní prvky. Anglickou i českou architekturu je třeba sladit s kódem a registry funkcí.

**P1 – neověření externí klienti:** po nasazení přestane být dostupných 50 odstraněných HTTP endpointů. Nebyly k dispozici přístupové logy ani inventář externích API klientů. Před release je nutné ověřit jejich využití a změnu kontraktů.

**P1 – skutečný provoz neměřen:** v tomto auditu nejsou přístupné ověřené metriky produkčního provozu ani srovnání T58 před/po na stejné živé zátěži. Syntetická CI zátěž 1×/2×/4× není produkční A/B měření.

**P2 – kompatibilita k prověření:** vypnutý `AlertStatus` a `reloadAlertConfig()`, prázdná `predictiveEvaluatedAt` diagnostika a osiřelé browser fixture `mockWatchlist`/`mockNotifications` v `scripts/production-gates.mjs`. Mazat až po ověření konzumentů.

## Podmínky dokončení

Doplnit původní názvy a konkrétní cesty všech 82 ID zatím ověřených jen skupinově, vyřešit běhové načítání T12, zkontrolovat externí odběratele API a změřit přesný počet produkčních řádků i skutečný T58 výkon. Do té doby **nelze úplné odstranění všech funkcí podepsat**, i když CI prochází. Audit nemění databázi, historická data, `main` ani produkci.
