# Airport Movement Intelligence V2 — future design

This is a design note only. It does not change the schema, create migrations,
or claim authoritative airport or ATC movement data.

## Evidence model

The existing `Flight` instance identifies a receiver-observed callsign/ICAO
observation window. `FlightPosition` samples provide the time series for
position, altitude, ground speed, track, and vertical rate. Airport and
runway geometry supplies thresholds, centerlines, elevations, and usable
approach/departure corridors. Weather and wind can rank the runway direction
that is most consistent with the observation.

Every result should expose an evidence label:

- `OBSERVED`: the receiver actually sampled the aircraft state near the
  airport or inside a defined corridor. This describes receiver evidence, not
  an official airport movement record.
- `INFERRED` / `PROBABLE`: a classifier matched the observed trajectory to an
  airport/runway geometry and, optionally, wind. It is an estimate and must
  never be presented as an ATC clearance or authoritative runway assignment.

## Candidate classifiers

| Class | Observed evidence | Probable inference |
| --- | --- | --- |
| Approach | Positioned samples enter an airport approach corridor with descending altitude or vertical rate and decreasing distance to the threshold. | Track/geometry alignment, descent profile, speed, and wind favor one runway end. |
| Landing | Samples continue through the threshold/elevation band and show deceleration or a transition toward runway surface elevation. | A short final approach followed by low speed/ground track persistence identifies a probable runway and landing event. |
| Takeoff | Samples near the airport leave the runway elevation band with increasing ground speed, climb, and a runway-aligned track. | The initial ground track and wind-ranked runway centerline identify a probable departure runway. |
| Departure | Samples move outward from the airport after the takeoff-like transition and continue climbing. | A runway-aligned origin plus first outbound leg supplies probable runway/origin context. |
| Overflight | Samples cross the airport vicinity without a credible threshold crossing or climb/descent transition tied to the airport. | A corridor intersection with stable altitude and no airport proximity transition is classified as probable overflight. |
| Probable runway | The receiver observed the aircraft close to a runway geometry element. | Score threshold crossing, alignment, altitude, speed, turn/track consistency, and wind; return a ranked probability with reasons. |

The classifier should use configurable airport-elevation and distance bands,
minimum sample counts, time ordering, and hysteresis so noisy samples do not
flip a movement repeatedly. It should keep the raw supporting timestamps and
sample IDs for review, while limiting output to bounded recent observations.

## Implementation boundary

Reuse existing airport/runway catalog data and bounded Flight/FlightPosition
queries. Do not use callsign as aircraft identity, and do not merge OGN into
the ADS-B airport evidence path. Keep weather optional and fail-soft. A later
implementation should add focused fixture tests for each class, adverse wind,
missing positions, sparse samples, receiver distance, and ambiguous parallel
runways before any UI or schema decision is made.
