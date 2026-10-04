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

## Airport Live Board V5

The airport detail reuses the 24-hour operations response and the existing
airport-weather response in one page-scoped controller. The controller performs
a one-shot refresh every 30 seconds and never opens another aircraft stream.
V3 keeps the single `/api/stream` subscription shared between the Live Board and Nearby Aircraft. NOW inbound/outbound lanes still come from fresh aircraft positions using the existing conservative airport-traffic classifier; each lane is nearest-first and capped at six aircraft. Each active row is then correlated in memory with the already-loaded bounded Airport Operations snapshot. A correlation is accepted only for the same ICAO identity, a non-conflicting callsign, a direction-compatible movement, and an event no more than 20 minutes from the live observation (with two minutes of clock-skew tolerance). Recent Arrivals and Recent Departures remain newest-first, deduplicated by Flight ID, and capped at six rows each. GO_AROUND/HOLDING events have their own
six-row operational lane. Runway usage is capped at four rows.

When correlation succeeds the active row exposes the matched Flight ID through Flight Story plus the latest compatible movement, runway, confidence and event time. Missing, stale or conflicting evidence remains live-only rather than being guessed. V4 adds an explainable active journey state on top of that evidence: INBOUND, HOLDING, APPROACH, FINAL, LANDED, GO_AROUND, INITIAL_CLIMB or OUTBOUND. FINAL requires a fresh correlated APPROACH plus live distance <=8 km and vertical rate <=-150 fpm; LANDED requires a fresh correlated LANDING plus a live on-ground observation, so unrelated parked aircraft are never promoted into the active arrival lane; route metadata is evaluated separately as CONFIRMED, UNKNOWN or CONFLICT and never overrides observed movement. V5 adds a bounded NOW Flow Pulse computed entirely from those active journey rows: inbound, final, holding, outbound, go-around and route-conflict counts plus a six-row attention list. Attention is deterministic and ordered GO_AROUND → HOLDING → route conflict, then nearest aircraft. Normal traffic — including LANDED rows — is excluded from the attention list. The board also reuses the same METAR to show flight category, wind, visibility,
temperature and QNH. These are observational receiver/weather views rather than
airport schedules, FIDS, runway assignments or ATC instructions.

## Airport Live Board V6

V6 keeps the V5 NOW Flow Pulse and adds a second pure projection over the same
shared data: Flow Trend / Pressure. It compares receiver-inferred arrival and
departure movements in the latest 15 minutes with the preceding 15 minutes.
A one-movement difference remains STEADY; RISING or FALLING requires a delta
of at least two, which deliberately reduces low-volume oscillation.

Holding is counted over the current 15-minute window and go-arounds over a
30-minute exception window. The pressure level is a bounded deterministic score
over the current inbound, outbound, final, holding, go-around and route-conflict
snapshot plus conservative bonuses for clearly rising arrival/departure flow.
It is an observational flow indicator, not an airport-capacity, delay, safety
or ATC metric.

Recent runway consistency is evaluated over 30 minutes from runway-bearing
movement evidence. At least three samples are required; STABLE requires one
runway to account for at least 75 percent of those samples. Otherwise the result
is MIXED or UNKNOWN. V6 adds no request, stream, database table or persistence
write path.

## Limitations

Receiver gaps, late acquisition, missing routes, missing METAR, helicopters,
touch-and-go traffic, nearby airports, and parallel runways reduce confidence.
No new persistence table is used; this avoids duplicating Flight Intelligence
history. `npm run audit:airport-operations` produces a deterministic quality
artifact from synthetic scenarios and records coverage and ambiguity metrics.
