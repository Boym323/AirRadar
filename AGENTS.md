# AirRadar agent index

AirRadar is a Next.js/TypeScript ADS-B radar. Before working, read this file
and then only the linked document(s) relevant to the task. Do not
automatically read the whole `docs/` tree. Verify the current implementation
in `app/`, `components/`, `lib/`, `scripts/`, `deploy/`, and `prisma/` before
writing or changing documentation.

## Authoritative documentation

- [Architecture](docs/ARCHITECTURE.md) — ownership and component boundaries
- [Data flows](docs/DATA-FLOWS.md) — live, history, statistics, enrichment
- [Runtime invariants](docs/RUNTIME-INVARIANTS.md) — rules that must not break
- [Development](docs/DEVELOPMENT.md) — tests, worktrees, and agent parallelism
- [Release](docs/RELEASE.md) — authoritative production release procedure
- [Data sources](docs/DATA-SOURCES.md) — provenance, security, and licensing
- [Features](docs/FEATURES.md) — current routes/API and production status

## Non-negotiable rules

- ICAO hex is aircraft identity; callsign is an observation. Live state and
  the single `AircraftStateService` poller stay in one Node process.
- The live path is `readsb → RAM → SSE`; PostgreSQL receives sampled history,
  reference/catalog data, and aggregated daily statistics. Database and
  optional enrichment failures must not stop live radar.
- `/api/stream` is SSE, not WebSocket. Delivery stays bounded/coalesced and
  heartbeat behavior must be preserved. Public serialization must not leak
  secrets, raw provider errors, or exact receiver coordinates by default.
- ATC results are probable position/altitude/time matches, never proof of the
  aircraft's tuned frequency. Sample ATC is demo-only unless explicitly
  enabled; production data is imported and provenance is retained.
- Do not reset or destructively migrate a production database. Do not run a
  release unless the user explicitly requests it; follow `docs/RELEASE.md`.
- Keep user-facing strings in `lib/i18n/`; established aviation terms remain
  technical terms. Documentation and source code are English.

`README.md` is the human-facing entry point. The documents above are the
compact agent context; update `AGENTS.md` only when a durable rule or source
of truth changes.
