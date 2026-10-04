# Runway Public Rollout V1 rollback

If a manually configured PUBLIC Runway capability must be withdrawn, set the configured Runway capability back to SHADOW. Runtime readiness already fails closed automatically when PASS is lost, so rollback does not require data deletion or prediction-state mutation.

This document does not change production configuration; it records the intended operational recovery path.
