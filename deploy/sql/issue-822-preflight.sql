-- AirRadar Issue #822, PostgreSQL 17: READ-ONLY preflight and post-change snapshot.
-- Run in Navicat on airradar, capture full results, run again after 60m/24h.
-- Values from pg_stat_* are cumulative since reset. Compare matched deltas
-- with stable stats_reset; do not interpret absolute counters as rates.

-- 1. identity, data directory, total size: directory is not mount identity.
SELECT current_database() AS database_name,
       current_user AS connected_user,
       clock_timestamp() AS measured_at,
       current_setting('data_directory') AS data_directory,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- 2. autovacuum configuration and table overrides.
SELECT name, setting, unit, source
FROM pg_settings
WHERE name IN (
  'autovacuum', 'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_threshold',
  'autovacuum_analyze_scale_factor', 'autovacuum_analyze_threshold',
  'autovacuum_max_workers', 'autovacuum_vacuum_cost_limit',
  'autovacuum_vacuum_cost_delay', 'shared_buffers', 'effective_cache_size',
  'max_connections', 'track_io_timing', 'shared_preload_libraries',
  'wal_compression'
)
ORDER BY name;
SELECT c.relname, c.reloptions,
       s.n_live_tup, s.n_dead_tup, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
       s.autovacuum_count, s.last_autovacuum, s.last_autoanalyze
FROM pg_class AS c
JOIN pg_stat_user_tables AS s ON s.relid = c.oid
WHERE c.oid IN (
  'public."flightPosition"'::regclass,
  'public.flight'::regclass,
  'public."routeEnrichmentCache"'::regclass
)
ORDER BY c.relname;

-- 3. DB-level counters. xact_rollback cannot identify failing SQL.
SELECT datname, xact_commit, xact_rollback, deadlocks,
       blks_read, blks_hit, temp_files, temp_bytes, stats_reset
FROM pg_stat_database WHERE datname = 'airradar';

-- 4. Activity and wait events at this instant; idle/ClientRead is not a DB wait.
SELECT pid, application_name, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocking_pids,
       clock_timestamp() - query_start AS query_age
FROM pg_stat_activity
WHERE datname = 'airradar'
  AND pid <> pg_backend_pid()
  AND state IS DISTINCT FROM 'idle'
ORDER BY query_start NULLS LAST
LIMIT 25;

-- 5. Active autovacuum progress, if any.
SELECT pid, relid::regclass AS relation, phase, heap_blks_total,
       heap_blks_scanned, heap_blks_vacuumed
FROM pg_stat_progress_vacuum
WHERE datname = 'airradar';

-- 6. Shared PostgreSQL cluster I/O counters, NOT isolated to AirRadar.
-- Reads/writes are counts, not timing; timing fields require track_io_timing.
SELECT backend_type, object, context, reads, writes, hits, evictions, fsyncs,
       read_time, write_time, fsync_time, stats_reset
FROM pg_stat_io
WHERE object = 'relation'
  AND backend_type IN ('client backend', 'autovacuum worker', 'checkpointer')
ORDER BY backend_type, context;

-- 7. Extension available != loaded/active. Check server setting above.
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name = 'pg_stat_statements';
