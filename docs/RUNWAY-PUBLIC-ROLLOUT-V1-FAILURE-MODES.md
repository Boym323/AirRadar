# Runway Public Rollout V1 failure modes

Expected safe outcomes include insufficient evidence → `SHADOW_COLLECTING`, configured PUBLIC with readiness regression → `PUBLIC_FAIL_CLOSED`, and explicit disablement → `DISABLED`. None of these paths should expose a Runway advisory through the rollout module itself.
