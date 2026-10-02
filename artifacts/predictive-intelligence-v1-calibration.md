# Predictive Intelligence V1 calibration

Result: **PARTIAL**

- Source: production PostgreSQL through a read-only transaction; no writes or DDL.
- Frozen window: 2026-10-02T00:00:00.000Z to 2026-10-02T13:30:00.000Z.
- Corpus: 500 frozen flights (353 calibration / 147 holdout), overlap 0.
- Candidate flights: 3031; extracted positions: 18614; persisted events in corpus: 0.
- Ground truth: 0 linked LANDING rows; reliable runway truth: 0.
- Weather: no flight-linked historical weather; airport-operations history is not durable.

ETA checkpoint metrics are present only for the 0 flights with canonical landing events. Runway metrics cannot be scored. Trajectory results are observational and remain SHADOW because positive labels are absent. Destination availability timestamps are not preserved, so final destination use is recorded as a provenance limitation.

Capabilities remain ETA=SHADOW, RUNWAY=SHADOW, RUNWAY_CHANGE=SHADOW, TRAJECTORY=SHADOW. Production was not built, deployed, restarted, or modified.
