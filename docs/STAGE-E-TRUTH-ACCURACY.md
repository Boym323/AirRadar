# Stage E — Truth & Accuracy Intelligence V1

Stage E extends the existing prospective validation and public readiness mechanisms, never creating an independent public prediction path.

## E1 — Truth Integrity (implemented, first increment)

`buildPredictiveTruthIntegrity` consumes only already-scored `PredictiveTrendSample` rows. It is read-only and makes no data-access calls. Deduplicate by capability and flight lifecycle, selecting the **earliest** captured prospective prediction (stable observation-key tiebreak). Reject invalid lifecycle identities, unparseable, out-of-window or future prediction timestamps. Count missing confirmed truth separately from invalid score fields and duplicate captures. A scored wrong runway remains scoreable; `false` is not missing truth.

Completeness and availability take precedence over apparent score coverage. Any truncated/missing source is untrusted for comparisons; this accounting does not authorize PUBLIC graduation and never marks unscorable observations as prediction errors.

The capability has no new API, migration, timer, hot-path integration, provider call or write. Existing administrative readiness and trend data remain the integration boundary.

## Follow-up scope

- E2: Independently evaluate airport-specific predictions and later confirmed landing/runway events. Do not use predicted runway or inferred Airport Operations change as self-confirmation.
- E3: Explain ETA and runway accuracy by airport, horizon, flight phase, provenance, and source; suppress thin cohorts.
- E4: Calibration should compare confidence bands against observed correctness, with sample-count guards, and produce advisory findings only.
- E5: Reuse Flight Story with per-flight redacted evidence, not another page and not public sensitive receiver data.
- E6: Read-only quality reports and regression signals; re-use CI and current manual readiness gates, never automatically promote SHADOW to PUBLIC.
