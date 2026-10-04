# Runway Public Rollout V1 decision record

Decision: keep Runway rollout read-only and operator-driven for V1.

Reason: predictive graduation already provides the authoritative fail-closed runtime gate. Adding automatic promotion would combine evidence evaluation with configuration mutation and weaken auditability. The rollout layer therefore reports eligibility and active/fail-closed state only.
