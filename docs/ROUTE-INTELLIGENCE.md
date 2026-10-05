# Route Intelligence

Route Intelligence compares route metadata already attached to a live aircraft
with the published Czech ATS route document. It is an interpretation of
available aircraft route metadata against the published ATS network. It is not
an ATC clearance and must not be interpreted as current operational airway
availability.

The forward-compatible V2 domain contracts are documented in
[ROUTE-INTELLIGENCE-V2-CONTRACTS.md](ROUTE-INTELLIGENCE-V2-CONTRACTS.md).
Selected-aircraft conformance and probable-direct inference are documented in
[TRAJECTORY-CONFORMANCE.md](TRAJECTORY-CONFORMANCE.md).

## Sources and boundaries

The aircraft side uses the existing enrichment only:

- `FlightPlan.filedRoute`, when present;
- `FlightPlan.waypoints`, as the fallback when no filed route text exists;
- the existing provider source (`FlightAware`, `ADSBDB`, demo, or another
  configured source).

The authoritative ATS side uses the file-backed `lib/ats/cz-routes.ts`
document, including its effective date, route designators, points, segments,
and explicit discontinuities. Route Intelligence does not write to PostgreSQL.

Route Corridor Intelligence V1 may additionally use the existing server-side
Aviation Weather Center navigation provider for bounded exact NAVAID/FIX
identifier lookups while one aircraft is selected. Those reference coordinates
can resolve filed or DCT connector endpoints only. They never replace published
ATS or procedure geometry, and their provenance remains explicit.

## Tokenizer and matching

The tokenizer recognizes `WAYPOINT`, `AIRWAY`, `DCT`, and `UNKNOWN`. An airway
is identified by a published ATS designator or the conservative airway syntax
used by the project. Common letter-only fix/navaid names are accepted as
waypoint candidates; unsupported syntax stays unresolved. An airway token is
never treated as a waypoint.

Waypoint matching requires an exact uppercase name. Duplicate names are not
resolved by taking the first result: route context must resolve the candidate or
the leg remains unresolved.

An explicit airway designator permits bounded graph traversal only within that
published route designator. Traversal uses existing published segments, avoids
loops, and stops at discontinuities. A direct leg is not replaced with an
unfiled airway path. `DCT` is a direct leg and is excluded from ATS coverage.
Reverse traversal of a published segment is supported and retains the filed
route direction.

## Dynamic position

Static route analysis is cached in a bounded in-memory cache by route shape,
route tokens, and ATS effective date. Live position updates only calculate
segment proximity, along-track progress, heading compatibility, next-waypoint
distance, and cross-track deviation.

Cross-track distance uses spherical great-circle geometry, not a latitude /
longitude degree approximation. The default maximum cross-track threshold is
`25 NM`; it can be overridden with
`ROUTE_INTELLIGENCE_MAX_XTRACK_NM` server-side or
`NEXT_PUBLIC_ROUTE_INTELLIGENCE_MAX_XTRACK_NM` for the browser calculation.
Outside the threshold, no current ATS segment is asserted. Heading is only a
confidence/ordering factor and never the sole matching condition.

## Coverage and statuses

Coverage is:

```text
matched ATS-eligible route legs / ATS-eligible route legs × 100
```

Airport tokens, explicit DCT legs, and unsupported syntax are not counted as
failed ATS legs. A multi-segment traversal on one filed airway leg counts as
one eligible leg. `MATCHED` means every eligible leg was confidently mapped;
`PARTIAL` means only some were mapped; `UNRESOLVED` means no ATS segment was
confidently mapped. Missing route data returns `NO_ROUTE`; a missing ATS
document returns `NO_ATS_DATA`.

The progress view is ordered by the filed route: completed segments, the
current segment, and remaining segments. A segment is not marked completed
merely because it is the nearest segment; completion requires geometric
progress past its endpoint within the same threshold.

## Availability and limitations

ATS `availabilityStatus` remains `UNKNOWN`. Route Intelligence does not infer
live CDR availability, NOTAM closures, SID/STAR procedures, runway assignment,
ATC clearance, trajectory, or operational activation. International portions
outside the loaded published ATS data remain unresolved unless both filed
connector endpoints can be resolved uniquely from the bounded reference-point
lookup. Such fallback geometry is explicitly `FILED_ROUTE` / `SCHEMATIC`,
not published ATS geometry. The displayed aircraft route source, ATS
source/effective date, and reference provenance remain separate.

Terminal procedures are a separate static ingestion boundary. `lib/procedures`
consumes the shared `Procedure` contracts, and `npm run procedures:sync` produces
the validated local artifact used by the runtime repository and bounded
`/api/procedures` lookups. Aircraft display code never fetches an eAIP source.

The selected-aircraft flow loads only origin SID and destination STAR sets
through the bounded procedure API. Static V2 analysis uses a 128-entry cache
keyed by route, airport context, ATS effective date, procedure identity/version,
and relevant runway context. Dynamic analysis then uses the current position,
track, and altitude without rebuilding the static route. Missing procedures,
ATS data, or runway context produce explicit degraded states.

## Route Corridor Intelligence V1

Route Corridor Intelligence is an additive selected-aircraft projection over
the existing Route Intelligence V2 route and dynamic state. It does not create
a second route authority or live aircraft stream.

When a selected aircraft has a filed route, the browser extracts at most 24
candidate waypoint identifiers and performs one bounded request through the
existing same-origin `/api/navigation/data?ids=...` endpoint. The server
splits that set into batches of at most eight identifiers and reuses the
existing AWC cache, in-flight coalescing and upstream request budget. There is
no timer, background poller, database write, or additional EventSource.

Published ATS and SID/STAR geometry always has priority. If a filed leg cannot
be reconstructed from the published ATS network but both endpoint identifiers
resolve uniquely through the reference dataset, V1 may draw a schematic
`FILED_ROUTE` connector between those points. Ambiguous or coordinate-less
matches remain unresolved.

The corridor projection reuses the V2 great-circle dynamic engine and exposes
route progress, next fix, groundspeed-based ETA, remaining resolved-route
distance, cross-track deviation, expected segment track, observed-track
difference, and reconstruction confidence. Remaining distance is explicitly
marked partial whenever unresolved route geometry remains.

The live map renders reconstructed geometry as completed, current and remaining
segments. If no usable reconstructed corridor exists, the established
origin-current-destination visualization remains the fallback.

`DEVIATING` is deliberately hysteretic. Cross-track deviation above 10 NM must
be present in three distinct observations spanning at least 10 seconds before
the state is published. Recovery requires two observations spanning at least
five seconds. A single excursion is only `OFFSET`. These are product display
thresholds, not navigation limits or an ATC/safety determination.

V1 is display/on-demand intelligence only. It does not persist route deviation
events into Flight Intelligence and does not claim ATC clearance, certified
navigation guidance, or operational route conformance.
