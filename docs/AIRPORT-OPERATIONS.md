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

## Airport Live Board V7

V7 keeps the V6 Flow Trend / Pressure panel and adds Runway Flow / Stability as
another pure projection over the same bounded operations snapshot. It compares
runway-bearing movements in the latest 15-minute window with the preceding
15-minute window. Each flight contributes at most one runway sample per window,
using its newest runway-bearing movement in that window.

The runway-flow state is conservative. STABLE requires at least three samples in
both windows, the same dominant runway in both, and at least a 75 percent share
for that runway in each window. TRANSITIONING requires at least three samples in
both windows, a different dominant runway, and at least a 60 percent share for
both the previous and current dominant runways. Otherwise the result is MIXED
or INSUFFICIENT.

The panel also shows current arrival and departure runway evidence separately,
reported versus inferred runway-sample counts, and comparison with the current
wind-favoured runway when the current runway evidence is strong enough. A
transition is an observed change in bounded receiver evidence, not confirmation
of an airport configuration change or an ATC instruction. V7 adds no request,
EventSource, API route, database table or persistence write path.

## Limitations

Receiver gaps, late acquisition, missing routes, missing METAR, helicopters,
touch-and-go traffic, nearby airports, and parallel runways reduce confidence.
No new persistence table is used; this avoids duplicating Flight Intelligence
history. `npm run audit:airport-operations` produces a deterministic quality
artifact from synthetic scenarios and records coverage and ambiguity metrics.


### V7 Arrival Sequence

The V7 runway-flow panel is complemented by a bounded active-arrival sequence
from the same live receiver snapshot. At most six approaching aircraft are sent
in one batch to the existing `GET /api/operations/predictive?hexes=` endpoint.
The request is refreshed by the airport controller's existing 30-second refresh
token, so this adds neither another EventSource nor a second periodic timer.

Only readiness-gated PUBLIC ETA and runway advisories are copied from the
predictive response; admin previews are discarded. A CONFIRMED route arrival
remains visible without prediction. UNKNOWN route traffic enters the sequence
only when the PUBLIC prediction destination matches the board ICAO. Predictive
ETA/runway values are also used only on that destination match.

PUBLIC ETA rows sort first; the remainder use deterministic journey-stage and
distance ordering. The panel shows calibrated ETA uncertainty, median spacing
between available ETAs, predicted-runway stability, and the existing observed
V7 runway-flow evidence. The sequence is receiver/prediction intelligence, not
ATC sequencing or FIDS.


## Airport Live Board V8

V8 adds Arrival Flow Intelligence as a pure projection over the existing V7
arrival sequence, V6 flow-pressure evidence, and V7 runway-flow evidence. It
adds no API route, EventSource, database table, persistence path, or refresh
timer.

The current product horizon is intentionally bounded to the active arrival
sequence and therefore does not claim complete airport demand. Readiness-gated
PUBLIC ETA values are grouped into 5-, 15-, and 30-minute demand windows.
The 0–15 and 15–30 minute buckets are equal-length windows; their difference
drives the conservative INCREASING / STABLE / DECREASING trend. Fewer than two
usable ETA samples yields NO_DATA.

Arrival pressure combines the bounded active-arrival count, arrivals expected
inside 15 minutes, recent receiver-inferred holding/go-around evidence, and ETA
compression. Compression is derived only from adjacent PUBLIC ETA spacing
inside the 30-minute horizon and is reported as NORMAL, ELEVATED, HIGH, or
UNKNOWN.

Predicted runway load is grouped from PUBLIC runway advisories attached to
arrivals with a PUBLIC ETA inside 30 minutes. Predicted-vs-observed runway
alignment is shown only when both sides have enough evidence: the predicted
dominant runway needs at least two samples and a 60 percent share, while the
receiver-observed current runway flow needs at least three samples and a 60
percent share. Otherwise the comparison is UNKNOWN.

Evidence is explicit. PUBLIC_STRONG requires at least two PUBLIC ETA samples
inside the V8 30-minute horizon and at least 75 percent coverage of the bounded
active-arrival sequence. PUBLIC_PARTIAL covers thinner public prediction
evidence; otherwise V8 reports RECEIVER_ONLY.

V8 also exposes one conservative Approach Queue state without adding another
metric pipeline. EMPTY and LOW_DENSITY cover zero to two active arrivals,
ACTIVE covers an ordinary multi-aircraft sequence, BUILDING requires at least
four active arrivals plus corroborating approach/final, holding, compression or
arrival-pressure evidence, COMPRESSED requires at least three PUBLIC ETA samples
and at least two compressed adjacent ETA pairs, and HOLDING_PRESENT requires at
least two HOLDING rows in the bounded sequence. The queue state reuses the same
V7/V8 evidence; it performs no additional read or write.

V8 is not ATC sequencing, FIDS, separation minima, airport capacity, slot
demand, a safety assessment, or a delay forecast.

## Airport Live Board V9 — Terminal Demand Horizon

V9 preserves the V8 active-arrival sequence, PUBLIC ETA demand windows and approach-queue semantics, then adds a separate extended inbound horizon from the full current LOCAL receiver snapshot. An aircraft enters the horizon only when it has a fresh positioned observation, is airborne, and its existing route destination matches the airport ICAO or IATA identifier.

The extended horizon is not another prediction engine. When current groundspeed is usable, V9 exposes a bounded direct-distance/current-groundspeed estimate up to 120 minutes only as fallback context. It reports route-matched inbound count, estimated coverage, cumulative <=30 and <=60 minute buckets, and track relation to the airport. The list is capped at 12 aircraft and the board renders at most six rows.

This does not replace readiness-gated PUBLIC ETA in V7/V8, does not feed V8 pressure/compression/queue scoring, and does not infer ATC sequencing, slots, airport capacity or delay. V9 reuses the existing 30-second Airport Operations refresh and reads one existing LOCAL aircraft snapshot on the server; it adds no EventSource, browser timer, database query, provider request or persistence path.
