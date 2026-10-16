#!/usr/bin/env bash
set -Eeuo pipefail
# Idempotent root-owned rescue script; never accepts untrusted input.
dropin=/etc/systemd/system/airradar.service.d/zz-t58-stall-canary.conf
unit=airradar.service
timer=airradar-t58-stall-canary-rollback
if [[ -e "$dropin" || -L "$dropin" ]]; then
  [[ -f "$dropin" && ! -L "$dropin" ]] || { echo "t58_unsafe_dropin" >&2; exit 1; }
  rm -- "$dropin"
  systemctl daemon-reload
  systemctl restart "$unit"
fi
systemctl stop "$timer.timer" >/dev/null 2>&1 || true
systemctl is-active --quiet "$unit"
