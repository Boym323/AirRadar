# Selected-feature original name and source witnesses

All 90 REMOVE titles are restored from the user's original selection (2026-10-19T19:01:21Z). Per-ID implementation removal **not yet certified** for 82 group-level cases.

| ID | Original user title (REMOVE) | Implementation proof | Family code witnesses |
|---|---|---|---|
| J10 | Demo provoz se simulovanými letadly | Explicit retirement note | `lib/server/providers.ts`, `lib/server/aircraft-state.ts`, `lib/server/history.ts` |
| R13 | Poloha přijímače, kružnice dosahu a měřítko | Explicit retirement note | `components/airradar-app.tsx`, `lib/radar/airspace-geojson.ts`, `app/api/stream/route.ts` |
| H01 | Samostatný detail letadla – registrace, typ, operátor | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H02 | Katalog a automatické doplňování metadat letadel | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H04 | Letový plán, volací znak a letiště OD/DO | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H05 | Historie konkrétního letadla a jeho letů | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H06 | Detail jednotlivého letu (Flight Story V2) | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H08 | Historické přehrávání konkrétního letu | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H09 | Seznam a vyhledávání historických letů | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H10 | Porovnání dvou letů | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H11 | Time Machine – přehrávání všech letadel v čase | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H12 | Event Replay – ±10 minut kolem události | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| H13 | Historická identita NEW / RARE / RETURNING | Family only | `app/aircraft/[hex]/page.tsx`, `app/api/history/[hex]/route.ts`, `lib/server/history.ts` |
| A03 | Airport Live Board – přehled provozu letiště | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A04 | Odvozené přílety, odlety a průlety | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A05 | Vyhodnocení použitých přistávacích drah | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A06 | Arrival Sequence / Approach Queue | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A07 | Arrival Flow, vytížení a stabilita drah (V8) | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A08 | Odhad terminálové poptávky / příletů (V9) | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A09 | Provozní výjimky a konfliktní údaje letiště | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A10 | Live Airport Network – okolní aktivní letiště | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A11 | Porovnání letišť | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| A12 | Historická statistika provozu letiště za 7/30 dní | Family only | `app/airports/page.tsx`, `app/airports/[icao]/page.tsx`, `app/api/airports/[icao]/route.ts` |
| T01 | ATC sektory včetně geometrie a výškových hranic | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T02 | Samostatný detail ATC sektoru | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T03 | ATC frekvence, vysílače a publikované služby | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T04 | Pravděpodobné ATC přiřazení vybraného letadla | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T05 | ATC handoff – odhad přechodu mezi sektory | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T06 | Historie provozu a přechodů mezi sektory – API | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T07 | Validace a diagnostika ATC dat | Family only | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T11 | Letové procedury SID/STAR a procedurální data | Explicit retirement note | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| T12 | AUP/UUP – plánovaná aktivace vzdušného prostoru | Explicit retirement note | `app/api/atc/sectors/route.ts`, `app/api/ats/routes/route.ts`, `app/api/navigation/data/route.ts` |
| W05 | Model větru ICON-EU v různých letových hladinách | Family only | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W10 | Weather Fusion – spojení více zdrojů počasí | Explicit retirement note | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W11 | Weather Avoidance – vyhodnocení možné odchylky kvůli počasí | Explicit retirement note | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W12 | Počasí na trase zvoleného letu | Explicit retirement note | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W13 | Historické mapové počasí v Time Machine | Family only | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| W14 | Weather Corridor – počasí v předpokládaném koridoru | Family only | `app/weather/page.tsx`, `app/api/weather/metar-map/route.ts`, `app/api/weather/sigmet/route.ts` |
| P01 | Flight Intelligence – automatické události | Family only |  |
| P02 | Rozpoznávání holding, go-around, diversion, orbit a neobvyklých zatáček | Family only |  |
| P03 | Přehled událostí a analytická stránka | Family only |  |
| P04 | Route Intelligence – interpretace letového plánu | Family only |  |
| P05 | Route Corridor Intelligence – odchylka od plánované trasy | Family only |  |
| P06 | Trajectory Conformance – odklon, návrat a pravděpodobné DCT | Family only |  |
| P07 | Predikce času příletu ETA | Family only |  |
| P08 | Predikce přistávací dráhy | Family only |  |
| P09 | Predikce změny přistávací dráhy | Family only |  |
| P10 | Predikce budoucí trajektorie | Family only |  |
| P11 | Explainable Prediction – vysvětlení podkladů predikcí | Family only |  |
| P12 | Prospektivní sběr a validace predikcí | Family only |  |
| P13 | Readiness a pravidla pro zveřejnění predikcí | Family only |  |
| P14 | Kalibrace a porovnání predikcí s výsledky | Family only |  |
| P15 | Predictive Operations Center – souhrn předpovědí | Family only |  |
| D01 | Digital Twin – základní projekce letu na 30 minut | Family only |  |
| D02 | 4D koridor – budoucí poloha, výška a čas | Family only |  |
| D03 | Prediction Timeline v detailu letadla | Family only |  |
| D04 | Budoucí průniky ATC sektorů a ATS tras | Family only |  |
| D05 | Průniky s plánovanými AUP/UUP prostory | Family only |  |
| D06 | Průniky s Navigation Integrity anomáliemi | Family only |  |
| D07 | Operational Focus – prioritní situace letadla | Family only |  |
| D08 | Operational Focus Change – změny priorit | Family only |  |
| D09 | Regional Situation Graph – vazby mezi letadly | Family only |  |
| D10 | Operational Attention – regionální upozornění | Family only |  |
| D11 | Regional Focus Queue – pořadí prioritních letadel | Family only |  |
| D12 | Regionální projekce za 5/15/30 minut | Family only |  |
| D13 | Validace koridoru proti pozdějším pozicím | Family only |  |
| D14 | Validace predikovaných událostí | Family only |  |
| D15 | Truth-first Validation – vyhodnocování podle skutečných událostí | Family only |  |
| D16 | Ukládání anonymních výsledků kalibrace | Family only |  |
| D17 | Regional Attention Outcome – kontrola regionálních predikcí | Family only |  |
| D18 | Regional Attention Graduation – pravidla povýšení modelu | Family only |  |
| D19 | Trajectory Quality V2 – alternativní vertikální model | Family only |  |
| D20 | Trajectory Quality V3 – výkonově orientovaný shadow model | Family only |  |
| D21 | Outcome Validation pro modely V2 a V3 | Family only |  |
| D22 | Graduation/Promotion – výběr schváleného modelu | Family only |  |
| D23 | Admin Calibration Center – diagnostika modelů | Family only |  |
| L01 | Watchlist – pravidla sledování | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L02 | Hlídání ICAO, registrace, callsignu, typu a aerolinky | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L03 | Upozornění podle vzdálenosti od přijímače | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L04 | Fleet Explorer – vlastní sledované flotily | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L05 | Geofencing – vlastní sledované geografické oblasti | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L06 | Emergency squawk 7500/7600/7700 | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L07 | Historie upozornění a událostí | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L08 | Pravidla cooldownu a odstranění duplicit | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L09 | Notification Center – přijaté/nepřečtené zprávy | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L10 | Ztlumení oznámení pro letadlo nebo pravidlo | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L13 | Delivery Health – stav doručování zpráv | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L14 | Alert Rule Simulator – testování pravidel | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| L15 | Alert Effectiveness Analytics – účinnost upozornění | Family only | `lib/server/alert-delivery-worker.ts`, `app/api/push/subscribe/route.ts` |
| E08 | ACARS H1/FPN waypointy a mapová vrstva | Explicit retirement note | `lib/server/enrichment-cache.ts`, `app/api/aircraft/[hex]/communications/route.ts` |

Original names are not source path mappings. See the complete historical removed routes and per-family retained dependency tests for verification.


Canonical complete KEEP/REMOVE name source: `docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json`. The exact user titles supersede any earlier reconstruction.
