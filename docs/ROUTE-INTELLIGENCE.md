# Route Intelligence

Route Intelligence compares route metadata already attached to a live aircraft
with the published Czech ATS route document. It is an interpretation of
available aircraft route metadata against the published ATS network. It is not
an ATC clearance and must not be interpreted as current operational airway
availability.

## Sources and boundaries

The aircraft side uses the existing enrichment only:

- `FlightPlan.filedRoute`, when present;
- `FlightPlan.waypoints`, as the fallback when no filed route text exists;
- the existing provider source (`FlightAware`, `ADSBDB`, demo, or another
  configured source).

The ATS side uses the file-backed `lib/ats/cz-routes.ts` document, including its
effective date, route designators, points, segments, and explicit
discontinuities. No provider is polled by Route Intelligence, and it does not
write to PostgreSQL.

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
outside the loaded Czech ATS document remain unresolved gaps. The displayed
aircraft route source and ATS source/effective date remain separate provenance
fields.

