# Czech ATS routes (ENR 3.2)

AirRadar v1.5A prepares a validated, file-backed Czech ATS route dataset from the
official AIM ŘLP ČR eAIP ENR 3.2 page. It does not write PostgreSQL and it does
not claim that a published route segment is currently active.

Official source:

- `https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-3.2-en-GB.html`

## Commands

```bash
npm run ats:sync:cz -- --dry-run
npm run ats:sync:cz
npm run ats:status:cz
```

The default generated file is:

```text
data/ats/generated/cz-routes.json
```

Override it with `ATS_CZ_ROUTES_PATH`.

The sync fetches ENR 3.2 and the current Czech publication record, parses the
machine-readable eAIP/AIXM annotations, validates the result, then replaces the
existing JSON atomically. A failed fetch, parse, publication-date check, or
geometry-distance check leaves the previous dataset unchanged.

## Parsed data

Each route retains:

- route designator and stable eAIP source identifier;
- significant points and their authoritative published coordinates;
- designated-point versus navaid identity;
- foreign EAD-maintainer marker (`*ED`, `*EP`, `*LO`, `*LZ`);
- segment MAG tracks, GEO DIST, RNAV accuracy, vertical limits and IFR cruising
  direction;
- CDR1/CDR2/CDR3 publication metadata when present;
- airway discontinuations;
- human-readable route/segment remarks that are relevant to the published row.

The parser associates a segment only with the significant points immediately
before and after that segment row. `AWY discontinuation` explicitly breaks that
chain. Structured route identifiers mentioned inside remarks (for example a
published permanent alternate route) are references only and are not parsed as
new route headers.

## Safety semantics

`availabilityStatus` is always `UNKNOWN` in this dataset. ENR 3.2 is a
publication source, not a real-time route-availability feed. CDR metadata such
as `CDR1 H24` is retained as published metadata, but AirRadar must not convert
that alone into a live `ACTIVE` state.

As an additional parser guard, each published GEO DIST is compared with the
great-circle distance calculated from the two published endpoint coordinates.
A material mismatch fails the sync instead of emitting guessed geometry.

This phase intentionally adds no map layer or public API. Those belong to
v1.5B, which can consume this file without changing the PostgreSQL schema.
