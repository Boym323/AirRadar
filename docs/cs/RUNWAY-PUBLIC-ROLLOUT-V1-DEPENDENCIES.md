# Závislosti Runway Public Rollout V1

Decision vrstva závisí pouze na existujících predictive kontraktech:

- `PredictiveCapabilityStatus`,
- Runway `PredictiveReadinessCapabilityResult`,
- Runway `PredictiveGraduationCapabilityCalibration`,
- existující effective policy vynucené graduation guardem.

Záměrně nemá závislost na Prisma, HTTP, timerech, browser state ani prediction persistence.
