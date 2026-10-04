# Decision record Runway Public Rollout V1

Rozhodnutí: ve V1 ponechat Runway rollout read-only a řízený operátorem.

Důvod: predictive graduation už poskytuje autoritativní fail-closed runtime gate. Automatické povýšení by spojilo vyhodnocení evidence s mutací konfigurace a snížilo auditovatelnost. Rollout vrstva proto pouze hlásí eligibility a active/fail-closed stav.
