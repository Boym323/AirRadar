# Stage E — Truth & Accuracy Intelligence V1

Read-only extension of existing Predictive Prospective Validation V2, Airport Live Board V9 and Flight Story. No new forecast algorithm, receiver poller, or automatic PUBLIC graduation.

## E1 — Truth integrity
Consumes the same bounded cached 30-day readiness observations and independent terminal LANDING truth. Earliest immutable prediction per lifecycleKey plus capability is used to prevent cherry-picked final forecasts. Missing truth is UNSCORABLE rather than incorrect. Truncated queries fail closed.

## E2–E3 — Airport and phase outcomes
Independently confirmed ETA and exact runway-end results are grouped by destination ICAO and recorded flight phase. Require at least 10 scored flights per group; cap display to 12 airport and 8 phase rows. Detector-event recall is not measured: no complete independent register of go-around / holding events exists here.

## E4 — Confidence
Compare LOW/MEDIUM/HIGH confidence with later confirmed outcomes using earliest predictions. At least 20 scored flights are needed; success means ETA within five minutes or exact runway-end match. Empirical success is not a calibrated probability.

## E5 — Flight Story
On-demand admin-only prospective audit. GET /api/admin/flights/:id/evidence authorizes before any database access and reads capped 65 prediction and 33 landing rows, including sentinel. Only later matched flight ID, aircraft ICAO and lifecycle evidence within six hours can be scored. Missing independent truth is UNSCORABLE. HTTP response is private/no-store and no browser request occurs before operator click.

## E6 — Continuous quality review
The existing authenticated predictive readiness report and /system display one additional bounded diagnostic decision: SOURCE_UNAVAILABLE, COLLECTION_INCOMPLETE, INSUFFICIENT_TRUTH, REVIEW_QUALITY or MONITOR. Review thresholds are descriptive only (ETA MAE >5 minutes or exact runway accuracy <85% when both capabilities have at least 20 independently scored flights). They never mutate effective policy, public advisories or runway/trajectory graduation. There is no new collector, migration, background worker, or upstream request. Existing PR and release CI must pass. Green CI is not evidence of real-world predictive quality.
