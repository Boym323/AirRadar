# Predictive Terminal Ground Truth V1

Result: **PARTIAL**

- Historical exact on-ground source: **NO** (FlightPosition coverage 0 / 5,413,293).
- Canonical LANDING rows: 26; canonical replay retest accepted: **NO** because the replay adapter cannot reconstruct on-ground state.
- Independent terminal classifier: 3 CONFIRMED, 8 AMBIGUOUS, 4 UNKNOWN across 15 linked canonical flights.
- Negative sample: 100 completed non-LANDING flights; classifier confirmations: 0.
- Runway context: 26 metadata rows; reported 0, inferred 0, conflicts 0.
- Flight.endTime is not accepted as truth: median delta 145s, p90 1098s, range -212s to 2189s.
- ETA, RUNWAY, RUNWAY_CHANGE, and TRAJECTORY remain **SHADOW**.
- Historical writes: **0**; replay writes: **0**.

The full machine-readable evidence is in [predictive-terminal-ground-truth-v1.json](predictive-terminal-ground-truth-v1.json). The classifier is isolated from predictive inputs and uses only post-hoc observed track geometry.

Next step: **TERMINAL GROUND TRUTH PARTIAL — DEPLOY SPARSE PROSPECTIVE INSTRUMENTATION**.
