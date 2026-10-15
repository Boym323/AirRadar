# CodeQL #50 — Network data written to file (integration health)

Date: 2026-10-15. Repository `Boym323/AirRadar`.
CodeQL: `js/http-to-file-access`, source `fetch(url)` and sink
`appendFileSync(process.env.GITHUB_STEP_SUMMARY, ...)` in
`scripts/integration-health-report.mjs`.

## Review

The Integration Health GitHub Action only reads the configured diagnostics URL
(`https://airradar.pomykal.cz/api/system/integrations` by default); it does not
make requests to ADSB.lol itself. The original script constructed a bounded
`summarizeIntegrationHealth()` projection of **numeric counters, allowed
enum states and ISO timestamps**. It never copied arbitrary body text or used
an HTTP response to choose the destination path. The destination
`GITHUB_STEP_SUMMARY` is supplied by the GitHub Actions runner.

Consequently, the alert does not establish attacker-controlled filesystem
paths or an arbitrary-file-write exploit. Nevertheless the summary interpolated
HTTP-derived metrics into a file, and CodeQL's source-to-sink alert remains
relevant even after the earlier field sanitization.

## Fix and observability trade-off

GitHub Step Summary now receives **only a literal, static informational message**
pointing operators to the step's JSON console line, which retains the complete
allowlisted aggregate metrics. No response-derived values are passed to any file
writer from this script. The change intentionally removes live numeric/status
values from the Markdown job summary to eliminate the HTTP-to-file taint flow.
It **does not disable the health check**, affect the red/green exit-code
behavior, suppress CodeQL, or change the API endpoint.

The destination is still the CI-runner's `GITHUB_STEP_SUMMARY` environment
variable; the script does not accept a path from the HTTP payload. It is run
only by the restricted `.github/workflows/integration-health.yml` Action.
No arbitrary remote content should be persisted to any path.

## Regression

`tests/integration-health-report.test.mjs` asserts:

- Provider diagnostic values are projected to allowlisted counters/states.
- Hostile free-form payload fields, Markdown links and control characters
  do not enter the structured console projection.
- File writer appends **exactly** the fixed Markdown literal, never any
  counter, token, status or remotely controlled string, with normal Markdown
  line breaks.

Run full Vitest and static gates, plus CodeQL `security-extended` on the
exact commit. **A green pull-request CodeQL job alone does not confirm that
GitHub's existing alert #50 on `main` has closed**. Verify the
post-merge `main` code-scanning alert independently. If it persists, inspect
the updated taint path before dismissing anything as false-positive.

No production deployment, environment change, or merge is performed by this
security patch.
