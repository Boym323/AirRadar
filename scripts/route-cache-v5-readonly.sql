-- V5.1 read-only PostgreSQL route-cache attribution.
-- Run with psql -X -v ON_ERROR_STOP=1 -f scripts/route-cache-v5-readonly.sql
-- Only aggregate statistics, query plans and schema metadata; never emit SQL text,
-- parameters, callsigns, cache keys, connection strings or flight data.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '2000ms';
SET LOCAL lock_timeout = '250ms';

-- Is the database globally waiting on locks, I/O or client connections?
SELECT COALESCE(state, 'unknown') AS state,
       COALESCE(wait_event_type, 'none') AS wait_type,
       COALESCE(wait_event, 'none') AS wait_event,
       count(*) AS sessions,
       round(max(extract(epoch from clock_timestamp() - xact_start))::numeric, 1) AS longest_transaction_seconds
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
 GROUP BY state, wait_event_type, wait_event
 ORDER BY sessions DESC, state, wait_type;

-- Lifetime DB-level stats (not route-cache-only, and not a 12h delta).
SELECT datname, numbackends, xact_commit, xact_rollback, deadlocks,
       temp_files, temp_bytes, blks_read, blks_hit,
       round(blk_read_time::numeric, 1) AS blk_read_ms,
       round(blk_write_time::numeric, 1) AS blk_write_ms,
       stats_reset
  FROM pg_stat_database
 WHERE datname = current_database();

-- Route-cache table size, estimated rows and heap read/index hit evidence.
SELECT s.relname AS table_name, s.seq_scan, s.seq_tup_read, s.idx_scan,
       s.n_tup_ins, s.n_tup_upd, s.n_tup_del, s.n_dead_tup,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
  FROM pg_stat_user_tables AS s
  JOIN pg_class AS c ON c.oid = s.relid
 WHERE s.schemaname = 'public'
   AND s.relname = 'routeEnrichmentCache';

-- Metadata only: identify indexes that might support cacheKey and expiry lookups.
SELECT i.relname AS index_name, idx.indisunique AS is_unique,
       idx.indisvalid AS is_valid, am.amname AS access_method,
       pg_size_pretty(pg_relation_size(i.oid)) AS size
  FROM pg_index AS idx
  JOIN pg_class AS t ON t.oid = idx.indrelid
  JOIN pg_class AS i ON i.oid = idx.indexrelid
  JOIN pg_am AS am ON am.oid = i.relam
  JOIN pg_namespace AS n ON n.oid = t.relnamespace
 WHERE n.nspname = 'public' AND t.relname = 'routeEnrichmentCache'
 ORDER BY i.relname;

-- Planner only. EXPLAIN without ANALYZE neither executes SQL nor accesses rows.
EXPLAIN (COSTS ON, VERBOSE OFF)
SELECT "routeJson" FROM "public"."routeEnrichmentCache"
 WHERE "cacheKey" = '__airradar_v5_no_real_key__'
   AND "expiresAtMs" > 0::bigint LIMIT 1;

ROLLBACK;
