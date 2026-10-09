#!/usr/bin/env bash
# Explicit recovery of one previously validated Next.js runtime.
# This never modifies Git, schema, database rows, or release tags.
set -Eeuo pipefail

readonly APP_DIR="/var/www/airradar"
readonly SERVICE_NAME="airradar"
readonly ACTIVE="${APP_DIR}/.next"
readonly PREVIOUS="${APP_DIR}/.next-previous"
readonly CANDIDATE="${APP_DIR}/.next-recovery-candidate-${BASHPID}"
readonly LOCAL_HEALTH="http://192.168.1.142:3000/api/health"
APPLY=0
ACK_SCHEMA=0
EXPECT_ACTIVE=""
EXPECT_PREVIOUS=""
MOVED=0
SWAPPED=0

usage() {
  echo "Usage: sudo bash deploy/recover-previous-build.sh [--apply --acknowledge-schema-compatible --expected-active BUILD_ID --expected-previous BUILD_ID]"
  echo "Default: read-only inspection. Explicit acknowledgement means an operator verified database/schema compatibility."
}

while (( $# > 0 )); do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --acknowledge-schema-compatible) ACK_SCHEMA=1; shift ;;
    --expected-active) (( $# > 1 )) || { usage; exit 2; }; EXPECT_ACTIVE="$2"; shift 2 ;;
    --expected-previous) (( $# > 1 )) || { usage; exit 2; }; EXPECT_PREVIOUS="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[[ "$(pwd -P)" == "${APP_DIR}" ]] || { echo "Run from ${APP_DIR}" >&2; exit 2; }
for dir in "${ACTIVE}" "${PREVIOUS}"; do
  [[ -d "${dir}" && ! -L "${dir}" && -s "${dir}/BUILD_ID" && -f "${dir}/standalone/.airradar-runtime-ready" ]] \
    || { echo "Missing complete non-symlinked runtime: ${dir}" >&2; exit 2; }
done
active_id="$(cat "${ACTIVE}/BUILD_ID")"
previous_id="$(cat "${PREVIOUS}/BUILD_ID")"
echo "Active BUILD_ID: ${active_id}"
echo "Previous BUILD_ID: ${previous_id}"
echo "No database, Git or systemd changes were made during inspection."
if (( APPLY == 0 )); then exit 0; fi

(( EUID == 0 )) || { echo "Apply requires root" >&2; exit 2; }
(( ACK_SCHEMA == 1 )) || { echo "Missing explicit schema-compatibility acknowledgement" >&2; exit 2; }
[[ -n "${EXPECT_ACTIVE}" && "${EXPECT_ACTIVE}" == "${active_id}" ]] \
  || { echo "Active BUILD_ID mismatch" >&2; exit 2; }
[[ -n "${EXPECT_PREVIOUS}" && "${EXPECT_PREVIOUS}" == "${previous_id}" ]] \
  || { echo "Previous BUILD_ID mismatch" >&2; exit 2; }
[[ ! -e "${CANDIDATE}" ]] || { echo "Recovery candidate already exists" >&2; exit 2; }
command -v flock >/dev/null && command -v systemctl >/dev/null && command -v curl >/dev/null \
  || { echo "Required command unavailable" >&2; exit 2; }

exec 9> /var/lock/airradar-release.lock
flock -n 9 || { echo "Another release is in progress" >&2; exit 1; }
exec 8>> /var/lib/airradar/build.lock
flock -n 8 || { echo "Another production build is in progress" >&2; exit 1; }

recover_on_error() {
  local status="$?"
  trap - EXIT
  if (( status != 0 && MOVED == 1 )); then
    echo "Recovery did not pass checks; restoring original active runtime." >&2
    systemctl stop "${SERVICE_NAME}" || true
    if (( SWAPPED == 1 )) && [[ -d "${ACTIVE}" ]]; then
      mv -- "${ACTIVE}" "${PREVIOUS}" || true
    fi
    if [[ -d "${CANDIDATE}" ]]; then
      mv -- "${CANDIDATE}" "${ACTIVE}" || true
    fi
    systemctl start "${SERVICE_NAME}" || true
  fi
  exit "${status}"
}
trap recover_on_error EXIT

systemctl stop "${SERVICE_NAME}"
mv -- "${ACTIVE}" "${CANDIDATE}"
MOVED=1
mv -- "${PREVIOUS}" "${ACTIVE}"
SWAPPED=1
systemctl start "${SERVICE_NAME}"
systemctl is-active --quiet "${SERVICE_NAME}"

healthy=0
for attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 5 "${LOCAL_HEALTH}" \
    | node -e 'let input=""; process.stdin.on("data",b=>input+=b).on("end",()=>{try{const a=JSON.parse(input);process.exit(a.status==="ok"&&a.application?.status==="ok"?0:1)}catch{process.exit(1)}})'; then
    healthy=1
    break
  fi
  sleep 2
done
(( healthy == 1 )) || { echo "Recovered runtime did not pass local health gate" >&2; exit 1; }
# Retain the displaced build for diagnostics. Future deploy replaces this one slot.
mv -- "${CANDIDATE}" "${PREVIOUS}"
MOVED=0
SWAPPED=0
echo "Recovery succeeded; local health OK. Verify public static assets and business functions before closing the incident."
