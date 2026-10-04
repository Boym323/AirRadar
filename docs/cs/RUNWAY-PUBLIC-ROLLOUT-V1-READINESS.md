# Readiness semantika Runway Public Rollout V1

Rollout vrstva používá existující Runway readiness rozhodnutí beze změny. Nemění WAIT na PASS, nezaměňuje calibration headroom za readiness a neoslabuje integrity ani collection blockery. Pouze existující PASS spolu s `manualReviewEligible=true` může při configured SHADOW vytvořit `READY_FOR_PUBLIC_CONFIG`.
