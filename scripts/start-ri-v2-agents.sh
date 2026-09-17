#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)
REPO_PARENT=$(dirname -- "$ROOT")
REPO_NAME=$(basename -- "$ROOT")
WORKTREE_BASE=${RI_V2_WORKTREE_ROOT:-"$REPO_PARENT/${REPO_NAME}-worktrees"}
PROMPT_DIR=${RI_V2_PROMPT_DIR:-"$REPO_PARENT/${REPO_NAME}-agent-prompts"}
LOG_DIR=${RI_V2_LOG_DIR:-"$REPO_PARENT/${REPO_NAME}-agent-logs"}
SESSION=${RI_V2_TMUX_SESSION:-ri-v2}
CODEX_BIN=${CODEX_BIN:-"$(command -v codex || true)"}

if test -z "$CODEX_BIN" || ! test -x "$CODEX_BIN"; then
  printf 'ERROR: Codex CLI is not executable. Install it and retry.\n' >&2
  exit 1
fi
for required in git npm tmux; do
  if ! command -v "$required" >/dev/null 2>&1; then
    printf 'ERROR: required command is missing: %s\n' "$required" >&2
    exit 1
  fi
done

cd "$ROOT"
git fetch origin
if ! git show origin/main:lib/route-intelligence/contracts.ts >/dev/null 2>&1; then
  printf 'ERROR: origin/main does not contain Agent A contracts; no agents started.\n' >&2
  exit 1
fi

mkdir -p "$WORKTREE_BASE" "$LOG_DIR"

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

registered_path() {
  local path=$1
  git worktree list --porcelain | awk -v wanted="$path" '$1 == "worktree" && $2 == wanted { found = 1 } END { exit(found ? 0 : 1) }'
}

choose_new_path() {
  local preferred=$1
  local candidate=$preferred
  local suffix=1
  while test -e "$candidate"; do
    candidate="${preferred}-alt-${suffix}"
    suffix=$((suffix + 1))
  done
  printf '%s\n' "$candidate"
}

ensure_worktree() {
  local agent=$1
  local branch=${BRANCHES[$agent]}
  local preferred="$WORKTREE_BASE/$agent"
  local existing
  existing=$(worktree_for_branch "$branch" || true)
  if test -n "$existing"; then
    printf '%s %s\n' "$agent" "$existing"
    return
  fi

  local target=$preferred
  if test -e "$target"; then
    if registered_path "$target" && test "$(git -C "$target" branch --show-current 2>/dev/null || true)" = "$branch"; then
      printf '%s %s\n' "$agent" "$target"
      return
    fi
    target=$(choose_new_path "$preferred")
    printf 'NOTICE: %s is occupied; preserving it and using %s\n' "$preferred" "$target" >&2
  fi

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add "$target" "$branch"
  elif git ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null 2>&1; then
    git fetch origin "refs/heads/$branch:refs/remotes/origin/$branch"
    git worktree add --track -b "$branch" "$target" "origin/$branch"
  else
    git worktree add -b "$branch" "$target" origin/main
  fi
  printf '%s %s\n' "$agent" "$target"
}

declare -A WORKTREES
for agent in "${AGENTS[@]}"; do
  WORKTREES[$agent]=$(ensure_worktree "$agent" | tail -n 1 | awk '{print $2}')
  test -n "${WORKTREES[$agent]}"
  test "$(git -C "${WORKTREES[$agent]}" branch --show-current)" = "${BRANCHES[$agent]}"
  test -f "$PROMPT_DIR/$agent.md"
done

runner_command() {
  local agent=$1
  local worktree=${WORKTREES[$agent]}
  local prompt="$PROMPT_DIR/$agent.md"
  local log_file="$LOG_DIR/$agent.log"
  printf '%q ' "$ROOT/scripts/run-ri-v2-agent.sh" "$agent" "${WINDOWS[$agent]}" "$worktree" "$prompt" "$log_file"
}

window_exists() {
  local window=$1
  tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -Fxq "$window"
}

if tmux has-session -t "$SESSION" 2>/dev/null; then
  printf 'Reusing tmux session %s\n' "$SESSION"
else
  first=${AGENTS[0]}
  tmux new-session -d -s "$SESSION" -n "${WINDOWS[$first]}" "$(runner_command "$first")"
  printf 'Created tmux session %s\n' "$SESSION"
fi

for agent in "${AGENTS[@]}"; do
  window=${WINDOWS[$agent]}
  if window_exists "$window"; then
    printf 'Keeping existing tmux window %s\n' "$window"
  else
    tmux new-window -d -t "$SESSION:" -n "$window" "$(runner_command "$agent")"
    printf 'Started agent %s in %s\n' "$agent" "$window"
  fi
done

printf 'All requested agent windows are prepared in tmux session %s.\n' "$SESSION"
printf 'Attach with: tmux attach -t %s\n' "$SESSION"
