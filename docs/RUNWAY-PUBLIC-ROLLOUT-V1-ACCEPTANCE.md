# Runway Public Rollout V1 acceptance criteria

V1 is acceptable when:

- all five rollout states are deterministic,
- PASS in SHADOW never becomes public without an explicit config change,
- configured PUBLIC with lost readiness is represented as fail-closed,
- public routes do not consume the rollout decision,
- existing Runway Advisory publication guards remain authoritative,
- EN/CS documentation stays paired,
- repository CI and CodeQL are green.
