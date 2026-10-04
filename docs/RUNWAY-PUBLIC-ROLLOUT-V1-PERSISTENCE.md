# Runway Public Rollout V1 persistence

No rollout decision is persisted in V1. Persisting a derived operator state would risk divergence from live readiness and policy. The state is recomputed from current typed inputs whenever needed.
