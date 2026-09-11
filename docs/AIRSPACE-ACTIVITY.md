# Czech airspace activity

AirRadar exposes Czech planned airspace allocation and delayed historical actual activations through `GET /api/airspace/activity`.

## Source separation

The integration deliberately keeps two concepts separate:

- **AUP/UUP plan** (`https://aup.rlp.cz/`) describes the current published allocation plan for an AUP period. A UUP can cancel or change AUP items. A clock that is currently inside an AUP/UUP window is exposed only as `plannedNow`; it is **not** evidence that the area is operationally active at that moment.
- **Actual activations** (`https://aim.rlp.cz/?lang=cz&p=act-area`) are official ANS CR historical records. AIM documents them as actual activation/deactivation times from ANS CR systems, but normally publishes the daily JSON files with a 1–2 day delay. AirRadar therefore exposes these records as `historicalActual` and never as a live state.

For operational real-time status, users must verify the appropriate ATS/FIC source.

## Time model

AUP publication periods run from 06:00 UTC through 06:00 UTC the following day. Row times before 06:00 belong to the following UTC calendar day. All timestamps returned by the API are normalized to ISO 8601 UTC.

## UUP application

AUP list-C rows are keyed by their published sequence number. UUP list-C rows are applied in publication order:

- `CNL` removes the corresponding AUP item;
- another UUP row replaces the same sequence number with its updated vertical/time window;
- unchanged AUP rows remain in the plan.

The output keeps both the published designator (`TRA36`) and the canonical Czech designator (`LKTRA36`) so a later map layer can join plan/activity data to imported ATC geometry without changing the static ATC import contract.

## Runtime boundaries

This integration is independent from the live ADS-B/OGN paths:

- no additional background poller;
- no SSE connection;
- no PostgreSQL table or migration;
- no `FlightPosition` access;
- HTTPS fetches are restricted to `aup.rlp.cz` and `aim.rlp.cz`;
- source bodies are bounded to 512 KiB and requests time out after 8 seconds;
- AUP/UUP is cached in RAM for 5 minutes, actual activation history for 30 minutes;
- a transient source failure returns a bounded stale last-known-good snapshot when available;
- source failures never affect `readsb → RAM → SSE`.

## API semantics

`planned.status` and `historicalActual.status` are independent and can be `ok`, `stale`, or `unavailable`.

`planned.windows[].plannedNow` means only that the current UTC time lies within the latest resolved AUP/UUP plan window. It must never be labelled as confirmed `ACTIVE`.

`historicalActual.delayed` is always `true` to make the publication delay explicit to API consumers.

The first version is intentionally an API/data-contract slice. A subsequent map/UI slice can join `canonicalDesignator` to Czech airspace geometry and render planned and historical states with distinct visual language.
