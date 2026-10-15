# Integration Health: observability vs service readiness

Date: 2026-10-15. Production observation: GitHub Actions
[Integration Health #38764470285](https://github.com/Boym323/AirRadar/actions/runs/38764470285),
on commit `3c730c76` after merging PR #912.

## Confirmed observation (no new provider calls)

The newly introduced read-only audit completed successfully and wrote
private, bounded JSON and Markdown reports. It returned exit code 2
**because the report was DEGRADED by design**, not because of an uncaught
exception, incorrect JSON, upload failure or outage of the local readsb
receiver. The Action therefore showed a red **workflow**, which conflated
the success of an observational read with the production service verdict.

Specific evidence from its sanitized Action log:

- Local readsb = VERIFIED HEALTHY, PostgreSQL /api/health = VERIFIED HEALTHY.
- ADSB.lol routeset = BLOCKED. Persistent refusal cooldown remains
  active until `2026-10-15T20:37:09.101Z` (22:37 Prague time).
  This is a provider refusal state: **no new calls were attempted**.
- Route Cache: 108 admission/concurrency bypasses since process start;
  24 `dbError` and 2,085 `dbBypassed` in the last 24 hours. These
  counters do not establish an ongoing PostgreSQL outage. Last-hour
  read-only database-health samples had 0/60 failures; reported
  Route Cache SQL latency p95 29.5ms from 626 samples. That latency is
  elapsed client-side sample latency, **not server SQL execution**.
- A bounded runtime window recorded a worst event-loop delay of 5.43s
  despite a p99 of approximately 60.5ms. Attribution remains unknown.

## CI semantics fix

`integration-audit.mjs --degraded-policy warn` is an **explicit opt-in**
for observational runs. In this mode a DEGRADED report still contains all
its critical severity labels, sanitised metrics and complete raw evidence
in the existing private GitHub Actions artifact. The CLI emits a fixed,
prominent `::warning` annotation but returns status 0 if the report
was collected and written correctly.

Default CLI behavior **remains strict**:
`--degraded-policy fail` (the default) returns status 2 on DEGRADED
for operator-run acceptance gates. Read errors, authorization problems
that break the audit itself, unsafe paths, oversized output and malformed
local JSON still produce nonzero exit codes in either mode. No existing
diagnostic classification or sensor condition is downgraded.

This changes only the reporter's verdict-to-exit-code policy, **not**
the `ADSBLOL_ROUTE_ENABLED` setting, authorization, retry/cooldown
logic, POST requests, cache concurrency caps, or production process.
No cooldown reset, provider probe or production write is part of this PR.

## Genuine external dependency: routeset refusal

ADSB.lol API docs (https://api.adsb.lol/docs) request contact with the
operator before production use. Contact their operator and confirm
permission/expected behavior for `POST /api/0/routeset`, including
authentication/allowlisting and the AirRadar identification header.
An application User-Agent is not evidence that it caused the 403.
Until permission is confirmed, do not clear the 6h cooldown, repeatedly
retry, or override the refusal guard.

If the deployment has no approved production access to this endpoint,
operators can *separately* consider disabling the optional routeset
feature through normal configuration review. This PR does not change
the setting or bypass the guard.

## Route Cache follow-up

Investigate the 108 accumulated concurrency bypasses using
`docs/ROUTE-CACHE-V5-DIAGNOSTICS.md` and a new read-only
observation: compare **counter deltas within a stable process**,
caller-timeout overshoot and route-cache admission state with the
same-minute event-loop windows. The presence of a bounded, fail-soft
concurrency barrier does not justify automatically raising its limits.
Do not apply index/DDL changes or fire additional provider or DB probes
without validating the source of contention and coordinating a release.

## Regression gates

`tests/integration-audit.test.mjs` verifies: default strict mode
exits 2 when DEGRADED, observational mode exits 0 and emits only a
fixed Actions warning, *both* preserve the BLOCKED and DEGRADED report
fields in `0600` JSON/Markdown, and malformed/missing inputs fail
closed even under warning mode.

Requires exact-commit Vitest, typecheck/static quality, production build,
performance regression and CodeQL. No claim that the production provider
or Route Cache issue is fixed merely because observational CI is green.
