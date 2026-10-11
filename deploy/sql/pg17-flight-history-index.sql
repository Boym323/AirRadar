-- AirRadar / PostgreSQL 17: history lookup index for Flight rows.
-- MANUAL DBA CHANGE ONLY. Do not add this operation to Prisma migrations:
-- Prisma 8 RC wraps Postgres migrations in a transaction and does not support
-- CREATE INDEX CONCURRENTLY. Run this file in an autocommit session.
--
-- The production index was already created under this exact name. The
-- statement is intentionally idempotent and will only create the named index
-- when it is absent; it never drops, rewrites, or changes historical data.
-- Confirm the target database and existing index definition before execution.

SELECT current_database() AS database_name,
       current_user AS connected_user,
       indexrelid::regclass AS index_name,
       pg_get_indexdef(indexrelid) AS index_definition
FROM pg_index
WHERE indexrelid = to_regclass('public."flight_aircraftId_lastSeenAt_desc_idx"');

DO $safety$
BEGIN
  IF current_database() <> 'airradar' THEN
    RAISE EXCEPTION 'Refusing history index migration: expected database airradar, got %', current_database();
  END IF;
  IF to_regclass('public."flight"') IS NULL THEN
    RAISE EXCEPTION 'Refusing history index migration: public.flight table not found';
  END IF;
END
$safety$;

-- PostgreSQL requires this statement to be outside an explicit transaction.
-- IF NOT EXISTS makes reruns safe when production already has the index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  "flight_aircraftId_lastSeenAt_desc_idx"
ON public."flight" ("aircraftId", "lastSeenAt" DESC);

SELECT indexrelid::regclass AS index_name,
       pg_get_indexdef(indexrelid) AS index_definition,
       indisvalid AS is_valid,
       indisready AS is_ready
FROM pg_index
WHERE indexrelid = to_regclass('public."flight_aircraftId_lastSeenAt_desc_idx"');
