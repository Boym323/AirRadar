# Agenti Route Intelligence V2

Spusťte všech pět izolovaných agentů z hlavního checkoutu:

```bash
./scripts/start-ri-v2-agents.sh
```

Session se jmenuje `ri-v2`. Připojení nebo odpojení bez zastavení agentů:

```bash
tmux attach -t ri-v2
Ctrl-b d
```

Zobrazení worktrees, větví, commitů, tmux panelů, remote stavu a nedávných logů:

```bash
./scripts/status-ri-v2-agents.sh
```

Worktrees jsou pod `/var/www/airradar-worktrees/{B,C,D,E,F}`, pokud jsou
preferované cesty volné. Existující konfliktní cesty se zachovají a použije se
alternativní cesta `-alt-*`. Logy jsou v
`/var/www/airradar-agent-logs/{B,C,D,E,F}.log`.

Každý agent je hotový, když jeho log obsahuje finální report a řádek ukončení
runneru a jeho feature branch je pushnutá. Integrace do main nadále podléhá
finálním branám agenta a branch protection.
