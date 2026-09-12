# Airport Movement Intelligence V2

Airport movement intelligence is a bounded, on-demand estimate over AirRadar's
existing `Flight` and sampled `FlightPosition` records. It does not add a
database table or migration.

## Semantics

Positions, timestamps, altitude, speed, track, vertical rate, airport
coordinates, and runway geometry are observed data. `APPROACH`, `LANDING`,
`TAKEOFF`, `DEPARTURE`, `OVERFLIGHT`, and `PROBABLE_RUNWAY` are deterministic
inferences. The UI uses “probable” or “likely” wording and every movement
contains human-readable evidence and a low/medium/high confidence label.

These results are not an ATC clearance, assigned runway, tower instruction,
tuned frequency, or complete airport movement log.

## Bounds and completeness

`GET /api/airports/[icao]/movements?period=today|24h|7d` examines at most 250
candidate flights, searches a 45 km airport envelope, caps the position query
at 50,000 rows, and keeps at most 240 positions per flight. The response
reports `complete: false` and `truncated: true` whenever a cap is reached;
partial counts are lower bounds. The normal UI default is 24 hours.

The analyzer performs one bounded flight query and one batched position query,
then classifies in memory. It ignores invalid timestamps/coordinates and needs
at least three valid ordered observations. Sparse or ambiguous trajectories may
produce no classification.

## Classification rules

- Approach: decreasing airport distance plus a descending trend in a plausible
  airport corridor, without requiring a touchdown.
- Landing: an approach that reaches the threshold/airport vicinity at low
  altitude with reduced or low speed. This is “likely landing” because sampled
  receiver data may end before touchdown.
- Takeoff: a low-altitude airport-near start followed by climb, speed, and
  outward movement.
- Departure: outbound climbing traffic first acquired after liftoff; the first
  observed point need not be on a runway.
- Overflight: distance decreases then increases while altitude remains
  incompatible with landing and no sustained climb/descent pattern is tied to
  the airport.

## Probable runway

Runway ends are evaluated independently. The analyzer combines threshold
proximity with the relevant observed track and uses shortest angular
difference, so reciprocal headings such as 359° and 001° are two degrees
apart. A runway is returned only when the geometry and track score clear a
threshold and the best candidate is not effectively tied with another runway
end. Parallel or otherwise ambiguous runways therefore return no probable
runway rather than a forced answer.

## Limitations

The receiver may acquire an aircraft late, lose it before touchdown, sample
coarsely, or observe a missed approach. Weather is not used to claim causality;
runway-wind comparison remains separate. The analyzer is explainable and
rule-based, not ML, and its diagnostics expose only bounded query duration and
row counts. No private receiver coordinates are returned.

The main radar map keeps its existing architecture. Static airport, ATC, ATS,
and optional airspace datasets use independent bounded retry state, preserve
last-known-good data, abort on cleanup, and replay the latest payload when
MapLibre sources become ready or are recreated. Airspace activity is enrichment
only and cannot suppress base ATC polygons.
