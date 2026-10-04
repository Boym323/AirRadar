# Implementační poznámky Runway Public Rollout V1

Implementace kopíruje ověřenou strukturu ETA rollout, ale používá Runway-specific typované readiness/calibration vstupy. Pořadí blockerů zachovává nejprve collection a integrity klasifikaci a potom zbývající readiness reasons. Veřejné surfaces nejsou záměrně napojené na rollout builder.
