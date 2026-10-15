# CodeQL code-scanning alerts: runtime persistence and diagnostic audit

Date: 2026-10-15. Branch based on `main` at `7775bf416f019058b32810130e346280ca6c9f34`.

## Reported alerts (screenshot of open alerts on main)

| Alert | Severity | Source / sink | Review and code change |
|---|---|---|---|
| #51 | High | `lib/server/routeset-refusal-persistence.ts:25` | **True TOCTOU risk:** path-based `statSync()` then `readFileSync()` could read a replaced inode. Open one descriptor with `O_NOFOLLOW`, check `fstatSync(fd)`, read that descriptor and always close it; independently enforce max 512 bytes. |
| #42 | High | `lib/notification-preferences.ts:58` | **Dynamic-property-write warning:** the old parser used an externally supplied key even though a fixed allowlist was checked. Construct output exclusively by iterating literal `NOTIFICATION_PREFERENCE_KEYS`, and continue rejecting all unknown/prototype keys. |
| #43 | Medium | `lib/server/notification-preferences.ts:106` | **Intentional private state persistence:** input is strictly enum-only. Reconstruct all six persisted values via literal canonical modes and keys; no raw request object or unknown property is serialized, and preserve the generated update timestamp across restart. |
| #50 | Medium | `scripts/integration-health-report.mjs:90` | **Intentional GitHub Step Summary report:** remote timestamps previously passed through as arbitrary strings. Canonicalize to ISO timestamps or null; whitelist all other status and counter fields. The summary is an operator-controlled GitHub output file, not an arbitrary remote path. |
| #47 / #46 | Medium | `scripts/t56-memory-production-audit.mjs:132-133` | **Intentional authorized memory audit output:** only aggregate projections; strictly filter commit/version/process-store identifiers and bound the output to private, exclusive-create, 2-MiB JSON / 128-KiB Markdown. |
| #45 / #44 | Medium | `scripts/t55-runtime-production-audit.mjs:131-132` | **Intentional authorized runtime audit output:** same controls as T56 and no raw HTTP response, aircraft position, credentials or SQL is persisted. |

## Threat boundaries

Production samplers require a watchlist-admin token **from the environment**, connect only to the configured trusted production HTTPS endpoint or local loopback, and request only authenticated read-only diagnostic endpoints. The reports deliberately contain derived aggregates needed for scientific repeatability and are written to files owned by the executing operator with mode `0600`, never to an HTTP-supplied path. The GitHub Step Summary location comes from the CI runtime environment.

These six `network-data-written-to-file` findings are broad **taint-flow alerts**, not six established data leaks. The fix hardens projections and output controls; it intentionally preserves the report-writing functionality. **A successful CodeQL workflow is not proof that previously open main-branch alerts are closed.** After merge, verify alerts individually against new `main` scanning results; any remaining advisory on a demonstrably expected, restricted write needs explicit security review/triage rather than silent suppression.

## Regression validation

- Deny symlinked refusal state and oversize/corrupt state; preserve cooldown fail-open semantics.
- Deny `__proto__`, `constructor` and unknown preferences; verify atomic persisted settings and unchanged timestamps.
- Reject hostile free-form strings in privileged runtime/memory projections and remote health statuses.
- Test private output `0600` creation, byte caps, no overwrite, no leftover partial JSON when the Markdown target already exists, and invalid paths.
- Full Vitest, typecheck, ESLint, production build, performance regression, CodeQL on the exact PR SHA.
- The security PR is **not** a T58/T59 production optimization or release; do not merge/deploy as part of performance measurement without its own controlled decision.
