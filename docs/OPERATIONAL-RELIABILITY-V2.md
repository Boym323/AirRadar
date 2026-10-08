# Operational Reliability V2 (C1–C5)

[Česky](cs/OPERATIONAL-RELIABILITY-V2.md)

## Purpose and provenance

The existing single-process readsb → RAM → SSE pipeline remains unchanged.
C1 reports local and optional network source availability from existing snapshots,
without claiming a provider failover. Stale and unknown timestamps never count
as healthy. Demo mode does not count as verified coverage.

C2 records bounded process-lifetime SSE admission denials, separated into
global, channel and per-client capacity, plus snapshots coalesced while a browser
connection is backpressured. Coalescing is **not** proof of packet loss, and
the counters are not time-normalized rates. No user/IP identifiers are stored.

C3 augments the existing protected delivery-health report with terminal-outcome
success rate, nullable until an outcome is recorded, and reason codes for
retry backlog, terminal failures and stopped worker. Delivery evidence is
not a measure of false positives or whether a device displayed a notification.
No notification policy is automatically changed.

C4 exposes an advisory `operationalHealth` summary **only in the authenticated
admin projection** of the existing system-status API. It distinguishes data
gaps from confirmed outages and never initiates a new data fetch. For detailed
notification evidence consult the pre-existing protected delivery-health API;
system health does not trigger that database-backed collection.

C5 adds a deterministic path classifier to PR CI: after build, selected
runtime/deployment changes run the isolated core production smoke. Unrelated
changes do not pay this cost. Main still runs the complete release validation,
browser/performance checks and deployment workflow where required.

## Operator interpretation

- `HEALTHY` means there is supporting feed and runtime evidence, not that
  predictions, air traffic or delivery success are guaranteed.
- `INSUFFICIENT_DATA` must not be displayed as a green health assertion.
- `DEGRADED` identifies a concrete health condition; historical SSE counters
  are explanatory indicators, not automatic outage triggers.
- A configured-off NETWORK feed does not by itself make LOCAL unhealthy.
- Use the existing release workflow and production UI smoke after deploy.
  No automatic predictive promotion, source-affinity change, new database
  migration, worker, or external dependency is introduced.
