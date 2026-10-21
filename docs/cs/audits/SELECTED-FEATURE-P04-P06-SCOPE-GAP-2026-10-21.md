# P04 / P05 / P06 — konflikt odstraněných analýz se zachovanou trasou R11 (21. 10. 2026)

**Blokující nález.** Podle přesného seznamu uživatele jsou P04, P05 a P06 určeny k odstranění, zatímco R11 — *zobrazení trasy mezi letišti a jejího průběhu* — musí zůstat. Předchozí audit tento rozdíl nedokázal úplně rozlišit, protože funkce sdílejí mapu a dříve chyběly přesné názvy.

## P04 — Route Intelligence – interpretace letového plánu

**Stav:** `SHARED_OWNERSHIP_REVIEW`.

analyzePublishedRoute is invoked while rendering retained R11 route geometry.

**Zdroj:** `components/radar/use-route-corridor-intelligence.ts:130-149`, `lib/route-intelligence/index.ts`.

**Nápravný krok:** Separate minimum published route reconstruction needed by R11 from independent rejected predictive/interpretative extras. Do not remove core route geometry.

## P05 — Route Corridor Intelligence – odchylka od plánované trasy

**Stav:** `LIVE_DESELECTED_ANALYTICS`.

buildRouteCorridorIntelligence actively computes corridor deviation/status and presents analytic labels. The user selected REMOVE P05 but KEEP R11 route display.

**Zdroj:** `components/radar/use-route-corridor-intelligence.ts:151-161`, `components/aircraft-radar-quick-detail.tsx:222-249`.

**Nápravný krok:** Remove P05 deviation inference and excess status UI, retaining straightforward published route and optional position/progress needed by R11.

## P06 — Trajectory Conformance – odklon, návrat a pravděpodobné DCT

**Stav:** `ACTIVE_DESELECTED_RUNTIME`.

buildTrajectoryConformance still computes in the active selected-aircraft hook and is displayed in radar drawer and Follow HUD; feature registry lists Trajectory Conformance as production. P06 is REMOVE.

**Zdroj:** `components/radar/use-route-corridor-intelligence.ts:163-175`, `components/aircraft-radar-quick-detail.tsx:240-248`, `components/radar/radar-flight-follow-hud.tsx:43-77`, `lib/route-intelligence/conformance.ts`, `docs/features.registry.json:185`.

**Nápravný krok:** Disconnect and remove P06 hook computation, consumers, registry entry, now-orphan source and corresponding obsolete tests, preserving R11 route rendering and selected-weather safety displays.

## Akceptace opravy

Po úpravě musí fungovat mapa publikované ATS trasy R11 a základní průběh letu. Výpočet a zobrazení P06 se musí vypnout, stejně jako nadbytečné analytické klasifikace P05. Pro R11 zachovat nezbytné zpracování letového plánu, ale neponechávat samostatné analytiky P04. Upravit registr funkcí i EN/CS dokumentaci, odstranit zastaralé conformance testy, doplnit negativní regresní testy a pustit TypeScript, Vitest, browser CI, CodeQL a zátěž 1×/2×/4×.

**Aktuální stav:** IMPLEMENTACE JEŠTĚ NEOPRAVENA. Draft PR #1096 nemergovat pouze na základě předchozího zeleného CI; jde o rozpor se zadáním, nikoli o chybu, kterou stávající testy odhalí.


## Oprava zdrojového kódu (čeká na závěrečné CI)

Samostatné moduly P05 `lib/route-intelligence/corridor.ts` a P06 `lib/route-intelligence/conformance.ts` byly smazány. Dřívější mapový hook s odvozováním odchylek byl nahrazen menším `components/radar/use-selected-route.ts`, který zachovává R11: publikovanou geometrii trasy, další bod a dostupný procentní průběh letu. Drawer a Follow HUD již neukazují analytické odchylky P05 ani stavy návratu/pravděpodobného DCT P06. Odstraněny exporty, zastaralé testy i položka produkčního registru. Nové regresní testy brání návratu P05/P06 do živé mapy. Základní parsování P04 nutné pro R11 zůstává. Jde o opravu ve zdrojovém kódu: před merge ověřit závěrečné CI a živé R11 chování. Produkce se nemění.
