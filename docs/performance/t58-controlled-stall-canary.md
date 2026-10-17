# T58 controlled production long-stall canary

One-time, bounded follow-up to the 4.94-second stall in T58 #38887158312.

- Only after an explicitly marked **successful main CI including deploy**.
- Must run on the production self-hosted runner with its existing sudo rights.
- Checks pinned live production commit, Rust parser and CRC backends, and disabled diagnostics.
- **Fails closed** if diagnostics were already enabled: it does not borrow an existing flag, restart the service, or claim a verified rollback.
- Adds a temporary systemd drop-in for `AIRRADAR_STALL_EVIDENCE_ENABLED=1`, restarts the app and observes authenticated **read-only** metrics every 15 seconds for 15 minutes.
- Restores the temporary override via an EXIT trap, with a separate 23-minute `systemd-run` watchdog if the runner disappears. A successful stop command is insufficient: the job additionally polls the authenticated production API and requires disabled diagnostics, the pinned commit, and healthy Rust backends before it can report success.
- Archives only a strictly allowlisted aggregate of event-loop overshoot, CPU, RSS and allowlisted scope names. No ICAOs, payloads, tokens, cookies, paths or heap snapshots.
- Cannot claim true causal stacks; scope overlap is timing evidence only.

This canary itself performs **two controlled service restarts**. It changes no
database data, ORM schema, flight history or Rust configuration. Never trigger
during another production deployment or active soak. Existing `.env` values
are not changed.

Rollback if interrupted: `sudo bash /var/www/airradar/deploy/rollback-stall-canary.sh`.
The one-time job is `.github/workflows/t58-stall-canary.yml`.

## Production runner permissions (fixed after #38904102249)

The runner intentionally **does not** have wildcard passwordless sudo.
It can execute the existing root-reviewed release entrypoint at
`/var/www/airradar/deploy/release.sh`. The canary now calls only its exact
`--t58-canary-probe`, `--t58-canary-start` and `--t58-canary-stop`
subcommands. The release entrypoint delegates to a fixed root-only helper;
there are no privileged arguments, paths or shell fragments supplied by CI.

An early sudo policy mismatch fails closed **before any systemd modification**.
Before enabling the service, the helper installs a root-owned rescue copy
under `/run/airradar-t58-stall-canary` and schedules an independent 23-minute
rollback. Its implementation and path are not writable by the runner while
the measurement is active. Normal termination uses the same narrowly scoped
release entrypoint to restore configuration.

The release pipeline also refuses to deploy while the temporary systemd
override is present. This prevents mixing deployment and observation.

No new sudoers entry, root password, SSH key, or broader permissions are
required. To manually verify the production privilege path without changes:
`sudo -n /var/www/airradar/deploy/release.sh --t58-canary-probe`.

## Per-stall interval context (T58 v1.0.483 follow-up)

When the opt-in stall observer is enabled, the 1-second monotonic heartbeat
now retains a **bounded numeric** GC pause/count delta and Node event-loop
utilization active/idle milliseconds alongside the existing process CPU
percentage, overshoot and allowlisted synchronous scope. Each value is
recorded only for a stall above the existing threshold, in the ring of at most
24 events. Unavailable counters stay `null`.

The canary exports these measurements only through its sanitized top-20
events, plus counts of events with GC and ELU coverage. It never exports raw
performance entries, stack frames, aircraft identities, process IDs, heap
graphs, cgroup paths or environment values.

**Interpretation:** GC PerformanceObserver delivery is asynchronous. A GC
delta or high ELU in the same heartbeat interval is useful temporal context,
NOT proof of the exact cause of a stall. Process-wide CPU includes worker
threads; ELU measures the Node event loop. Unavailable cgroup quota/throttling
telemetry remains unknown, never zero throttling.

This change is **off by default** and does not trigger the canary or alter
production configuration. The existing canary still requires a separately
authorized, one-time marked release with its two controlled restarts, pinned
commit checks and mandatory independent rollback.

## Interpreting #39005740397 (2026-10-17)

This historical run entered the pre-existing-enabled path. Its 61 samples
were collected, but **no controlled enable, restart or rollback occurred**.
The workflow's success conclusion does not prove that diagnostics were
disabled after the run. The source-code fix here does not change that
historical production state. Verify the current service environment and
watchdog read-only before authorizing any further operational action.

For future one-time runs, an already-enabled preflight is a hard error.
Only a canary that actually activated its own override can enter cleanup.
Cleanup must verify the override has been removed and the watchdog stopped,
then independently confirm the read-only authenticated runtime reports
disabled diagnostics on the expected commit and healthy Rust backends.
A report artifact alone describes measurement, not rollback evidence.

## One-shot V8 CPU sampling during the canary

The same temporary systemd override also enables `AIRRADAR_T58_CPU_PROFILE_ENABLED=1`.
The in-process `node:inspector` Session starts V8 sampling before aircraft
polling, at 20 ms per sample, and stops after 120 seconds or when RSS exceeds
1,750 MiB. It opens no inspector network port. The response is discarded if
it exceeds 10,000 samples or nodes, or if the sanitized summary exceeds 32
KiB. The existing 23-minute watchdog still removes both flags and restarts
the service if the runner disappears. The read-only API must report both
diagnostics disabled after rollback.

Raw V8 profiles, URLs, paths, source, request data and arguments are never
written or uploaded. The authenticated runtime endpoint exposes only bounded
function names, coarse JS/native/GC/idle categories, sample counts, and
per-stall CPU/GC/main-thread scheduler deltas. The 15-minute canary report
includes this sanitized summary. A CPU sample within an event-loop stall is
stronger attribution than a one-minute correlation, but interpretation still
requires multiple samples and cross-checking CPU, GC and scheduler wait.
