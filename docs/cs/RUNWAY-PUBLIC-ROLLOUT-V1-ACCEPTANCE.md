# Akceptační kritéria Runway Public Rollout V1

V1 je akceptovatelná, pokud:

- všech pět rollout stavů je deterministických,
- PASS v SHADOW se nikdy nezveřejní bez explicitní změny konfigurace,
- nakonfigurované PUBLIC při ztrátě readiness je reprezentováno jako fail-closed,
- veřejné routy rollout decision nepoužívají,
- existující publikační guardy Runway Advisory zůstávají autoritativní,
- EN/CS dokumentace zůstává párová,
- repository CI a CodeQL jsou zelené.
