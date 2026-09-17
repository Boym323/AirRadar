# Route Intelligence V2 agents

Start all five isolated agents from the main checkout:

```bash
./scripts/start-ri-v2-agents.sh
```

The session is `ri-v2`. Attach or detach without stopping agents:

```bash
tmux attach -t ri-v2
Ctrl-b d
```

Show worktrees, branches, commits, tmux panes, remote status, and recent logs:

```bash
./scripts/status-ri-v2-agents.sh
```

Worktrees are under `/var/www/airradar-worktrees/{B,C,D,E,F}` when the
preferred paths are free. Existing conflicting paths are preserved and an
`-alt-*` path is used. Logs are under `/var/www/airradar-agent-logs/{B,C,D,E,F}.log`.

Each agent is done when its log contains its final report and the runner exit
line, and its feature branch has been pushed. Main integration remains subject
to the agent's final gates and branch protection.
