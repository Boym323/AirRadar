# Runway Public Rollout V1 architecture note

The rollout module belongs beside readiness/graduation/advisory contracts in `lib/predictive-intelligence`. It is downstream of readiness and calibration and upstream of an operator decision only. It is deliberately not inserted into the public prediction serialization path.
