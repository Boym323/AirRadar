#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ "$GITHUB_EVENT_NAME" != workflow_run || "$GITHUB_ACTIONS" != true ]]; then
  echo "canary_requires_trusted_workflow" >&2; exit 1
fi
if [[ ! "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ || -z "$T58_CANARY_OUTPUT" ]]; then
  echo "canary_missing_expected_identity" >&2; exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$EXPECTED_SHA" ]]; then
  echo "canary_checkout_mismatch" >&2; exit 1
fi
# The production runner can sudo only the already-approved release entrypoint,
# not unrestricted systemctl. This route never grants new sudo privileges.
control=/var/www/airradar/deploy/release.sh
activated=0
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$activated" == 1 ]]; then
    if sudo -n "$control" --t58-canary-stop; then
      # A successful systemctl command alone does not establish restoration.
      # Require the pinned production process to report disabled diagnostics
      # and healthy native acceleration after the controlled restart.
      if node scripts/t58-stall-canary.mjs verify-restored; then
        echo "[t58-canary] Rollback verified: original service settings and disabled diagnostics."
      else
        echo "::error::Canary rollback unverified: production diagnostics did not return to disabled state on the expected healthy commit." >&2
        result=1
      fi
    else
      echo "::error::Canary rollback failed; independent 23-minute watchdog may still be armed." >&2
      result=1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# Verify that the read-only production diagnostics and native Rust path are
# healthy BEFORE any privileged canary command or restart.
preflight_status="$(node scripts/t58-stall-canary.mjs preflight)"
case "$preflight_status" in
  CANARY_ALREADY_ENABLED)
    # Never claim a controlled enable/restore cycle when the initial state is
    # already enabled. Do not alter a configuration this job did not create.
    echo "::error::Canary blocked: diagnostics were enabled before this run. No restart or rollback was attempted; independently verify production configuration." >&2
    exit 1
    ;;
  CANARY_DISABLED) ;;
  *) echo "canary_invalid_preflight_result" >&2; exit 1 ;;
esac
sudo -n "$control" --t58-canary-probe
# The privileged helper has its own fail-safe rollback on activation error.
# Do NOT claim ownership or call stop unless it positively confirms start:
# an already-active canary may belong to a different invocation.
if ! sudo -n "$control" --t58-canary-start; then
  echo "::error::Canary activation failed. Runner will not stop an override it did not start; check root-helper rollback/watchdog." >&2
  exit 1
fi
activated=1
echo "[t58-canary] Temporary diagnostic enabled via approved deployment entrypoint."
# Permit the standalone process to finish bootstrap before authenticated probes.
ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 3 --max-time 5 https://airradar.pomykal.cz/api/version >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 3
done
if [[ "$ready" != 1 ]]; then echo "canary_startup_timeout" >&2; exit 1; fi
node scripts/t58-stall-canary.mjs observe
# EXIT trap restores the flag and restarts the service, including on failure.
