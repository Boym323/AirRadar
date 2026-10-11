-- AirRadar / PostgreSQL 17: bounded, opt-in flightPosition autovacuum tuning.
-- ISSUE #822. MANUAL DBA CHANGE ONLY. Do not add this file to auto-migrations.
-- Preconditions: confirmed data/WAL filesystem free space, healthy verified backup,
-- low-traffic maintenance window, and read-only baseline from issue-822-preflight.sql.
-- In Navicat connect specifically to database airradar as an authorized DBA.
-- Never run this against ppstudio or airradar_dev.
--
-- This changes only future maintenance thresholds; it does not rewrite/delete
-- rows, run VACUUM FULL, drop indexes or change application SQL.
-- If PostgreSQL already has per-table thresholds, stop for manual review.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $safety$
DECLARE
  current_options text[];
BEGIN
  IF current_database() <> 'airradar' THEN
    RAISE EXCEPTION 'Refusing autovacuum tuning: current database is %, expected airradar', current_database();
  END IF;
  IF to_regclass('public."flightPosition"') IS NULL THEN
    RAISE EXCEPTION 'Refusing autovacuum tuning: public."flightPosition" not found';
  END IF;
  SELECT reloptions INTO current_options
  FROM pg_class
  WHERE oid = 'public."flightPosition"'::regclass;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(current_options, ARRAY[]::text[])) AS option(value)
    WHERE option.value LIKE 'autovacuum_vacuum_scale_factor=%'
       OR option.value LIKE 'autovacuum_vacuum_threshold=%'
  ) THEN
    RAISE EXCEPTION 'Existing per-table autovacuum vacuum thresholds: review manually before changing';
  END IF;
END
$safety$;

-- Default (~20% of ~6M) is close to the observed ~1.15M dead tuples.
-- A conservative ~10% + 10k tuple threshold allows earlier maintenance
-- without changing global settings shared with PP Studio.
ALTER TABLE public."flightPosition"
  SET (
    autovacuum_vacuum_scale_factor = 0.10,
    autovacuum_vacuum_threshold = 10000
  );

COMMIT;

-- Confirm the effective table settings and watch the following natural
-- autovacuum cycles; no claim of lower P99 before 60m/24h comparisons.
SELECT c.relname, c.reloptions,
       s.n_live_tup, s.n_dead_tup, s.autovacuum_count, s.last_autovacuum
FROM pg_class AS c
JOIN pg_stat_user_tables AS s ON s.relid = c.oid
WHERE c.oid = 'public."flightPosition"'::regclass;
