# Bezpečnostní kontrakt Runway Public Rollout V1

Runway rollout je záměrně oddělený od generování Runway predikce i od veřejné serializace.

Rollout rozhodnutí nemůže:

- změnit nakonfigurovaný status capability,
- obejít Predictive Graduation Readiness,
- obejít freshness nebo confidence guard Runway Advisory,
- vytvořit databázový řádek,
- přidat polling nebo stream,
- vydávat predikovanou runway za potvrzené ATC přidělení.

`PUBLIC_ACTIVE` je popisný, nikoli příčinný stav: vznikne pouze tehdy, když už souhlasí explicitní PUBLIC konfigurace, efektivní PUBLIC a readiness PASS. `PUBLIC_FAIL_CLOSED` naopak operátorovi zviditelní stav, kdy je PUBLIC nakonfigurováno, ale veřejné vystavení momentálně není způsobilé.
