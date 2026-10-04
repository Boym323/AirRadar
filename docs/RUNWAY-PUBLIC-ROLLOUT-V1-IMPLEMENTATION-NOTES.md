# Runway Public Rollout V1 implementation notes

The implementation mirrors the proven ETA rollout structure but uses Runway-specific typed readiness/calibration inputs. Blocker ordering preserves collection and integrity classifications first, then remaining readiness reasons. Public surfaces are intentionally not wired to the rollout builder.
