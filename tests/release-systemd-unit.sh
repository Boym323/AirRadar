#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly TEST_ROOT="$(mktemp -d)"
readonly EVENT_LOG="${TEST_ROOT}/events.log"
readonly SOURCE_UNIT="${PROJECT_DIR}/deploy/airradar.service"
readonly SYSTEMD_ANALYZE_COMMAND="$(command -v systemd-analyze)"
readonly INSTALL_COMMAND="$(command -v install)"
readonly MKtemp_COMMAND="$(command -v mktemp)"
readonly MV_COMMAND="$(command -v mv)"
readonly RM_COMMAND="$(command -v rm)"

cleanup() {
  rm -rf -- "${TEST_ROOT}"
}

trap cleanup EXIT

source "${PROJECT_DIR}/deploy/release.sh"
trap - EXIT
trap - ERR
trap cleanup EXIT

TEST_DESTINATION=""
FAKE_FRAGMENT_PATH="/usr/lib/systemd/system/airradar.service"
FAKE_INSTALL_FAIL=0
FAKE_DAEMON_RELOAD_FAIL=0
FAKE_BAD_CONTRACT=0

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

log_event() {
  printf '%s\n' "$1" >> "${EVENT_LOG}"
}

fake_run_privileged() {
  local command_name="${1:-}"
  shift

  case "${command_name}" in
    systemd-analyze)
      log_event validate
      "${SYSTEMD_ANALYZE_COMMAND}" "$@"
      ;;
    mktemp)
      "${MKtemp_COMMAND}" "$@"
      ;;
    install)
      log_event install
      (( FAKE_INSTALL_FAIL == 0 )) || return 1
      "${INSTALL_COMMAND}" "$@"
      ;;
    mv)
      log_event mv
      "${MV_COMMAND}" "$@"
      ;;
    rm)
      "${RM_COMMAND}" "$@"
      ;;
    test)
      [[ "${1:-}" == "-w" && -w "${2:-}" ]]
      ;;
    systemctl)
      case "${1:-}" in
        show)
          shift
          local property_name=""
          while (( $# > 0 )); do
            if [[ "${1}" == "-p" ]]; then
              property_name="${2}"
              break
            fi
            shift
          done
          log_event "systemctl-show-${property_name}"
          case "${property_name}" in
            FragmentPath)
              printf '%s\n' "${FAKE_FRAGMENT_PATH}"
              ;;
            ExecStart)
              if (( FAKE_BAD_CONTRACT == 1 )); then
                printf '%s\n' '{ path=/usr/bin/npm ; argv[]=/usr/bin/npm run start ; ignore_errors=no }'
              else
                printf '%s\n' "{ path=/usr/bin/node ; argv[]=/usr/bin/node ${PROJECT_DIR}/scripts/start-production.mjs start --hostname 192.168.1.142 --port 3000 ; ignore_errors=no }"
              fi
              ;;
            KillMode)
              printf 'control-group\n'
              ;;
            KillSignal)
              printf '15\n'
              ;;
            WorkingDirectory)
              printf '%s\n' "${PROJECT_DIR}"
              ;;
            EnvironmentFiles)
              printf '%s (ignore_errors=no)\n' "${PROJECT_DIR}/.env"
              ;;
            EnvironmentFile)
              printf '%s\n' "${PROJECT_DIR}/.env"
              ;;
            *)
              return 1
              ;;
          esac
          ;;
        daemon-reload)
          log_event daemon-reload
          (( FAKE_DAEMON_RELOAD_FAIL == 0 ))
          ;;
        restart)
          log_event restart
          ;;
        is-active)
          return 0
          ;;
        *)
          return 1
          ;;
      esac
      ;;
    *)
      fail "Unexpected privileged command: ${command_name}"
      ;;
  esac
}

run_privileged() {
  fake_run_privileged "$@"
}

resolve_test_destination() {
  SYSTEMD_UNIT_DESTINATION="${TEST_DESTINATION}"
}

check_health_with_retries() {
  log_event "health-${1}"
}

assert_file_equals() {
  cmp --silent -- "$1" "$2" || fail "Files differ: $1 and $2"
}

assert_event_present() {
  rg --fixed-strings --line-regexp --quiet -- "$1" "${EVENT_LOG}" || fail "Missing event: $1"
}

assert_event_absent() {
  if rg --fixed-strings --line-regexp --quiet -- "$1" "${EVENT_LOG}"; then
    fail "Unexpected event: $1"
  fi
}

assert_event_before() {
  local first second first_line second_line
  first="$1"
  second="$2"
  first_line="$(rg --fixed-strings --line-number --line-regexp -- "${first}" "${EVENT_LOG}" | head -n 1 | cut -d: -f1)"
  second_line="$(rg --fixed-strings --line-number --line-regexp -- "${second}" "${EVENT_LOG}" | head -n 1 | cut -d: -f1)"
  [[ -n "${first_line}" && -n "${second_line}" && "${first_line}" -lt "${second_line}" ]] || fail "Expected ${first} before ${second}"
}

assert_failure() {
  local description="$1"
  shift

  if ( "$@" ) >"${TEST_ROOT}/${description}.log" 2>&1; then
    fail "Expected failure: ${description}"
  fi
}

prepare_changed_fixture() {
  local changed_source="$1"
  local destination="$2"

  cp -- "${SOURCE_UNIT}" "${changed_source}"
  printf '\n# release unit test fixture\n' >> "${changed_source}"
  cp -- "${SOURCE_UNIT}" "${destination}"
}

test_destination_resolution() {
  : > "${EVENT_LOG}"
  FAKE_FRAGMENT_PATH="/usr/lib/systemd/system/airradar.service"
  resolve_systemd_unit_destination
  [[ "${SYSTEMD_UNIT_DESTINATION}" == "${FAKE_FRAGMENT_PATH}" ]] || fail "FragmentPath was not used as destination"
  assert_event_present systemctl-show-FragmentPath

  FAKE_FRAGMENT_PATH="/run/systemd/system/airradar.service"
  assert_failure nonpersistent-fragment resolve_systemd_unit_destination
}

test_unchanged_unit() {
  local destination="${TEST_ROOT}/unchanged unit.service"

  cp -- "${SOURCE_UNIT}" "${destination}"
  TEST_DESTINATION="${destination}"
  : > "${EVENT_LOG}"
  FAKE_INSTALL_FAIL=0
  FAKE_DAEMON_RELOAD_FAIL=0
  FAKE_BAD_CONTRACT=0
  deploy_systemd_unit "${SOURCE_UNIT}"
  restart_and_check

  assert_event_absent install
  assert_event_absent daemon-reload
  assert_event_present restart
  assert_file_equals "${SOURCE_UNIT}" "${destination}"
}

test_changed_unit() {
  local changed_source="${TEST_ROOT}/changed-source-unit.service"
  local destination="${TEST_ROOT}/changed destination unit.service"

  prepare_changed_fixture "${changed_source}" "${destination}"
  TEST_DESTINATION="${destination}"
  : > "${EVENT_LOG}"
  FAKE_INSTALL_FAIL=0
  FAKE_DAEMON_RELOAD_FAIL=0
  FAKE_BAD_CONTRACT=0
  deploy_systemd_unit "${changed_source}"
  restart_and_check

  assert_event_present validate
  assert_event_present install
  assert_event_present mv
  assert_event_present daemon-reload
  assert_event_present restart
  assert_event_before validate install
  assert_event_before install daemon-reload
  assert_event_before daemon-reload systemctl-show-ExecStart
  assert_event_before systemctl-show-ExecStart restart
  assert_file_equals "${changed_source}" "${destination}"
}

test_invalid_unit() {
  local invalid_source="${TEST_ROOT}/invalid.service"

  printf '[Service\nExecStart=/bin/true\n' > "${invalid_source}"
  TEST_DESTINATION="${TEST_ROOT}/invalid destination.service"
  : > "${EVENT_LOG}"
  assert_failure invalid-unit deploy_systemd_unit "${invalid_source}"
  assert_event_absent install
  assert_event_absent daemon-reload
  assert_event_absent restart
}

test_install_failure() {
  local changed_source="${TEST_ROOT}/install-failure-source.service"
  local destination="${TEST_ROOT}/install failure destination.service"

  prepare_changed_fixture "${changed_source}" "${destination}"
  TEST_DESTINATION="${destination}"
  : > "${EVENT_LOG}"
  FAKE_INSTALL_FAIL=1
  FAKE_DAEMON_RELOAD_FAIL=0
  FAKE_BAD_CONTRACT=0
  assert_failure install-failure attempt_changed_release
  assert_event_present install
  assert_event_absent daemon-reload
  assert_event_absent restart
  assert_file_equals "${SOURCE_UNIT}" "${destination}"
  FAKE_INSTALL_FAIL=0
}

test_daemon_reload_failure() {
  local changed_source="${TEST_ROOT}/reload-failure-source.service"
  local destination="${TEST_ROOT}/reload failure destination.service"

  prepare_changed_fixture "${changed_source}" "${destination}"
  TEST_DESTINATION="${destination}"
  : > "${EVENT_LOG}"
  FAKE_INSTALL_FAIL=0
  FAKE_DAEMON_RELOAD_FAIL=1
  FAKE_BAD_CONTRACT=0
  assert_failure daemon-reload-failure attempt_changed_release
  assert_event_present install
  assert_event_present daemon-reload
  assert_event_absent restart
  assert_file_equals "${changed_source}" "${destination}"
  FAKE_DAEMON_RELOAD_FAIL=0
}

test_verification_failure() {
  local changed_source="${TEST_ROOT}/verification-failure-source.service"
  local destination="${TEST_ROOT}/verification failure destination.service"

  prepare_changed_fixture "${changed_source}" "${destination}"
  TEST_DESTINATION="${destination}"
  : > "${EVENT_LOG}"
  FAKE_INSTALL_FAIL=0
  FAKE_DAEMON_RELOAD_FAIL=0
  FAKE_BAD_CONTRACT=1
  assert_failure verification-failure attempt_changed_release
  assert_event_present daemon-reload
  assert_event_present systemctl-show-ExecStart
  assert_event_absent restart
  assert_file_equals "${changed_source}" "${destination}"
  FAKE_BAD_CONTRACT=0
}

attempt_changed_release() {
  deploy_systemd_unit "${CURRENT_SOURCE:-${SOURCE_UNIT}}"
  restart_and_check
}

CURRENT_SOURCE=""
test_destination_resolution
resolve_systemd_unit_destination() {
  resolve_test_destination
}
CURRENT_SOURCE="${SOURCE_UNIT}"
test_unchanged_unit
CURRENT_SOURCE="${TEST_ROOT}/changed-source-unit.service"
test_changed_unit
CURRENT_SOURCE=""
test_invalid_unit
CURRENT_SOURCE="${TEST_ROOT}/install-failure-source.service"
test_install_failure
CURRENT_SOURCE="${TEST_ROOT}/reload-failure-source.service"
test_daemon_reload_failure
CURRENT_SOURCE="${TEST_ROOT}/verification-failure-source.service"
test_verification_failure

printf 'release systemd unit tests passed\n'
