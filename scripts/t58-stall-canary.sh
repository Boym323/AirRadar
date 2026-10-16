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
dropin=/etc/systemd/system/airradar.service.d/zz-t58-stall-canary.conf
rollback=/var/www/airradar/deploy/rollback-stall-canary.sh
watchdog=airradar-t58-stall-canary-rollback
activated=0
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$activated" == 1 ]]; then
    if sudo -n bash "$rollback"; then
      sudo -n systemctl stop "$watchdog.timer" >/dev/null 2>&1 || true
      echo "[t58-canary] Restored original service environment."
    else
      echo "::error::Canary rollback failed; independent systemd watchdog retained." >&2
      result=1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
sudo -n systemctl is-active --quiet airradar.service || { echo "canary_service_unhealthy" >&2; exit 1; }
if sudo -n test -e "$dropin"; then echo "canary_dropin_already_exists" >&2; exit 1; fi
if sudo -n grep -q '^AIRRADAR_STALL_EVIDENCE_ENABLED=' /var/www/airradar/.env; then
  echo "canary_existing_flag_refused" >&2; exit 1
fi
sudo -n test -f "$rollback" || { echo "canary_rollback_unavailable" >&2; exit 1; }
command -v systemd-run >/dev/null || { echo "canary_watchdog_unavailable" >&2; exit 1; }
node scripts/t58-stall-canary.mjs preflight
sudo -n install -d -o root -g root -m 0755 /etc/systemd/system/airradar.service.d
activated=1
printf '[Service]\nEnvironment="AIRRADAR_STALL_EVIDENCE_ENABLED=1"\n' | sudo -n tee "$dropin" >/dev/null
sudo -n chmod 0644 "$dropin"
sudo -n systemctl daemon-reload
sudo -n systemd-run --unit="$watchdog" --on-active=23m /bin/bash "$rollback" >/dev/null
sudo -n systemctl restart airradar.service
echo "[t58-canary] Flag enabled. Watchdog rollback armed."
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
