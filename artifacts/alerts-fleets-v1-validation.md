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

- Canonical isolated production build: PASS (v1.0.239; 124s release workflow)
- Production migration: PASS (already up to date; 0 migrations applied)
- Production canary: PASS for 45 minutes of stable zero-noise observation;
  no natural FlightEvent occurred.

## Production limitations

- Live FlightEvent occurrence: NOT OBSERVED during the bounded canary;
  deterministic occurrence/dedupe and PostgreSQL evidence remain PASS.
- Natural squawk/geofence transitions: NOT OBSERVED; deterministic and
  restart-baseline evidence remains PASS.

## Corrective release validation

- Focused corrective tests: PASS (14 tests in the alert/history targets)
- Full suite after correction: PASS (1,393 passed, 10 skipped)
- Typecheck and lint after correction: PASS (lint 0 errors, 7 existing warnings)
- FlightEvent invariant negative test: PASS
- Production read-only audit: 8 incomplete FlightEvent rows; deterministic backfill NOT SAFE; FlightEvent 5312 not present in the incomplete-row set
- Production deployment and natural post-fix gate: NOT RUN
