# Původní názvy funkcí REMOVE a důkazy v kódu

Všech 90 původních názvů REMOVE bylo obnoveno z původního výběru (2026-10-19T19:01:21Z). Individuální odstranění implementace **není prokázáno** u 82 ID, které mají jen skupinový důkaz.

| ID | Původní název funkce (REMOVE) | Důkaz odstranění implementace | Soubory sdílené skupiny |
|---|---|---|---|
| J10 | Demo provoz se simulovanými letadly | Výslovná zmínka o odstranění | `lib/server/providers.ts`, `lib/server/aircraft-state.ts`, `lib/server/history.ts` |
| R13 | Poloha přijímače, kružnice dosahu a měřítko | Výslovná zmínka o odstranění | `components/airradar-app.tsx`, `lib/radar/airspace-geojson.ts`, `app/api/stream/route.ts` |
| H01 | Samostatný detail letadla – registrace, typ, operátor | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H02 | Katalog a automatické doplňování metadat letadel | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H04 | Letový plán, volací znak a letiště OD/DO | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H05 | Historie konkrétního letadla a jeho letů | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H06 | Detail jednotlivého letu (Flight Story V2) | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H08 | Historické přehrávání konkrétního letu | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H09 | Seznam a vyhledávání historických letů | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H10 | Porovnání dvou letů | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H11 | Time Machine – přehrávání všech letadel v čase | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H12 | Event Replay – ±10 minut kolem události | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H13 | Historická identita NEW / RARE / RETURNING | Pouze skupinový | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| A03 | Airport Live Board – přehled provozu letiště | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A04 | Odvozené přílety, odlety a průlety | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A05 | Vyhodnocení použitých přistávacích drah | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A06 | Arrival Sequence / Approach Queue | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A07 | Arrival Flow, vytížení a stabilita drah (V8) | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A08 | Odhad terminálové poptávky / příletů (V9) | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A09 | Provozní výjimky a konfliktní údaje letiště | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A10 | Live Airport Network – okolní aktivní letiště | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A11 | Porovnání letišť | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A12 | Historická statistika provozu letiště za 7/30 dní | Pouze skupinový | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| T01 | ATC sektory včetně geometrie a výškových hranic | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T02 | Samostatný detail ATC sektoru | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T03 | ATC frekvence, vysílače a publikované služby | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T04 | Pravděpodobné ATC přiřazení vybraného letadla | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T05 | ATC handoff – odhad přechodu mezi sektory | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T06 | Historie provozu a přechodů mezi sektory – API | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T07 | Validace a diagnostika ATC dat | Pouze skupinový | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T11 | Letové procedury SID/STAR a procedurální data | Výslovná zmínka o odstranění | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T12 | AUP/UUP – plánovaná aktivace vzdušného prostoru | Výslovná zmínka o odstranění | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| W05 | Model větru ICON-EU v různých letových hladinách | Pouze skupinový | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W10 | Weather Fusion – spojení více zdrojů počasí | Výslovná zmínka o odstranění | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W11 | Weather Avoidance – vyhodnocení možné odchylky kvůli počasí | Výslovná zmínka o odstranění | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W12 | Počasí na trase zvoleného letu | Výslovná zmínka o odstranění | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W13 | Historické mapové počasí v Time Machine | Pouze skupinový | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W14 | Weather Corridor – počasí v předpokládaném koridoru | Pouze skupinový | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| P01 | Flight Intelligence – automatické události | Pouze skupinový |  |
| P02 | Rozpoznávání holding, go-around, diversion, orbit a neobvyklých zatáček | Pouze skupinový |  |
| P03 | Přehled událostí a analytická stránka | Pouze skupinový |  |
| P04 | Route Intelligence – interpretace letového plánu | Pouze skupinový |  |
| P05 | Route Corridor Intelligence – odchylka od plánované trasy | Pouze skupinový |  |
| P06 | Trajectory Conformance – odklon, návrat a pravděpodobné DCT | Pouze skupinový |  |
| P07 | Predikce času příletu ETA | Pouze skupinový |  |
| P08 | Predikce přistávací dráhy | Pouze skupinový |  |
| P09 | Predikce změny přistávací dráhy | Pouze skupinový |  |
| P10 | Predikce budoucí trajektorie | Pouze skupinový |  |
| P11 | Explainable Prediction – vysvětlení podkladů predikcí | Pouze skupinový |  |
| P12 | Prospektivní sběr a validace predikcí | Pouze skupinový |  |
| P13 | Readiness a pravidla pro zveřejnění predikcí | Pouze skupinový |  |
| P14 | Kalibrace a porovnání predikcí s výsledky | Pouze skupinový |  |
| P15 | Predictive Operations Center – souhrn předpovědí | Pouze skupinový |  |
| D01 | Digital Twin – základní projekce letu na 30 minut | Pouze skupinový |  |
| D02 | 4D koridor – budoucí poloha, výška a čas | Pouze skupinový |  |
| D03 | Prediction Timeline v detailu letadla | Pouze skupinový |  |
| D04 | Budoucí průniky ATC sektorů a ATS tras | Pouze skupinový |  |
| D05 | Průniky s plánovanými AUP/UUP prostory | Pouze skupinový |  |
| D06 | Průniky s Navigation Integrity anomáliemi | Pouze skupinový |  |
| D07 | Operational Focus – prioritní situace letadla | Pouze skupinový |  |
| D08 | Operational Focus Change – změny priorit | Pouze skupinový |  |
| D09 | Regional Situation Graph – vazby mezi letadly | Pouze skupinový |  |
| D10 | Operational Attention – regionální upozornění | Pouze skupinový |  |
| D11 | Regional Focus Queue – pořadí prioritních letadel | Pouze skupinový |  |
| D12 | Regionální projekce za 5/15/30 minut | Pouze skupinový |  |
| D13 | Validace koridoru proti pozdějším pozicím | Pouze skupinový |  |
| D14 | Validace predikovaných událostí | Pouze skupinový |  |
| D15 | Truth-first Validation – vyhodnocování podle skutečných událostí | Pouze skupinový |  |
| D16 | Ukládání anonymních výsledků kalibrace | Pouze skupinový |  |
| D17 | Regional Attention Outcome – kontrola regionálních predikcí | Pouze skupinový |  |
| D18 | Regional Attention Graduation – pravidla povýšení modelu | Pouze skupinový |  |
| D19 | Trajectory Quality V2 – alternativní vertikální model | Pouze skupinový |  |
| D20 | Trajectory Quality V3 – výkonově orientovaný shadow model | Pouze skupinový |  |
| D21 | Outcome Validation pro modely V2 a V3 | Pouze skupinový |  |
| D22 | Graduation/Promotion – výběr schváleného modelu | Pouze skupinový |  |
| D23 | Admin Calibration Center – diagnostika modelů | Pouze skupinový |  |
| L01 | Watchlist – pravidla sledování | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L02 | Hlídání ICAO, registrace, callsignu, typu a aerolinky | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L03 | Upozornění podle vzdálenosti od přijímače | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L04 | Fleet Explorer – vlastní sledované flotily | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L05 | Geofencing – vlastní sledované geografické oblasti | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L06 | Emergency squawk 7500/7600/7700 | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L07 | Historie upozornění a událostí | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L08 | Pravidla cooldownu a odstranění duplicit | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L09 | Notification Center – přijaté/nepřečtené zprávy | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L10 | Ztlumení oznámení pro letadlo nebo pravidlo | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L13 | Delivery Health – stav doručování zpráv | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L14 | Alert Rule Simulator – testování pravidel | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L15 | Alert Effectiveness Analytics – účinnost upozornění | Pouze skupinový | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| E08 | ACARS H1/FPN waypointy a mapová vrstva | Výslovná zmínka o odstranění | `lib/server/enrichment-cache.ts`, `app/api/aircraft/[hex]/communications/route.ts` |

Původní názvy nejsou mapováním na implementační soubory. Samostatně kontrolovat odstraněné API/stránky a sdílené závislosti, které musí zůstat.


Kanonický zdroj všech názvů KEEP/REMOVE: `docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json`. Přesné názvy uživatele mají přednost před starší rekonstrukcí.
