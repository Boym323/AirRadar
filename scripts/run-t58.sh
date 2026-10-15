#!/usr/bin/env bash
# Launch the read-only, one-hour T58 GitHub Action (no production SSH needed).
set -Eeuo pipefail
if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required: https://cli.github.com/" >&2
  exit 2
fi
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "Authenticate once using: gh auth login" >&2
  exit 2
fi
gh workflow run t58-production-soak.yml --repo Boym323/AirRadar --ref main
printf 'Started T58. Track the run at https://github.com/Boym323/AirRadar/actions/workflows/t58-production-soak.yml\n'
printf 'After collection the sanitized permanent history is at https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58\n'
