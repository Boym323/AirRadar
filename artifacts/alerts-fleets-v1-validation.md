# Alerts & Fleets V1 validation

Result: PARTIAL

## Completed

- Focused alert, intelligence, history, and new V1 primitive tests: PASS
- V1 fleet normalization, prefix matching, disabled-target behavior: PASS
- Deterministic occurrence dedupe: PASS
- Squawk transition and restart-baseline unit coverage: PASS
- Circular geofence hysteresis/confirmation and validation: PASS
- Durable squawk/geofence integration through the canonical occurrence path: PASS
- Fresh disposable PostgreSQL migration chain: PASS (16 migrations, 155 operations)
- PostgreSQL occurrence concurrency: PASS (20 callers -> 1 occurrence, 2 deliveries)
- PostgreSQL delivery claim concurrency: PASS (2 distinct rows claimed once)
- PostgreSQL stale-claim recovery: PASS (2 rows recovered)
- Temporal round-trip: PASS
- TypeScript typecheck: PASS
- Full suite: PASS (1,392 passed, 10 skipped)
- ESLint: PASS (0 errors, 7 existing warnings)
- Feature/docs/visual checks: PASS
- Browser desktop/tablet/mobile gate: PASS

## Not run / not yet applicable

- Production build: NOT RUN directly because `airradar.service` is active;
  the canonical isolated release workflow is required.
- Production canary: NOT RUN.
