# Rizika Runway Public Rollout V1

Hlavním produktovým rizikem je záměna predikované runway za potvrzené ATC přidělení. Tato rollout vrstva semantickou hranici nemění: veřejný Runway Advisory zůstává explicitně prediktivní a confidence-gated.

Hlavním provozním rizikem je považovat `READY_FOR_PUBLIC_CONFIG` za automatické oprávnění. Stav proto nese `requiresExplicitConfigChange=true` a neprovádí žádnou mutaci.
