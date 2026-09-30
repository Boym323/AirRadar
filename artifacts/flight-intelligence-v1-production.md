# Flight Intelligence V1 production report

Result: PARTIAL. No production release, restart, migration, or canary was
performed. The fresh build passed in an isolated worktree and the existing
prepared build passed the complete production/browser gate.

The read-only PostgreSQL history contains 123,911 flights and 5,106,104
positions, but zero `FlightEvent` rows. The bounded completed-flight replay
covered 100 flights and 2,173 positions. It generated 13 `CRUISE_ENTER`, 15
`TOP_OF_DESCENT`, 20 `APPROACH`, and 9 `HOLDING` comparable events. These are
not accuracy measurements because there are no durable events for comparison.

Detector benchmark p95 was 1.784 ms at 100 aircraft, 8.505 ms at 500, and
8.233 ms at 1,000. The 1,000-aircraft/20-client SSE delta was 2,102 bytes and
4.9 ms for one changed aircraft. No production CPU/RSS/WAL/write-rate canary
measurements exist because deployment was correctly blocked.

Blocking evidence: live/replay parity, durable idempotency, canonical Airport
Operations parity, production health, and the release gates requiring those
checks. Obtain a read-only production-derived `FlightEvent` corpus, rerun
these checks, and only then use `deploy/release.sh`.
