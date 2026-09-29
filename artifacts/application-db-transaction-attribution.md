# Application DB transaction attribution

## Result

**ATTRIBUTION BLOCKED — follow-up instrumentation is ready; production
measurement is still required.**

The previous 30m47s window measured 332.02 PostgreSQL transactions/min and
explained 304.36/min (92.70%). The final 7.3% cannot be claimed closed until
the new diagnostics run in production.

## Correction

FlightPosition double-count risk fixed: **YES**. FlightPosition persistence is
already covered by `history.snapshot`. Flight updates, Aircraft persistence,
and ReceiverCoverage writes are also `EXPLICIT_TX_CHILD`; they were not given
autocommit counters.

## Production

- Current public version/SHA: `1.0.220 / 740ddd03`
- Previous measured version/SHA: `1.0.219 / 06f8f7ba`
- Previous measurement duration: 30m47s, uninterrupted
- Current release/deployment: NO
- Stable PID/store identity for a new window: NOT ESTABLISHED

## PostgreSQL — previous measured window

- Transactions/min: 332.02
- Commits/min: 328.34
- Rollbacks/min: 3.67
- Deadlocks: 0
- Lock waits: 0
- Long transactions: 0

## Explicit transactions — previous measured window

- Rate/min: 117.20
- Share: 35.69%
- Primary lane: `history.snapshot` at 112.98/min

## Existing autocommit — previous measured window

- Writes/min: 156.01
- Reads/min: 30.11
- Observer minimum: 1.04/min

## Newly attributed lanes

Implemented but not production-measured: System Status database health and
airport probes; Flight Intelligence airport index, event lookup, flight-link
lookup, and event insert; History list, flight detail, aircraft quick detail,
and aircraft detail reads. `readSystemStatus()` has an in-memory request
counter with no counting query.

## Reconciliation and gate

- Previous explained/min: 304.36
- Previous explained: 92.70%
- Previous unexplained/min: 27.66
- 95% gate: **NOT YET MEASURED after instrumentation**

## Next step

**INVESTIGATE REMAINING ATTRIBUTION** — deploy diagnostics only, run the
required canary and long measurement, then choose exactly one optimization or
KEEP CURRENT DATABASE MODEL using measured cost and health evidence.

## Database safety

Schema changed: NO. Migration: NO. Persistence semantics changed: NO.
Optimization deployed: NO.

AIRRADAR FINAL DB ATTRIBUTION BLOCKED
