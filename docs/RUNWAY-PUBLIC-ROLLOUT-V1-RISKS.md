# Runway Public Rollout V1 risks

The main product risk is confusing a predicted runway with a confirmed ATC assignment. This rollout layer does not change that semantic boundary: public Runway Advisory remains explicitly predictive and confidence-gated.

The main operational risk is treating `READY_FOR_PUBLIC_CONFIG` as automatic authorization. The state therefore carries `requiresExplicitConfigChange=true` and performs no mutation.
