# Fail-closed chování Runway Public Rollout V1

Pokud je configured mode PUBLIC, ale effective mode není PUBLIC nebo readiness není PASS, V1 hlásí `PUBLIC_FAIL_CLOSED`. Nikdy nehlásí public active pouze z configured záměru.

To odpovídá runtime graduation enforcementu a dává operátorovi explicitní stav při regresi readiness bez vytvoření bypassu kolem tohoto enforcementu.
