# T58 controlled production long-stall canary

One-time, bounded follow-up to the 4.94-second stall in T58 #38887158312.

- Only after an explicitly marked **successful main CI including deploy**.
- Must run on the production self-hosted runner with its existing sudo rights.
- Checks pinned live production commit, Rust parser and CRC backends, and disabled diagnostics.
- Adds a temporary systemd drop-in for `AIRRADAR_STALL_EVIDENCE_ENABLED=1`, restarts the app and observes authenticated **read-only** metrics every 15 seconds for 15 minutes.
- Safely restores the original systemd service (and Rust flag state) via an EXIT trap, with a separate 23-minute `systemd-run` watchdog if the runner disappears.
- Archives only a strictly allowlisted aggregate of event-loop overshoot, CPU, RSS and allowlisted scope names. No ICAOs, payloads, tokens, cookies, paths or heap snapshots.
- Cannot claim true causal stacks; scope overlap is timing evidence only.

This canary itself performs **two controlled service restarts**. It changes no
database data, ORM schema, flight history or Rust configuration. Never trigger
during another production deployment or active soak. Existing `.env` values
are not changed.

Rollback if interrupted: `sudo bash /var/www/airradar/deploy/rollback-stall-canary.sh`.
The one-time job is `.github/workflows/t58-stall-canary.yml`.
