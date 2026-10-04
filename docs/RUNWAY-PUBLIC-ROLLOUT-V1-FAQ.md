# Runway Public Rollout V1 FAQ

**Does this make Runway public?** No. It only reports when an explicit manual configuration change could be reviewed.

**Does PASS automatically promote Runway?** No. PASS in SHADOW becomes `READY_FOR_PUBLIC_CONFIG` only.

**What happens if readiness regresses after PUBLIC configuration?** Existing graduation enforcement downgrades effective policy to SHADOW and rollout reports `PUBLIC_FAIL_CLOSED`.

**Does this also graduate Runway Change?** No. Runway Change remains independent.
