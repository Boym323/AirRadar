-- AirRadar Issue #822: manual rollback of the exact per-table tuning above.
-- ONLY for use if issue-822-flightposition-autovacuum.sql was applied and
-- nobody subsequently customized these two table parameters.
-- Does not undo vacuum already completed. No data/index rewrite.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $safety$
BEGIN
  IF current_database() <> 'airradar' THEN
    RAISE EXCEPTION 'Refusing rollback: expected database airradar, got %', current_database();
  END IF;
  IF to_regclass('public."flightPosition"') IS NULL THEN
    RAISE EXCEPTION 'Refusing rollback: flightPosition table not found';
  END IF;
END
$safety$;

ALTER TABLE public."flightPosition"
  RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
COMMIT;

SELECT relname, reloptions
FROM pg_class
WHERE oid = 'public."flightPosition"'::regclass;
