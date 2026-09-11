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

The output keeps both the published designator (`TRA36`) and the canonical Czech designator (`LKTRA36`) so the map can join plan/activity data to imported ATC geometry without changing the static ATC import contract.

## Live map semantics

The MapLibre ATC layer joins planned AUP/UUP windows to Czech `TRA`/`TSA` geometry by canonical designator. The plan is visual context layered on top of the existing ATC geometry; it does not mutate the static ATC activation contract.

- a window containing the current UTC time is rendered as **planned now** with an amber emphasis;
- the nearest future window is rendered as **planned later** with a subtler blue emphasis;
- areas without a matching plan keep the normal ATC styling;
- stale API data keeps its stale provenance and is explicitly labelled as such;
- the ATC popup keeps `activationStatus` independent from AUP/UUP and adds a separate plan section with UTC times, vertical limits, source and sequence;
- `planned now` is never rendered as confirmed `ACTIVE`;
- delayed `historicalActual` records are intentionally excluded from the live map and are reserved for History/Replay.

The browser requests `/api/airspace/activity` only when the ATC layer is first enabled. There is no browser polling loop. Map state is recalculated from the cached plan during ordinary radar snapshot renders, so a plan window can naturally cross from upcoming to planned-now or expire without another network request.

## Runtime boundaries

This integration is independent from the live ADS-B/OGN paths:

- no additional background poller;
- no additional SSE connection;
- no PostgreSQL table, schema change, index or migration;
- no PostgreSQL read/write path for airspace activity;
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
