#!/usr/bin/env bash
set -u -o pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)
REPO_PARENT=$(dirname -- "$ROOT")
REPO_NAME=$(basename -- "$ROOT")
WORKTREE_BASE=${RI_V2_WORKTREE_ROOT:-"$REPO_PARENT/${REPO_NAME}-worktrees"}
LOG_DIR=${RI_V2_LOG_DIR:-"$REPO_PARENT/${REPO_NAME}-agent-logs"}
SESSION=${RI_V2_TMUX_SESSION:-ri-v2}

declare -a AGENTS=(B C D E F)
declare -A BRANCHES=(
  [B]='ri-v2/procedures'
  [C]='ri-v2/static-engine'
  [D]='ri-v2/runway'
  [E]='ri-v2/dynamic'
  [F]='ri-v2/ui'
)
declare -A WINDOWS=(
  [B]='B-procedures'
  [C]='C-static'
  [D]='D-runway'
  [E]='E-dynamic'
  [F]='F-ui'
)

worktree_for_branch() {
  local branch=$1
  git worktree list --porcelain | awk -v wanted="refs/heads/$branch" '
    $1 == "worktree" { path = $2 }
    $1 == "branch" && $2 == wanted { print path; exit }
  '
}

printf 'Route Intelligence V2 agent status\n'
printf 'root: %s\n' "$ROOT"
printf 'tmux session: '
if tmux has-session -t "$SESSION" 2>/dev/null; then
  printf 'present\n'
else
  printf 'absent\n'
fi

for agent in "${AGENTS[@]}"; do
  branch=${BRANCHES[$agent]}
  worktree=$(worktree_for_branch "$branch" || true)
  printf '\n[%s] branch=%s\n' "$agent" "$branch"
  if test -n "$worktree"; then
    head=$(git -C "$worktree" rev-parse HEAD 2>/dev/null || printf 'unavailable')
    if test -n "$(git -C "$worktree" status --porcelain 2>/dev/null)"; then
      cleanliness=dirty
    else
      cleanliness=clean
    fi
    printf 'worktree=%s\nHEAD=%s\nstatus=%s\n' "$worktree" "$head" "$cleanliness"
    remote_sha=$(git ls-remote --heads origin "refs/heads/$branch" 2>/dev/null | awk 'NR == 1 { print $1 }')
    if test -n "$remote_sha"; then printf 'remote=%s\n' "$remote_sha"; else printf 'remote=absent\n'; fi
    if git show-ref --verify --quiet refs/remotes/origin/main && git merge-base --is-ancestor "$head" origin/main 2>/dev/null; then
      printf 'in_origin_main=yes\n'
    else
      printf 'in_origin_main=no_or_unknown\n'
    fi
  else
    printf 'worktree=absent\nHEAD=unavailable\nstatus=unavailable\n'
    remote_sha=$(git ls-remote --heads origin "refs/heads/$branch" 2>/dev/null | awk 'NR == 1 { print $1 }')
    if test -n "$remote_sha"; then printf 'remote=%s\n' "$remote_sha"; else printf 'remote=absent\n'; fi
    printf 'in_origin_main=no_or_unknown\n'
  fi
  printf 'tmux=%s\n' "${WINDOWS[$agent]}"
  if tmux has-session -t "$SESSION" 2>/dev/null && tmux list-windows -t "$SESSION" -F '#{window_name}' | grep -Fxq "${WINDOWS[$agent]}"; then
    tmux list-panes -t "$SESSION:${WINDOWS[$agent]}" -F '  pid=#{pane_pid} command=#{pane_current_command} dead=#{pane_dead}' 2>/dev/null || true
  else
    printf '  absent\n'
  fi
  printf 'log=%s\n' "$LOG_DIR/$agent.log"
  if test -f "$LOG_DIR/$agent.log"; then
    tail -n 6 "$LOG_DIR/$agent.log" | sed 's/^/  | /'
  else
    printf '  (no log yet)\n'
  fi
done
