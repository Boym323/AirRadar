# Time Machine V1

Time Machine is a separate historical radar context at `/time-machine`. It
reconstructs all persisted receiver observations in a bounded UTC window and
does not create a second history store.

## Architecture and API

`FlightPosition` is the source of aircraft positions; `Flight` and `Aircraft`
provide durable identity/context; `FlightEvent` provides read-only intelligence
markers. `/api/time-machine/range` reports the actual persisted min/max
timestamps. `/api/time-machine/window` accepts UTC `from`/`to` parameters and
limits each request to five minutes, 40,000 positions, 500 aircraft, and 200
events. Responses are safe DTOs and use `no-store` caching.

## Playback model

The browser holds one bounded window. Positions are interpolated only across
gaps up to 30 seconds; track interpolation uses the shortest 0/360-degree
path. An aircraft is hidden before its first observation, across a large gap,
or more than 45 seconds after its last observation. Playback is deterministic
at 1×, 5×, 10×, and 30×. Seek cancels/invalidates stale window responses.

## Events and context

Flight Intelligence events are read-only markers. Clicking one seeks to its
`occurredAt` and selects its aircraft where available. Selection shows durable
identity, flight context, current historical values, a five-minute historical
trail, and a link to the captured Flight detail.

The map uses isolated MapLibre source/layer names beginning with
`time-machine-`; it does not share live markers or trails. No historical
weather, NOTAM, dynamic airspace, or per-frame Route Intelligence is inferred.

## Retention and future boundary

Availability follows actual `FlightPosition` retention, not a hardcoded number
of days. All API instants are explicit UTC ISO timestamps; UI formatting uses
the existing AirRadar locale/timezone policy. The repository/service boundary
is intentionally suitable for a future PostgreSQL plus cold-archive source and
for Flight Story V1. Time Machine remains read-only and database failure is
isolated from live ingest and SSE.
