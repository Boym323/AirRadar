# Checklist Runway Public Rollout V1 review

Ruční kontrola před produkční změnou konfigurace na PUBLIC má potvrdit:

1. Runway readiness je PASS nad kompletní bounded collection.
2. Graduation calibration vrací `manualReviewEligible=true` a žádné blockery.
3. Nakonfigurovaná Runway policy je před akcí operátora stále SHADOW.
4. Existující veřejné guardy Runway Advisory zůstaly beze změny.
5. Rollback do SHADOW je dostupný pouze změnou konfigurace.

Checklist je pouze popisný a změnu konfigurace neopravňuje ani neprovádí.
