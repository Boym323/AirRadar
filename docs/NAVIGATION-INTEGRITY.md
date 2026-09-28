# Navigation Integrity V1

AirRadar Navigation Integrity is a conservative situational-awareness layer
built from existing ADS-B telemetry. It is not an official GNSS interference
monitoring network and it does not prove jamming, spoofing, or an aircraft
navigation failure.

## Semantics and provenance

The canonical observation is `NavigationIntegrityObservation`. It keeps NIC,
NACp, NACv, SIL, SDA, GVA, and ADS-B version as separate nullable values.
Unavailable values remain `null`; AirRadar does not turn ADS-B categories into
invented percentages. Existing field-level provenance and timestamps are
carried into the observation. LOCAL and NETWORK origin remain distinct.

An observation requires a valid position, a sufficiently fresh position and
fresh integrity metadata with a bounded position/metadata skew. Ground targets,
unknown provenance, stale fields, and incomplete pairs are rejected. This
prevents a current position being combined with an old integrity report.

## Sampling and persistence

The live service evaluates the aircraft set at most every 15 seconds and runs
the regional detector at most every 30 seconds. Persistence is sparse: the
first observation, a state/source/altitude-band change, meaningful movement, or
a 120-second heartbeat may create a row. The database migration adds
`NavigationIntegrityObservation` and `NavigationIntegrityAnomaly` with bounded
time, aircraft, cell, and altitude indexes. Raw observations are intended for
30-day retention; the process-local working set is capped and TTL-pruned.

No migration is applied automatically to production. PostgreSQL is optional for
live radar operation; when unavailable, diagnostics expose unavailable metrics
as `null` where appropriate and the bounded process-local detector can still
operate.

## Spatial and altitude model

Observations map to deterministic 0.2° latitude/longitude cells and one of five
altitude bands: 0–10,000 ft, 10,000–20,000 ft, 20,000–30,000 ft,
30,000–40,000 ft, and 40,000 ft or higher. Adjacent affected cells can form a
single bounded region only when they share the same altitude band. Raw altitude
remains available in the observation.

## Classification and detector

Aircraft state is `NORMAL`, `REDUCED`, `DEGRADED`, `SEVERE`, or `UNKNOWN`.
Rules are transparent and use multiple original fields; a single low field is
reduced, multiple low indicators are degraded, and severe requires stronger
multi-field evidence. Regional candidates require at least three independent
aircraft, not three messages from one aircraft. Five contributors are the
starting point for medium confidence and eight local-supported contributors,
duration, and baseline coverage are required for high confidence. Severity and
confidence are independent.

The detector uses a bounded rolling window, cell medians, aircraft counts,
source counts, and a simple deterministic baseline. It uses no ML. Hysteresis
requires two qualifying evaluations to open and three normal evaluations to
close an active candidate. A candidate is a heuristic correlated navigation
anomaly; it must not be described as “GPS jamming detected”.

False-positive protection includes stale-pair rejection, independent-aircraft
counting, source awareness, ground exclusion, invalid-coordinate rejection,
bounded cell adjacency, and LOCAL-versus-NETWORK evidence. Network observations
can participate, but the API exposes their origin and does not imply that the
AirRadar receiver directly observed them.

## APIs

- `GET /api/navigation-integrity/current?window=5m|15m|30m|60m` returns bounded
  cell summaries and active anomaly evidence. Altitude and source filters are
  validated and time windows are bounded.
- `GET /api/navigation-integrity/aircraft/:hex` returns the latest bounded
  observation, freshness/provenance, aircraft classification, and regional
  context.
- `GET /api/navigation-integrity/history?from=&to=` returns bounded anomaly
  events, never an unbounded raw ADS-B sample stream.
- `GET /api/admin/navigation-integrity/diagnostics` returns protected counters,
  rejection reasons, baseline readiness, and bounded memory indicators.

## UI and limitations

The radar has an opt-in Navigation integrity layer. It shows restrained amber
or red cell regions and a legend only when enabled; normal and unknown data do
not create false-alarm colors. The current selected-aircraft API includes
navigation-integrity context for Situation/Data surfaces. Historical anomaly
events are available to Time Machine consumers through the bounded history API.

The layer is based on ADS-B navigation-integrity telemetry, not official GNSS
monitoring. It cannot identify the cause of a correlated degradation, cannot
measure RF conditions, and cannot distinguish all avionics, decoder, provider,
or environmental artifacts. Weather correlation must remain descriptive and
must not imply causation.

## Retention and privacy

Raw sparse observations are intended to be retained for approximately 30 days;
aggregated anomaly events may be retained longer. Public projections expose
bounded cells and aircraft context without hidden receiver coordinates or
internal filesystem/database details. All query windows, identifiers, and
counts are validated and capped.
