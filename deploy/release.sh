#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly EXPECTED_APP_DIR="/var/www/airradar"
readonly LOCK_FILE="/var/lock/airradar-release.lock"
readonly BUILD_LOCK_FILE="/run/airradar-build.lock"
readonly SERVICE_NAME="airradar"
readonly PUBLIC_HEALTH_URL="https://airradar.pomykal.cz/api/health"
# The service binds to the production LAN address so the separate Nginx Proxy
# Manager host can reach it; loopback is intentionally not a listener.
readonly LOCAL_HEALTH_URL="http://192.168.1.142:3000/api/health"
readonly HEALTH_ATTEMPTS=15
readonly HEALTH_DELAY_SECONDS=2
readonly PUBLIC_HEALTH_ATTEMPTS=3
readonly PUBLIC_HEALTH_DELAY_SECONDS=2
readonly SYSTEMD_UNIT_SOURCE="${APP_DIR}/deploy/airradar.service"
readonly VERSION_SCRIPT="${APP_DIR}/scripts/version.mjs"
readonly CHANGELOG_SCRIPT="${APP_DIR}/scripts/changelog.mjs"
readonly EXPECTED_SYSTEMD_UNIT_NAME="${SERVICE_NAME}.service"
readonly EXPECTED_PRODUCTION_ENTRYPOINT="${APP_DIR}/scripts/start-production.mjs"
readonly EXPECTED_ENVIRONMENT_FILE="${APP_DIR}/.env"
readonly RUNTIME_STATE_DIRECTORY="/var/lib/airradar"
readonly LEGACY_ALERT_CONFIG_PATH="${APP_DIR}/data/alerts.json"

DEPLOY_BRANCH="main"
RELEASE_MODE="stable"
RELEASE_BUILD_CHANNEL="production"
DRY_RUN=0
ALLOW_DIRTY=0
OLD_SHA=""
NEW_SHA=""
RESTART_ATTEMPTED=0
ERROR_REPORTED=0
DIAGNOSTICS_PRINTED=0
HEALTH_SUMMARY=""
WORKTREE_DIRTY=0
SYSTEMD_UNIT_DESTINATION=""
SYSTEMD_UNIT_CHANGED=0
RELEASE_VERSION=""
RELEASE_TAG=""
RELEASE_BUILD_TIME=""
STARTED_AT="$(date --iso-8601=seconds)"
STARTED_EPOCH="$(date +%s)"

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/release.sh [options]

Options:
  --branch BRANCH  Release the current checkout of BRANCH instead of main.
  --channel MODE    Release channel: stable (default) or rc.
  --allow-dirty    Release uncommitted changes without updating from origin.
  --dry-run        Run preflight checks and print the release plan only.
  --help           Show this help.

The default release always runs all quality gates, including tests.
EOF
}

log() {
  printf '[AirRadar release] %s\n' "$*"
}

warn() {
  printf '[AirRadar release] WARNING: %s\n' "$*" >&2
}

error() {
  printf '[AirRadar release] ERROR: %s\n' "$*" >&2
}

die() {
  error "$*"
  exit 1
}

run_privileged() {
  if (( EUID == 0 )); then
    "$@"
  else
    sudo -n "$@"
  fi
}

print_summary() {
  local finished_at duration_seconds old_sha new_sha

  finished_at="$(date --iso-8601=seconds)"
  duration_seconds=$(( $(date +%s) - STARTED_EPOCH ))
  old_sha="${OLD_SHA:-<not captured>}"
  new_sha="${NEW_SHA:-<not captured>}"

  log "Started: ${STARTED_AT}"
  log "Finished: ${finished_at}"
  log "Duration: ${duration_seconds}s"
  log "OLD_SHA: ${old_sha}"
  log "NEW_SHA: ${new_sha}"
}

show_failure_diagnostics() {
  if (( DIAGNOSTICS_PRINTED == 1 )); then
    return
  fi
  DIAGNOSTICS_PRINTED=1

  error "Post-restart diagnostics: systemd status"
  run_privileged systemctl --no-pager --full status "${SERVICE_NAME}" || true
  error "Post-restart diagnostics: recent journal"
  run_privileged journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true
}

on_error() {
  local exit_code="$1"
  local line_number="$2"

  if (( exit_code == 0 )); then
    return
  fi

  ERROR_REPORTED=1
  error "Unexpected command failure at line ${line_number} (exit ${exit_code})."
  if (( RESTART_ATTEMPTED == 1 )); then
    show_failure_diagnostics
  fi
}

on_exit() {
  local exit_code="$?"

  trap - EXIT
  if (( exit_code != 0 )); then
    if (( ERROR_REPORTED == 0 )); then
      error "Release failed."
    fi
    if (( RESTART_ATTEMPTED == 1 )); then
      error "No automatic code or database rollback was attempted; recover manually after checking migration compatibility."
      show_failure_diagnostics
    fi
  fi
  print_summary || true
  exit "${exit_code}"
}

trap 'on_error "$?" "$LINENO"' ERR
trap 'on_exit' EXIT

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --branch)
        (( $# >= 2 )) || die "--branch requires a branch name."
        DEPLOY_BRANCH="$2"
        shift 2
        ;;
      --channel)
        (( $# >= 2 )) || die "--channel requires stable or rc."
        case "$2" in
          stable)
            RELEASE_MODE="stable"
            RELEASE_BUILD_CHANNEL="production"
            ;;
          rc)
            RELEASE_MODE="rc"
            RELEASE_BUILD_CHANNEL="release-candidate"
            ;;
          *)
            die "Unsupported release channel: $2 (expected stable or rc)."
            ;;
        esac
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --allow-dirty)
        ALLOW_DIRTY=1
        shift
        ;;
      --help|-h)
        usage
        trap - EXIT
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
}

require_command() {
  local command_name="$1"

  command -v "${command_name}" >/dev/null 2>&1 || die "Required command is not available: ${command_name}"
}

git_cmd() {
  if (( EUID == 0 )); then
    GIT_TERMINAL_PROMPT=0 git -c "safe.directory=${APP_DIR}" -C "${APP_DIR}" "$@"
  else
    GIT_TERMINAL_PROMPT=0 git -C "${APP_DIR}" "$@"
  fi
}

check_node_version() {
  local required_node current_node

  required_node="$(node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); process.stdout.write(pkg.engines?.node ?? "");')"
  [[ -n "${required_node}" ]] || die "package.json does not declare a Node.js engine requirement."

  current_node="$(node --version)"
  if ! node -e '
    const [actualRaw, requirement] = process.argv.slice(1);
    const actual = actualRaw.replace(/^v/, "").split(".").map(Number);
    const match = requirement.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
    if (!match || actual.length < 3 || actual.some(Number.isNaN)) process.exit(2);
    const minimum = match.slice(1).map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (actual[index] > minimum[index]) process.exit(0);
      if (actual[index] < minimum[index]) process.exit(1);
    }
    process.exit(0);
  ' "${current_node}" "${required_node}"; then
    die "Node.js ${current_node} does not satisfy package.json engines.node (${required_node})."
  fi

  log "Node.js ${current_node} satisfies package.json engines.node (${required_node})"
}

check_repository() {
  local git_root current_branch status_line dirty_status

  [[ "${APP_DIR}" == "${EXPECTED_APP_DIR}" ]] || die "This release script must run from ${EXPECTED_APP_DIR}; resolved ${APP_DIR}."
  [[ -f "${APP_DIR}/package.json" ]] || die "Missing ${APP_DIR}/package.json."
  [[ -f "${APP_DIR}/package-lock.json" ]] || die "Missing ${APP_DIR}/package-lock.json; npm ci cannot run safely."
  [[ -f "${APP_DIR}/deploy/airradar.service" ]] || die "Missing ${APP_DIR}/deploy/airradar.service."
  [[ -f "${VERSION_SCRIPT}" ]] || die "Missing ${VERSION_SCRIPT}."
  [[ -f "${CHANGELOG_SCRIPT}" ]] || die "Missing ${CHANGELOG_SCRIPT}."
  [[ -f "${APP_DIR}/.env" ]] || die "Missing ${APP_DIR}/.env."

  git_root="$(git_cmd rev-parse --show-toplevel 2>/dev/null)" || die "${APP_DIR} is not a Git repository."
  git_root="$(cd -- "${git_root}" && pwd -P)"
  [[ "${git_root}" == "${APP_DIR}" ]] || die "Git repository root is ${git_root}, expected ${APP_DIR}."

  current_branch="$(git_cmd branch --show-current)"
  [[ -n "${current_branch}" ]] || die "The checkout is detached; release requires a named branch."
  git_cmd check-ref-format --branch "${DEPLOY_BRANCH}" >/dev/null 2>&1 || die "Invalid release branch name: ${DEPLOY_BRANCH}"
  [[ "${current_branch}" == "${DEPLOY_BRANCH}" ]] || die "Current branch is ${current_branch}; expected ${DEPLOY_BRANCH}. Use --branch explicitly if this is intentional."
  git_cmd remote get-url origin >/dev/null 2>&1 || die "Git remote origin is not configured."

  if (( ALLOW_DIRTY == 0 )); then
    dirty_status="$(git_cmd status --porcelain)"
    while IFS= read -r status_line; do
      [[ -z "${status_line}" ]] && continue
      error "Working tree contains tracked, staged, or untracked changes:"
      printf '%s\n' "${dirty_status}" >&2
      die "Refusing to update a dirty production checkout. Use --allow-dirty to release the current working tree without updating from origin."
    done <<< "${dirty_status}"
  fi
}

check_permissions() {
  if (( EUID != 0 )); then
    require_command sudo
    if ! sudo -n -v >/dev/null 2>&1; then
      die "This release needs root or passwordless sudo for systemd unit deployment and systemctl restart ${SERVICE_NAME}."
    fi
  fi
}

preflight() {
  log "Preflight"
  cd -- "${APP_DIR}"

  require_command node
  require_command npm
  require_command git
  require_command systemctl
  require_command curl
  require_command flock
  require_command systemd-analyze
  require_command install
  require_command mktemp
  require_command cmp
  require_command mv
  check_repository
  check_node_version
  check_permissions

  log "Preflight checks passed"
}

acquire_lock() {
  exec 9>"${LOCK_FILE}" || die "Cannot open release lock ${LOCK_FILE}."
  if ! flock -n 9; then
    die "Another AirRadar release is already running."
  fi
  log "Release lock acquired: ${LOCK_FILE}"
}

acquire_build_lock() {
  if [[ ! -e "${BUILD_LOCK_FILE}" ]]; then
    run_privileged install -o root -g root -m 0666 /dev/null "${BUILD_LOCK_FILE}" || die "Cannot create build lock ${BUILD_LOCK_FILE}."
  else
    run_privileged chmod 0666 "${BUILD_LOCK_FILE}" || die "Cannot make build lock accessible to ${SERVICE_NAME}: ${BUILD_LOCK_FILE}."
  fi

  exec 8>>"${BUILD_LOCK_FILE}" || die "Cannot open build lock ${BUILD_LOCK_FILE}."
  if ! flock -n 8; then
    die "Another AirRadar production build is already running."
  fi
  log "Build lock acquired: ${BUILD_LOCK_FILE}"
}

release_build_lock() {
  flock -u 8 || true
  exec 8>&-
  log "Build lock released: ${BUILD_LOCK_FILE}"
}

detect_worktree_changes() {
  local dirty_status

  dirty_status="$(git_cmd status --porcelain)"
  if [[ -z "${dirty_status}" ]]; then
    WORKTREE_DIRTY=0
    return
  fi

  WORKTREE_DIRTY=1
  warn "Working tree has uncommitted changes; releasing the current working tree."
  printf '%s\n' "${dirty_status}" >&2
}

update_repository() {
  local remote_ref remote_sha merge_base

  OLD_SHA="$(git_cmd rev-parse HEAD)"
  log "Current commit: ${OLD_SHA}"

  if (( WORKTREE_DIRTY == 1 )); then
    warn "Skipping origin/${DEPLOY_BRANCH} update to preserve uncommitted changes. Commit or stash them before a release that must include remote updates."
    NEW_SHA="${OLD_SHA}"
    return
  fi

  log "Updating repository from origin/${DEPLOY_BRANCH}"
  git_cmd fetch origin "${DEPLOY_BRANCH}"

  remote_ref="refs/remotes/origin/${DEPLOY_BRANCH}"
  git_cmd show-ref --verify --quiet "${remote_ref}" || die "Fetched origin/${DEPLOY_BRANCH}, but its remote-tracking ref is unavailable."
  remote_sha="$(git_cmd rev-parse "${remote_ref}")"
  merge_base="$(git_cmd merge-base HEAD "${remote_ref}")"

  if [[ "${merge_base}" != "${OLD_SHA}" && "${merge_base}" != "${remote_sha}" ]]; then
    die "Local ${DEPLOY_BRANCH} and origin/${DEPLOY_BRANCH} have divergent history; refusing to merge on production."
  fi

  if [[ "${OLD_SHA}" == "${remote_sha}" ]]; then
    log "No new commit; validating current release."
  elif [[ "${merge_base}" == "${OLD_SHA}" ]]; then
    log "Fast-forwarding ${DEPLOY_BRANCH} to ${remote_sha}"
    git_cmd merge --ff-only "${remote_ref}"
  else
    log "Local ${DEPLOY_BRANCH} is ahead of origin/${DEPLOY_BRANCH}; keeping the local fast-forward-only state."
  fi

  NEW_SHA="$(git_cmd rev-parse HEAD)"
  log "New commit: ${NEW_SHA}"
}

prepare_release_version() {
  local resolved_version

  resolved_version="$(node "${VERSION_SCRIPT}" resolve-release-version --channel "${RELEASE_MODE}")" || die "Could not resolve the release version."
  if [[ "${RELEASE_MODE}" == "rc" ]]; then
    [[ "${resolved_version}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.[1-9][0-9]*$ ]] || die "Version helper returned an invalid RC version: ${resolved_version}"
  else
    [[ "${resolved_version}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die "Version helper returned an invalid stable version: ${resolved_version}"
  fi

  RELEASE_VERSION="${resolved_version}"
  RELEASE_TAG="v${RELEASE_VERSION}"
  export AIRRADAR_VERSION="${RELEASE_VERSION}"
  export AIRRADAR_TAG="${RELEASE_TAG}"
  export AIRRADAR_COMMIT="${NEW_SHA}"
  export AIRRADAR_CHANNEL="${RELEASE_BUILD_CHANNEL}"
  log "Release version candidate: ${RELEASE_VERSION} (${RELEASE_TAG}), channel=${RELEASE_BUILD_CHANNEL}"
}

generate_release_changelog() {
  local release_date

  release_date="$(date --utc +%F)"
  log "Generating changelog for ${RELEASE_TAG}"
  node "${CHANGELOG_SCRIPT}" generate "${RELEASE_VERSION}" "${release_date}"

  if git_cmd diff --quiet -- CHANGELOG.md; then
    log "Changelog unchanged"
    return 0
  fi

  git_cmd add -- CHANGELOG.md
  git_cmd commit -m "docs: update changelog for ${RELEASE_TAG}"
  NEW_SHA="$(git_cmd rev-parse HEAD)"
  export AIRRADAR_COMMIT="${NEW_SHA}"
  log "Changelog committed at ${NEW_SHA}"
}

run_release_steps() {
  log "Installing dependencies"
  npm ci --prefer-offline --no-audit --no-fund

  log "Generating Prisma contract"
  npm run prisma:generate

  run_quality_gates

  log "Building production app"
  acquire_build_lock
  RELEASE_BUILD_TIME="$(date --utc --iso-8601=seconds)"
  export AIRRADAR_BUILD_TIME="${RELEASE_BUILD_TIME}"
  npm run build
  release_build_lock

  log "Applying database migrations"
  npm run prisma:deploy
}

run_quality_gates() {
  local lint_pid typecheck_pid tests_pid
  local lint_status=0 typecheck_status=0 tests_status=0

  log "Running lint, typecheck, and tests in parallel"
  npm run lint &
  lint_pid=$!
  npm run typecheck &
  typecheck_pid=$!
  npm test -- --pool=threads &
  tests_pid=$!

  wait "${lint_pid}" || lint_status=$?
  wait "${typecheck_pid}" || typecheck_status=$?
  wait "${tests_pid}" || tests_status=$?

  if (( lint_status != 0 || typecheck_status != 0 || tests_status != 0 )); then
    die "Quality gates failed (lint=${lint_status}, typecheck=${typecheck_status}, tests=${tests_status})."
  fi

  log "Quality gates passed"
}

validate_repository_systemd_unit() {
  local unit_source="$1"

  [[ -f "${unit_source}" ]] || die "Missing repository systemd unit: ${unit_source}"
  [[ ! -L "${unit_source}" ]] || die "Repository systemd unit must not be a symlink: ${unit_source}"

  log "Validating repository systemd unit: ${unit_source}"
  if ! run_privileged systemd-analyze verify -- "${unit_source}"; then
    die "Repository systemd unit validation failed: ${unit_source}"
  fi
}

validate_systemd_unit_destination() {
  local destination="$1"
  local destination_directory

  case "${destination}" in
    /etc/systemd/system/${EXPECTED_SYSTEMD_UNIT_NAME}|/usr/lib/systemd/system/${EXPECTED_SYSTEMD_UNIT_NAME}|/lib/systemd/system/${EXPECTED_SYSTEMD_UNIT_NAME})
      ;;
    *)
      die "Unsupported or non-persistent systemd FragmentPath for ${SERVICE_NAME}: ${destination}"
      ;;
  esac

  destination_directory="$(dirname -- "${destination}")"
  [[ -d "${destination_directory}" ]] || die "Systemd unit destination directory does not exist: ${destination_directory}"
  if ! run_privileged test -w "${destination_directory}"; then
    die "Systemd unit destination directory is not writable: ${destination_directory}"
  fi
  [[ ! -L "${destination}" ]] || die "Systemd unit destination must not be a symlink: ${destination}"
  [[ ! -e "${destination}" || -f "${destination}" ]] || die "Systemd unit destination is not a regular file: ${destination}"
}

resolve_systemd_unit_destination() {
  local fragment_path

  if ! fragment_path="$(run_privileged systemctl show "${SERVICE_NAME}" -p FragmentPath --value)"; then
    die "Could not determine FragmentPath for ${SERVICE_NAME}."
  fi
  [[ -n "${fragment_path}" ]] || die "systemd returned an empty FragmentPath for ${SERVICE_NAME}."

  validate_systemd_unit_destination "${fragment_path}"
  SYSTEMD_UNIT_DESTINATION="${fragment_path}"
  log "Systemd unit destination: ${SYSTEMD_UNIT_DESTINATION}"
}

show_loaded_unit_property() {
  local property_name="$1"

  run_privileged systemctl show "${SERVICE_NAME}" -p "${property_name}" --value
}

verify_loaded_systemd_unit_contract() {
  local exec_start kill_mode kill_signal working_directory environment_files environment_file
  local state_directory state_directory_mode protect_system

  log "Verifying loaded ${SERVICE_NAME}.service contract"
  exec_start="$(show_loaded_unit_property ExecStart)" || die "Could not read loaded ExecStart for ${SERVICE_NAME}."
  kill_mode="$(show_loaded_unit_property KillMode)" || die "Could not read loaded KillMode for ${SERVICE_NAME}."
  kill_signal="$(show_loaded_unit_property KillSignal)" || die "Could not read loaded KillSignal for ${SERVICE_NAME}."
  working_directory="$(show_loaded_unit_property WorkingDirectory)" || die "Could not read loaded WorkingDirectory for ${SERVICE_NAME}."
  environment_files="$(show_loaded_unit_property EnvironmentFiles)" || die "Could not read loaded EnvironmentFiles for ${SERVICE_NAME}."
  state_directory="$(show_loaded_unit_property StateDirectory)" || die "Could not read loaded StateDirectory for ${SERVICE_NAME}."
  state_directory_mode="$(show_loaded_unit_property StateDirectoryMode)" || die "Could not read loaded StateDirectoryMode for ${SERVICE_NAME}."
  protect_system="$(show_loaded_unit_property ProtectSystem)" || die "Could not read loaded ProtectSystem for ${SERVICE_NAME}."

  if [[ -z "${environment_files}" ]]; then
    environment_file="$(show_loaded_unit_property EnvironmentFile)" || die "Could not read loaded EnvironmentFile for ${SERVICE_NAME}."
  else
    environment_file="${environment_files}"
  fi

  [[ "${exec_start}" == *"${EXPECTED_PRODUCTION_ENTRYPOINT}"* ]] || die "Loaded ExecStart does not use ${EXPECTED_PRODUCTION_ENTRYPOINT}."
  [[ "${exec_start}" != *"npm run start"* ]] || die "Loaded ExecStart still uses npm run start."
  [[ "${kill_mode}" == "control-group" ]] || die "Loaded KillMode is ${kill_mode}; expected control-group."
  [[ "${kill_signal}" == "SIGTERM" || "${kill_signal}" == "15" ]] || die "Loaded KillSignal is ${kill_signal}; expected SIGTERM."
  [[ "${working_directory}" == "${APP_DIR}" ]] || die "Loaded WorkingDirectory is ${working_directory}; expected ${APP_DIR}."
  [[ "${environment_file}" == *"${EXPECTED_ENVIRONMENT_FILE}"* ]] || die "Loaded EnvironmentFile does not include ${EXPECTED_ENVIRONMENT_FILE}."
  [[ "${state_directory}" == "airradar" || "${state_directory}" == "${RUNTIME_STATE_DIRECTORY}" ]] || die "Loaded StateDirectory is ${state_directory}; expected airradar."
  [[ "${state_directory_mode}" == "0750" || "${state_directory_mode}" == "488" ]] || die "Loaded StateDirectoryMode is ${state_directory_mode}; expected 0750."
  [[ "${protect_system}" == "strict" ]] || die "Loaded ProtectSystem is ${protect_system}; expected strict."
}

migrate_legacy_alert_config() {
  local legacy_path="${1:-${LEGACY_ALERT_CONFIG_PATH}}"
  local state_directory="${2:-${RUNTIME_STATE_DIRECTORY}}"
  local target_path="${state_directory}/alerts.json"
  local temporary_path=""

  [[ -f "${legacy_path}" ]] || {
    log "No legacy alert config found; state-directory config will be created on demand."
    return 0
  }

  if run_privileged test -e "${target_path}"; then
    log "Runtime alert config already exists; preserving it: ${target_path}"
    return 0
  fi

  run_privileged install -d -o airradar -g airradar -m 0750 -- "${state_directory}" \
    || die "Could not create runtime state directory ${state_directory}."
  if run_privileged test -e "${target_path}"; then
    log "Runtime alert config appeared during migration; preserving it: ${target_path}"
    return 0
  fi

  temporary_path="$(run_privileged mktemp --tmpdir="${state_directory}" '.alerts.json.migration.XXXXXX')" \
    || die "Could not create a temporary alert config in ${state_directory}."
  if ! run_privileged install -o airradar -g airradar -m 0600 -- "${legacy_path}" "${temporary_path}"; then
    run_privileged rm -f -- "${temporary_path}" || true
    die "Could not copy the legacy alert config to ${state_directory}."
  fi
  if ! run_privileged mv -n -- "${temporary_path}" "${target_path}"; then
    run_privileged rm -f -- "${temporary_path}" || true
    die "Could not activate the migrated alert config at ${target_path}."
  fi
  run_privileged rm -f -- "${temporary_path}" || true

  run_privileged test -e "${target_path}" \
    || die "Alert config migration did not create ${target_path}."
  log "Migrated legacy alert config to ${target_path}; future writes use the state directory."
}

install_systemd_unit() {
  local unit_source="$1"
  local destination="$2"
  local destination_directory temporary_unit=""

  destination_directory="$(dirname -- "${destination}")"
  if ! temporary_unit="$(run_privileged mktemp --tmpdir="${destination_directory}" ".${EXPECTED_SYSTEMD_UNIT_NAME}.XXXXXX")"; then
    die "Could not create temporary systemd unit beside ${destination}."
  fi

  if ! run_privileged install -o root -g root -m 0644 -- "${unit_source}" "${temporary_unit}"; then
    run_privileged rm -f -- "${temporary_unit}" || true
    die "Could not install repository systemd unit to ${destination}."
  fi

  if ! run_privileged mv -f -- "${temporary_unit}" "${destination}"; then
    run_privileged rm -f -- "${temporary_unit}" || true
    die "Could not activate installed systemd unit at ${destination}."
  fi
}

deploy_systemd_unit() {
  local unit_source="${1:-${SYSTEMD_UNIT_SOURCE}}"
  local destination_status

  validate_repository_systemd_unit "${unit_source}"
  resolve_systemd_unit_destination

  if [[ -f "${SYSTEMD_UNIT_DESTINATION}" ]]; then
    if cmp --silent -- "${unit_source}" "${SYSTEMD_UNIT_DESTINATION}"; then
      SYSTEMD_UNIT_CHANGED=0
      log "Systemd unit unchanged"
    else
      destination_status="$?"
      [[ "${destination_status}" == "1" ]] || die "Could not compare repository and installed systemd units."
      SYSTEMD_UNIT_CHANGED=1
    fi
  else
    SYSTEMD_UNIT_CHANGED=1
  fi

  if (( SYSTEMD_UNIT_CHANGED == 1 )); then
    log "Systemd unit updated"
    install_systemd_unit "${unit_source}" "${SYSTEMD_UNIT_DESTINATION}"
    if ! run_privileged systemctl daemon-reload; then
      die "systemd daemon-reload failed; refusing to restart ${SERVICE_NAME}."
    fi
    log "Systemd daemon reloaded"
  fi

  verify_loaded_systemd_unit_contract
}

health_check_once() {
  local url="$1"
  local response_file http_code summary

  response_file="$(mktemp)"
  if ! http_code="$(curl --silent --show-error --location --max-time 10 --output "${response_file}" --write-out '%{http_code}' "${url}")"; then
    rm -f -- "${response_file}"
    return 1
  fi

  if [[ ! "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
    rm -f -- "${response_file}"
    return 1
  fi

  if ! summary="$(node -e '
    const fs = require("node:fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) process.exit(1);
    if (body.application?.status !== "ok" || body.status !== "ok") process.exit(2);
    process.stdout.write(`status=${body.status ?? "unknown"} application=${body.application.status}`);
  ' "${response_file}")"; then
    rm -f -- "${response_file}"
    return 1
  fi

  rm -f -- "${response_file}"
  HEALTH_SUMMARY="${summary}"
  return 0
}

check_health_with_retries() {
  local label="$1"
  local url="$2"
  local attempts="$3"
  local delay_seconds="$4"
  local critical="$5"
  local attempt

  log "Checking ${label} health: ${url}"
  for (( attempt = 1; attempt <= attempts; attempt += 1 )); do
    if health_check_once "${url}"; then
      log "${label} health passed (${HEALTH_SUMMARY})"
      return 0
    fi
    warn "${label} health attempt ${attempt}/${attempts} failed."
    if (( attempt < attempts )); then
      sleep "${delay_seconds}"
    fi
  done

  if (( critical == 1 )); then
    die "${label} health check failed after ${attempts} attempts."
  fi
  warn "${label} health check failed; continuing because public reachability may be affected by DNS or hairpin routing."
  return 0
}

restart_and_check() {
  log "Restarting ${SERVICE_NAME}.service"
  RESTART_ATTEMPTED=1
  run_privileged systemctl restart "${SERVICE_NAME}"
  if ! run_privileged systemctl is-active --quiet "${SERVICE_NAME}"; then
    die "${SERVICE_NAME}.service is not active after restart."
  fi

  check_health_with_retries "Local" "${LOCAL_HEALTH_URL}" "${HEALTH_ATTEMPTS}" "${HEALTH_DELAY_SECONDS}" 1
  check_health_with_retries "Public" "${PUBLIC_HEALTH_URL}" "${PUBLIC_HEALTH_ATTEMPTS}" "${PUBLIC_HEALTH_DELAY_SECONDS}" 1
}

create_release_tag() {
  local tag_ref="refs/tags/${RELEASE_TAG}"

  [[ "${RELEASE_TAG}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.[1-9][0-9]*)?$ ]] || die "Refusing to create non-canonical release tag: ${RELEASE_TAG}"

  if git_cmd tag --points-at HEAD | awk -v expected="${RELEASE_TAG}" '$0 == expected { found = 1 } END { exit found ? 0 : 1 }'; then
    log "Release tag already exists on HEAD; reusing ${RELEASE_TAG}"
    return 0
  fi

  if git_cmd show-ref --verify --quiet "${tag_ref}"; then
    die "Release tag ${RELEASE_TAG} already exists but does not point at HEAD."
  fi

  git_cmd tag "${RELEASE_TAG}" HEAD
  log "Created release tag: ${RELEASE_TAG}"
}

print_dry_run_plan() {
  local resolved_version

  OLD_SHA="$(git_cmd rev-parse HEAD)"
  if (( ALLOW_DIRTY == 1 )); then
    detect_worktree_changes
  fi
  resolved_version="$(node "${VERSION_SCRIPT}" resolve-release-version --channel "${RELEASE_MODE}")" || die "Could not resolve the dry-run release version."
  if [[ "${RELEASE_MODE}" == "rc" ]]; then
    [[ "${resolved_version}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.[1-9][0-9]*$ ]] || die "Version helper returned an invalid dry-run RC version: ${resolved_version}"
  else
    [[ "${resolved_version}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die "Version helper returned an invalid dry-run stable version: ${resolved_version}"
  fi
  log "Dry run; no repository update, dependency installation, migrations, build, restart, or health checks will run."
  log "Current commit: ${OLD_SHA}"
  log "Candidate: version=${resolved_version} tag=v${resolved_version} channel=${RELEASE_BUILD_CHANNEL}"
  if (( WORKTREE_DIRTY == 1 )); then
    log "Planned release: preserve the current working tree, resolve version, generate/commit changelog, npm ci (prefer offline, no audit/fund), Prisma generate, parallel lint/typecheck/tests (Vitest threads), build, Prisma deploy, validate/compare/install the systemd unit, daemon-reload if changed, verify the loaded unit, restart, local health, public health."
  else
    log "Planned release: fast-forward origin/${DEPLOY_BRANCH}, resolve version, generate/commit changelog, npm ci (prefer offline, no audit/fund), Prisma generate, parallel lint/typecheck/tests (Vitest threads), build, Prisma deploy, validate/compare/install the systemd unit, daemon-reload if changed, verify the loaded unit, restart, local health, public health."
  fi
}

main() {
  parse_args "$@"
  preflight

  if (( DRY_RUN == 1 )); then
    print_dry_run_plan
    return 0
  fi

  acquire_lock
  if (( ALLOW_DIRTY == 1 )); then
    detect_worktree_changes
  fi
  update_repository
  prepare_release_version
  generate_release_changelog
  run_release_steps
  deploy_systemd_unit
  migrate_legacy_alert_config
  restart_and_check
  create_release_tag

  log "Release successful: ${RELEASE_TAG}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
