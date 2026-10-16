#!/usr/bin/env bash
set -Eeuo pipefail
# A fixed, idempotent emergency rollback; executed by the CI trap or timer.
dropin=/etc/systemd/system/airradar.service.d/zz-t58-stall-canary.conf
if [[ -f "$dropin" ]]; then
  rm -- "$dropin"
  systemctl daemon-reload
  systemctl restart airradar.service
fi
