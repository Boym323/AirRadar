# Flight Story V1

Flight Story is the read-only `/flights/[id]` experience. It combines the
persisted `Flight`, bounded `FlightPosition` samples, and `FlightEvent` rows in
one server read model exposed by `getFlightStory()`.

The playback timestamp is the single master value for the map marker, profile
cursor, timeline selection, and event seek. It reuses existing history
interpolation and publishes historical time through `MapTimeController`; it
never starts intelligence detection, alerts, or notifications. URL state
accepts `?at=` and clamps valid values to the stored position range.

Positions and events are ordered chronologically. If positions exceed the
bounded payload limit, deterministic full-span sampling preserves the first,
last, evenly distributed samples, and the nearest sample for each event.
`positionSampling` reports original and returned counts. Event DTOs contain
only safe explicit fields; evidence and metadata JSON stay private.

Events are linked only through persisted `FlightEvent.flightId`. Events without
coordinates remain in the timeline and do not receive fabricated map markers.
Persisted origin/destination is shown only as route context; no new historical
flight-plan request is made. Historical radar, METAR, wind, and AUP/UUP are
resolved through Map Context V2 at the same playback instant.

Partial data is supported: metadata and empty states remain usable without
positions, events, route data, or historical context. V1 does not infer
airports, runways, route phases, or weather causality.
