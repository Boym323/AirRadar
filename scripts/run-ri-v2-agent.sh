#!/usr/bin/env bash
set -u -o pipefail

agent="${1:?agent id is required}"
window="${2:?tmux window is required}"
worktree="${3:?worktree is required}"
prompt="${4:?prompt is required}"
log_file="${5:?log file is required}"
codex_bin="${CODEX_BIN:-/root/.local/bin/codex}"

mkdir -p "$(dirname "$log_file")"

{
  printf '[%s] agent=%s window=%s worktree=%s\n' "$(date --iso-8601=seconds)" "$agent" "$window" "$worktree"
  if ! test -x "$codex_bin"; then
    printf '[%s] ERROR Codex CLI is not executable: %s\n' "$(date --iso-8601=seconds)" "$codex_bin"
    exit 127
  fi
  if ! cd "$worktree"; then
    printf '[%s] ERROR cannot enter worktree\n' "$(date --iso-8601=seconds)"
    exit 1
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '[%s] ERROR worktree is not a Git worktree\n' "$(date --iso-8601=seconds)"
    exit 1
  fi
  printf '[%s] branch=%s head=%s\n' "$(date --iso-8601=seconds)" "$(git branch --show-current)" "$(git rev-parse --short HEAD)"
  if test ! -x node_modules/.bin/next; then
    printf '[%s] dependencies missing/incomplete; waiting for serialized npm ci\n' "$(date --iso-8601=seconds)"
    lock_file="/var/www/airradar-agent-logs/npm-ci.lock"
    exec 9>"$lock_file"
    flock 9
    if test ! -x node_modules/.bin/next; then
      printf '[%s] running npm ci\n' "$(date --iso-8601=seconds)"
      if ! npm ci; then
        printf '[%s] ERROR npm ci failed\n' "$(date --iso-8601=seconds)"
        exit 1
      fi
    else
      printf '[%s] dependencies were prepared by another agent\n' "$(date --iso-8601=seconds)"
    fi
    flock -u 9
  fi
  printf '[%s] starting codex exec\n' "$(date --iso-8601=seconds)"
  "$codex_bin" --ask-for-approval never exec \
    --cd "$worktree" \
    --sandbox workspace-write \
    -c sandbox_workspace_write.network_access=true \
    - < "$prompt"
  agent_rc=$?
  printf '[%s] codex exec exit=%s\n' "$(date --iso-8601=seconds)" "$agent_rc"
  exit "$agent_rc"
} 2>&1 | tee -a "$log_file"

pipeline_rc=${PIPESTATUS[0]}
printf '[%s] runner exit=%s; tmux window remains available\n' "$(date --iso-8601=seconds)" "$pipeline_rc" | tee -a "$log_file"
exec bash -i
