# Runway Public Rollout V1 safety contract

Runway rollout is intentionally separate from Runway prediction generation and public serialization.

The rollout decision cannot:

- change configured capability status,
- bypass Predictive Graduation Readiness,
- bypass Runway Advisory freshness or confidence guards,
- create a database row,
- add a polling or streaming path,
- infer a confirmed ATC runway assignment.

`PUBLIC_ACTIVE` is descriptive, not causal: it is emitted only after configured PUBLIC, effective PUBLIC, and readiness PASS already agree. `PUBLIC_FAIL_CLOSED` makes the inverse condition visible to operators when configured PUBLIC is not currently eligible for public exposure.
