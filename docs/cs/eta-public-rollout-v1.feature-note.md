# Feature note — ETA Public Rollout V1

Tento aditivní kontrakt leží mezi Predictive Graduation Calibration V1 a existujícím veřejným serializerem ETA Advisory V1. Poskytuje explicitní rollout stav pro operátora, aniž by měnil veřejný serializer nebo configured policy.

Implementace je záměrně čistá a bez side effectů. `READY_FOR_PUBLIC_CONFIG` znamená, že operátor může provést review a explicitně přepnout ETA na `PUBLIC`; AirRadar tuto změnu sám neprovádí. Pokud ETA nakonfigurovaná jako `PUBLIC` později ztratí readiness `PASS`, existující effective-policy guard ji stáhne na `SHADOW` a rollout kontrakt vrátí `PUBLIC_FAIL_CLOSED`.
