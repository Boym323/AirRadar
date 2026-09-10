# Slovak ATC / eAIP sync

AirRadar can import a conservative subset of published Slovak ATS airspace from the official LPS SR AIM eAIP ENR 2.1 publication.

## Source

The sync only accepts HTTPS documents from `aim.lps.sk` under the official eAIP tree. It derives AIRAC directory candidates from the 28-day cycle, tries the current cycle first, and keeps a bounded previous-cycle fallback for publication naming differences. The running AirRadar service never contacts LPS AIM; the source is fetched only by the operator sync command.

The imported source name is `Slovak eAIP`. Each persisted sector keeps the exact source URL, effective date and verification timestamp, uses `country = SK`, and shares the existing `AtcSector` schema and resolver with Czech data.

## Geometry policy

The v1 adapter is intentionally fail-closed.

- Explicit coordinate polygons from ENR 2.1 are accepted when the normal ATC import validator accepts them.
- A published `along state boundary` segment is accepted only when the injected authoritative boundary provider can resolve both published endpoints within its production tolerance. The sync currently uses the existing ČÚZK Data50 provider, so this is suitable only for Czech-Slovak boundary segments that actually snap to that authoritative Czech national-border geometry.
- Slovak boundaries with Poland, Austria, Hungary or Ukraine are not approximated. Those rows remain source-limited until an authoritative provider for that boundary is implemented and reviewed.
- A generic `circular arc` is not imported unless its direction can be represented unambiguously. No straight chord or guessed clockwise/counter-clockwise fallback is permitted.
- There is no community-data or generalized GISCO fallback for production geometry.

The apply command also refuses to automatically obsolete any previously imported `Slovak eAIP` sector that disappears from the current persistable parse. An actual AIP deletion/rename therefore requires explicit review and cannot be confused with an upstream markup, parser or boundary-provider regression.

## Frequencies and semantics

Only supported civil VHF ATC voice frequencies in the existing AirRadar frequency policy are imported. The parser preserves the published ATC unit/callsign when present and never creates transmitter locations because ENR 2.1 does not establish an authoritative transmitter-site position.

Published airspace is not operational activation data. The existing runtime model continues to expose imported sectors with `activationStatus = UNKNOWN` unless a separate authoritative operational feed is implemented later. Likewise, the existing aircraft-to-sector resolver means only that an aircraft position/altitude geometrically matches a published sector; it must never be presented as proof that the aircraft is communicating on a listed frequency.

The current database schema does not have a dedicated airspace-class column. The adapter therefore preserves the exact published sector name and does not append class C/D/etc. to the name. Adding class as a first-class field would require a separately reviewed schema change.

## Commands

Preview the current official publication without applying database changes:

```bash
npm run atc:sync:sk -- --dry-run
```

Review current publication versus stored Slovak rows:

```bash
npm run atc:status:sk
```

Apply only after reviewing the dry-run output:

```bash
npm run atc:sync:sk
```

The sync uses the existing transactional ATC importer. It does not modify aircraft history and requires no Prisma migration or PostgreSQL schema change.

## Expected v1 coverage

The adapter has regression anchors for explicit-geometry sectors including `KOŠICE TMA 1A`, `PIEŠŤANY TMA 2`, `POPRAD TMA 1`, `POPRAD TMA 2` and `ŽILINA TMA 3`. A production apply fails before any database write if one of these anchors disappears from the current parse.

Additional rows are imported when their geometry and frequencies meet the same rules. Rows requiring unsupported state-border geometry or ambiguous arcs are reported as source-limited/skipped rather than guessed.
