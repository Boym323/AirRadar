#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly EXPECTED_APP_DIR="/var/www/airradar"
readonly LOCK_FILE="/var/lock/airradar-release.lock"
readonly SERVICE_NAME="airradar"
readonly PUBLIC_HEALTH_URL="https://airradar.pomykal.cz/api/health"
# The service binds to the production LAN address so the separate Nginx Proxy
# Manager host can reach it; loopback is intentionally not a listener.
readonly LOCAL_HEALTH_URL="http://192.168.1.142:3000/api/health"
readonly HEALTH_ATTEMPTS=15
readonly HEALTH_DELAY_SECONDS=2
readonly PUBLIC_HEALTH_ATTEMPTS=3
readonly PUBLIC_HEALTH_DELAY_SECONDS=2

DEPLOY_BRANCH="main"
DRY_RUN=0
OLD_SHA=""
NEW_SHA=""
RESTART_ATTEMPTED=0
ERROR_REPORTED=0
DIAGNOSTICS_PRINTED=0
HEALTH_SUMMARY=""
STARTED_AT="$(date --iso-8601=seconds)"
STARTED_EPOCH="$(date +%s)"

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/release.sh [options]

Options:
  --branch BRANCH  Release the current checkout of BRANCH instead of main.
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
      --dry-run)
        DRY_RUN=1
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
  [[ -f "${APP_DIR}/.env" ]] || die "Missing ${APP_DIR}/.env."

  git_root="$(git_cmd rev-parse --show-toplevel 2>/dev/null)" || die "${APP_DIR} is not a Git repository."
  git_root="$(cd -- "${git_root}" && pwd -P)"
  [[ "${git_root}" == "${APP_DIR}" ]] || die "Git repository root is ${git_root}, expected ${APP_DIR}."

  current_branch="$(git_cmd branch --show-current)"
  [[ -n "${current_branch}" ]] || die "The checkout is detached; release requires a named branch."
  git_cmd check-ref-format --branch "${DEPLOY_BRANCH}" >/dev/null 2>&1 || die "Invalid release branch name: ${DEPLOY_BRANCH}"
  [[ "${current_branch}" == "${DEPLOY_BRANCH}" ]] || die "Current branch is ${current_branch}; expected ${DEPLOY_BRANCH}. Use --branch explicitly if this is intentional."
  git_cmd remote get-url origin >/dev/null 2>&1 || die "Git remote origin is not configured."

  dirty_status="$(git_cmd status --porcelain)"
  while IFS= read -r status_line; do
    [[ -z "${status_line}" ]] && continue
    [[ "${status_line:0:2}" == "??" ]] && continue
    error "Working tree contains tracked or staged changes:"
    printf '%s\n' "${dirty_status}" >&2
    die "Refusing to update a dirty production checkout."
  done <<< "${dirty_status}"
}

check_permissions() {
  if (( EUID != 0 )); then
    require_command sudo
    if ! sudo -n -v >/dev/null 2>&1; then
      die "This release needs root or passwordless sudo for systemctl restart ${SERVICE_NAME}."
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

assert_clean_worktree() {
  local status_line dirty_status

  dirty_status="$(git_cmd status --porcelain)"
  while IFS= read -r status_line; do
    [[ -z "${status_line}" ]] && continue
    [[ "${status_line:0:2}" == "??" ]] && continue
    error "Working tree changed during the release:"
    printf '%s\n' "${dirty_status}" >&2
    die "Refusing to continue with tracked or staged changes."
  done <<< "${dirty_status}"
}

update_repository() {
  local remote_ref remote_sha merge_base

  OLD_SHA="$(git_cmd rev-parse HEAD)"
  log "Current commit: ${OLD_SHA}"
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

run_release_steps() {
  log "Installing dependencies"
  npm ci

  log "Generating Prisma contract"
  npm run prisma:generate

  log "Running lint"
  npm run lint

  log "Running typecheck"
  npm run typecheck

  log "Running tests"
  npm test

  log "Applying database migrations"
  npm run prisma:deploy

  log "Building production app"
  npm run build
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
    if (body.application?.status !== "ok") process.exit(2);
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
  log "Verifying installed ${SERVICE_NAME}.service"
  run_privileged systemctl cat "${SERVICE_NAME}.service" >/dev/null || die "Installed ${SERVICE_NAME}.service could not be read."

  log "Restarting ${SERVICE_NAME}.service"
  RESTART_ATTEMPTED=1
  run_privileged systemctl restart "${SERVICE_NAME}"
  if ! run_privileged systemctl is-active --quiet "${SERVICE_NAME}"; then
    die "${SERVICE_NAME}.service is not active after restart."
  fi

  check_health_with_retries "Local" "${LOCAL_HEALTH_URL}" "${HEALTH_ATTEMPTS}" "${HEALTH_DELAY_SECONDS}" 1
  check_health_with_retries "Public" "${PUBLIC_HEALTH_URL}" "${PUBLIC_HEALTH_ATTEMPTS}" "${PUBLIC_HEALTH_DELAY_SECONDS}" 0
}

print_dry_run_plan() {
  OLD_SHA="$(git_cmd rev-parse HEAD)"
  log "Dry run; no repository update, dependency installation, migrations, build, restart, or health checks will run."
  log "Current commit: ${OLD_SHA}"
  log "Planned release: fast-forward origin/${DEPLOY_BRANCH}, npm ci, Prisma generate, lint, typecheck, tests, Prisma deploy, build, restart, local health, public health."
}

main() {
  parse_args "$@"
  preflight

  if (( DRY_RUN == 1 )); then
    print_dry_run_plan
    return 0
  fi

  acquire_lock
  assert_clean_worktree
  update_repository
  run_release_steps
  assert_clean_worktree
  restart_and_check

  log "Release successful"
}

main "$@"
