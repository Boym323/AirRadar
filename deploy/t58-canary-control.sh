#!/usr/bin/env bash
set -Eeuo pipefail
# Trusted root-only subcommand behind the existing sudo-approved release.sh.
[[ "$EUID" -eq 0 && "$#" -eq 1 ]] || { echo "t58_root_or_args_invalid" >&2; exit 1; }
action="$1"
unit=airradar.service
dropin=/etc/systemd/system/airradar.service.d/zz-t58-stall-canary.conf
envfile=/var/www/airradar/.env
rollback_source=/var/www/airradar/deploy/rollback-stall-canary.sh
rollback_copy=/run/airradar-t58-stall-canary/rollback.sh
timer=airradar-t58-stall-canary-rollback
case "$action" in probe|start|stop) ;; *) exit 2 ;; esac
[[ -f "$rollback_source" && ! -L "$rollback_source" && -f "$envfile" && ! -L "$envfile" ]] ||
  { echo "t58_invalid_files" >&2; exit 1; }
unit_path="$(systemctl show --property=FragmentPath --value "$unit")"
case "$unit_path" in
  /etc/systemd/system/airradar.service|/lib/systemd/system/airradar.service|/usr/lib/systemd/system/airradar.service) ;;
  *) echo "t58_unrecognized_service" >&2; exit 1 ;;
esac
if [[ "$action" == "probe" ]]; then
  systemctl is-active --quiet "$unit"
  echo "[t58-canary] Approved release entrypoint is available; no changes made."
  exit 0
fi
exec 9>/var/lock/airradar-release.lock
flock -w 15 9 || { echo "t58_release_busy" >&2; exit 1; }
if [[ "$action" == "stop" ]]; then
  if [[ -e "$dropin" || -L "$dropin" ]]; then
    [[ -f "$dropin" && ! -L "$dropin" ]] || { echo "t58_unexpected_dropin" >&2; exit 1; }
    rm -- "$dropin"
    systemctl daemon-reload
    systemctl restart "$unit"
  fi
  systemctl stop "$timer.timer" >/dev/null 2>&1 || true
  [[ ! -e "$dropin" && ! -L "$dropin" ]] || { echo "t58_dropin_not_removed" >&2; exit 1; }
  if systemctl is-active --quiet "$timer.timer"; then
    echo "t58_watchdog_still_active" >&2; exit 1
  fi
  systemctl is-active --quiet "$unit"
  echo "[t58-canary] Canary override absent; service active and watchdog inactive."
  exit 0
fi
systemctl is-active --quiet "$unit" || { echo "t58_service_unhealthy" >&2; exit 1; }
[[ ! -e "$dropin" && ! -L "$dropin" ]] || { echo "t58_canary_already_active" >&2; exit 1; }
if grep -Eq '^[[:space:]]*AIRRADAR_(STALL_EVIDENCE|T58_CPU_PROFILE)_ENABLED[[:space:]]*=' "$envfile"; then
  echo "t58_existing_env_flag" >&2; exit 1
fi
if systemctl is-active --quiet "$timer.timer"; then echo "t58_watchdog_already_active" >&2; exit 1; fi
# Root-owned copy in /run cannot be modified by the Actions runner.
install -d -o root -g root -m 0700 /run/airradar-t58-stall-canary
install -o root -g root -m 0700 "$rollback_source" "$rollback_copy"
# Arm independent recovery BEFORE changing service configuration.
systemd-run --quiet --unit="$timer" --on-active=23m /bin/bash "$rollback_copy"
started=0
on_exit() {
  local code=$?
  trap - EXIT
  if [[ "$code" != 0 && "$started" == 1 ]]; then
    /bin/bash "$rollback_copy" || echo "t58_rollback_failure_watchdog_still_armed" >&2
  fi
  exit "$code"
}
trap on_exit EXIT
install -d -o root -g root -m 0755 "$(dirname "$dropin")"
temporary="$(mktemp "$dropin.XXXXXX")"
printf '[Service]\nEnvironment="AIRRADAR_STALL_EVIDENCE_ENABLED=1" "AIRRADAR_T58_CPU_PROFILE_ENABLED=1"\n' > "$temporary"
chmod 0644 "$temporary"
started=1
mv -- "$temporary" "$dropin"
systemctl daemon-reload
systemctl restart "$unit"
systemctl is-active --quiet "$unit"
echo "[t58-canary] Diagnostic active; rescue watchdog armed for 23 minutes."
