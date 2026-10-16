#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/var/www/airradar"
readonly ENV_FILE="${APP_DIR}/.env"
readonly SERVICE="airradar.service"

[[ "$(id -u)" == "0" ]] || { echo "Run as root." >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}." >&2; exit 1; }

backup="${ENV_FILE}.native-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
install -o airradar -g airradar -m 0600 "${ENV_FILE}" "${backup}"

tmp="$(mktemp "${ENV_FILE}.rollback.XXXXXX")"
trap 'rm -f -- "${tmp}"' EXIT
awk '
  !/^AIRRADAR_NATIVE_BEAST=/ &&
  !/^AIRRADAR_NATIVE_ADDON_PATH=/ &&
  !/^AIRRADAR_NATIVE_BEAST_PARSER=/ &&
  !/^AIRRADAR_NATIVE_BEAST_CRC=/ &&
  !/^AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED=/ { print }
' "${ENV_FILE}" >"${tmp}"
cat >>"${tmp}" <<'EOF'
AIRRADAR_NATIVE_BEAST=0
AIRRADAR_NATIVE_BEAST_PARSER=0
AIRRADAR_NATIVE_BEAST_CRC=0
AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED=0
EOF
chown airradar:airradar "${tmp}"
chmod 0600 "${tmp}"
mv -f -- "${tmp}" "${ENV_FILE}"
systemctl restart "${SERVICE}"
systemctl is-active --quiet "${SERVICE}"
curl --fail --silent --show-error --max-time 15 http://192.168.1.142:3000/api/health >/dev/null
echo "Native acceleration rolled back; TypeScript fallback is active. Backup: ${backup}"
