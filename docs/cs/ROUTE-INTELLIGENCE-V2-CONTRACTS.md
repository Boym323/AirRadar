# Kontrakty Route Intelligence V2

Tento dokument definuje sdílené TypeScript hranice pro plánovanou pipeline
route intelligence:

```text
procedure data → static route engine → InterpretedRoute
               → dynamic route intelligence → UI/view DTO
```

Zdrojem pravdy je
[`lib/route-intelligence/contracts.ts`](../../lib/route-intelligence/contracts.ts).
Veřejná hranice `lib/route-intelligence` tyto typy re-exportuje. Budoucí
agenti mají importovat kontrakty z této hranice a nesmějí lokálně znovu
definovat `Procedure`, `InterpretedRoute`, `RunwayContext`,
`DynamicRouteState` ani view DTO.

## Vlastnictví a hranice

- Procedure ingestion vlastní `Procedure`, `ProcedureLeg`, `ProcedurePoint`,
  `ProcedureSource`, runway applicability a publication metadata. Geometrie
  může být null pro každý leg. Discontinuity je explicitní data, nikoli
  odvozená čára. Počáteční implementace je v `lib/procedures`; její
  generovaný dataset čte `ProcedureRepository` a runtime aircraft display
  cesta jej nikdy neplní.
- Static engine vlastní `InterpretedRoute`, jeho seřazené
  `InterpretedRouteElement[]`, procedure matches a provenienci elementů.
  Published SID/STAR/ATS, filed DCT, filed route text, schematic legs a
  unresolved connectors mají odlišné source kinds.
- Dynamic intelligence vlastní `DynamicRouteState`. Smí aktualizovat hodnoty
  založené na pozici bez mutace statických route elements nebo jejich provenience.
- UI konzumuje `RouteIntelligenceViewDTO` / `PublicRouteIntelligenceDTO`,
  nikoli parser output nebo provider-specific enrichment objects.
- `RunwayContext` je sdílená input/output hranice. Reported a inferred runway
  hodnoty jsou oddělené; `conflict` se zachová, pokud jsou přítomny obě a liší se.

## Invarianty

- `DCT` je reprezentováno `FILED_DCT`; nikdy není `PUBLISHED_ATS`.
- Každý interpreted element má `RouteElementSource`; provenienci nelze po
  vytvoření elementu obnovovat z globálního route source.
- Chybějící procedure geometry je platná a musí zůstat null.
- Discontinuity musí zůstat reprezentovatelná bez vymýšlení connectoru.
  Unresolved connector nebo schematic element je explicitní a není tvrzením
  publikovaného ATS.
- Procedure matching zachovává status, candidate count, ambiguity, evidence,
  confidence a runway compatibility. `UNRESOLVED` je významný stav.
- ATS coverage, route reconstruction coverage a route progress jsou oddělené
  pojmenované metriky. Nesmějí se používat zaměnitelně.
- Vzdálenosti v `DynamicRouteState` jsou námořní míle. `routeProgress` je
  normalizovaný zlomek nebo null, pokud jej nelze vypočítat.
- `RouteIntelligenceResult` zůstává aktuálním V1-compatible engine/UI
  kontraktem. Jeho existující pole `currentSegment`, `previousWaypoint`,
  `nextWaypoint`, `distanceToNextWaypointNm` a
  `crossTrackDeviationNm` se záměrně nepřejmenovávají ani neodstraňují.
  Volitelné pole `v2` je migrační seam pro pozdější adapter/engine implementaci.

## Pokyny pro paralelní práci

Agenti implementující ingestion smějí plnit pouze procedure contracts. Agenti
implementující matching mají produkovat `InterpretedRoute` a
`ProcedureMatch` bez změny provider nebo UI types. Agenti implementující
dynamické chování mají konzumovat static route a vracet `DynamicRouteState`.
UI práce má mapovat domain model na `RouteIntelligenceViewDTO`; nemá importovat
`FlightPlan`, struktury provider parseru ani databázové řádky jako svůj route model.

Existující typy ATS dokumentu v `lib/ats/cz-routes.ts` zůstávají aktuální
hranicí publikovaného ATS datasetu. Jsou input data pro static engine, nikoli
V2 procedure contract, a nemají se rozšiřovat do SID/STAR sémantiky.

Procedure contract má jedno backward-compatible rozšíření oproti původnímu
tvaru Agent A: volitelné `Procedure.remarks` zachovává publikované
procedure-level poznámky, které nelze připojit k legu. Existující producers
zůstávají platní, protože pole je optional; procedure parser jej plní, pokud
oficiální zdroj takový text poskytuje.
