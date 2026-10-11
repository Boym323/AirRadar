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
DECLARE
  index_oid oid;
  equivalent_count integer;
  index_is_valid boolean;
  index_is_ready boolean;
  index_is_correct boolean;
BEGIN
  IF current_database() <> 'airradar' THEN
    RAISE EXCEPTION 'Refusing history index migration: expected database airradar, got %', current_database();
  END IF;
  IF to_regclass('public."flight"') IS NULL THEN
    RAISE EXCEPTION 'Refusing history index migration: public.flight table not found';
  END IF;

  SELECT to_regclass('public."flight_aircraftId_lastSeenAt_desc_idx"') INTO index_oid;
  IF index_oid IS NOT NULL THEN
    SELECT i.indisvalid,
           i.indisready,
           i.indrelid = 'public."flight"'::regclass
             AND i.indnkeyatts = 2
             AND i.indkey[0] = a.attnum
             AND i.indkey[1] = l.attnum
             AND i.indoption[0] = 0
             AND i.indoption[1] = 1
      INTO index_is_valid, index_is_ready, index_is_correct
    FROM pg_index AS i
    JOIN pg_attribute AS a ON a.attrelid = i.indrelid AND a.attname = 'aircraftId'
    JOIN pg_attribute AS l ON l.attrelid = i.indrelid AND l.attname = 'lastSeenAt'
    WHERE i.indexrelid = index_oid;
    IF NOT COALESCE(index_is_valid, false)
       OR NOT COALESCE(index_is_ready, false)
       OR NOT COALESCE(index_is_correct, false) THEN
      RAISE EXCEPTION 'Refusing history index migration: existing index has wrong definition or is invalid';
    END IF;
  ELSE
    SELECT count(*) INTO equivalent_count
    FROM pg_index AS i
    WHERE i.indrelid = 'public."flight"'::regclass
      AND i.indnkeyatts = 2
      AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = i.indrelid AND attname = 'aircraftId')
      AND i.indkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = i.indrelid AND attname = 'lastSeenAt')
      AND i.indoption[0] = 0
      AND i.indoption[1] = 1;
    IF equivalent_count > 0 THEN
      RAISE EXCEPTION 'Refusing history index migration: equivalent index exists under another name';
    END IF;
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
