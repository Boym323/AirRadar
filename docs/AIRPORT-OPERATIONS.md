# Airport Operations V2

Airport Operations is an observational intelligence layer over the existing
airport, sampled-position, runway, METAR, and Flight Intelligence paths. It
does not represent an ATC clearance or a complete airport movement log.

## Provenance and confidence

Coordinates, timestamps, altitude, speed, track, vertical rate, runway source
data, and METAR are observed. `APPROACH`, `LANDING`, `TAKEOFF`, `DEPARTURE`,
`GO_AROUND`, `HOLDING`, and `OVERFLIGHT` are bounded inferences. Every result
contains evidence and `low`, `medium`, or `high` confidence. A likely runway
requires threshold geometry and track evidence; wind alone cannot produce a
high-confidence result. Ambiguous parallel runways remain unresolved.

## Classification

The classifier uses at least three valid time-ordered positions, a 45 km query
envelope, a 22 km airport radius, and an 8 km threshold radius. Descending
traffic that reaches the threshold at low altitude is a likely landing;
outbound low-altitude climbing traffic is a likely takeoff/departure. A
high-altitude pass is an overflight and is excluded from runway usage. A
near-airport approach that climbs and moves away is a go-around. Stable,
repeated near-airport tracks are holding. Sparse or conflicting observations
are omitted rather than presented as fact.

## Wind and runway usage

Runway-end headings are used to calculate headwind and crosswind components.
The API reports traffic-derived likely runway usage separately from wind
components. Use “wind-favored runway” and “likely runway based on recent
traffic”; these are observational descriptions, not operational guidance.

## APIs and history

`GET /api/airports/:icao/operations?period=today|24h|7d` returns bounded
arrivals, departures, approaches, recent movements, go-arounds, holding,
runway usage, activity level, likely runway, wind components when supplied by
the operation builder, and diagnostics. The existing movements endpoint is
the lower-level source. Results are computed from historical sampled
positions, so a selected period is not reconstructed from current aircraft
state and may be incomplete when query caps are reached.

## Limitations

Receiver gaps, late acquisition, missing routes, missing METAR, helicopters,
touch-and-go traffic, nearby airports, and parallel runways reduce confidence.
No new persistence table is used; this avoids duplicating Flight Intelligence
history. `npm run audit:airport-operations` produces a deterministic quality
artifact from synthetic scenarios and records coverage and ambiguity metrics.
