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
      echo "[t58-canary] Original service configuration restored."
    else
      echo "::error::Canary rollback failed; independent 23-minute watchdog retained." >&2
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
    echo "[t58-canary] Diagnostics already enabled; collecting without restart or changing the existing configuration."
    node scripts/t58-stall-canary.mjs observe
    exit 0
    ;;
  CANARY_DISABLED) ;;
  *) echo "canary_invalid_preflight_result" >&2; exit 1 ;;
esac
sudo -n "$control" --t58-canary-probe
activated=1
sudo -n "$control" --t58-canary-start
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
