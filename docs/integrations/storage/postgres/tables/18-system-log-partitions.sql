-- =============================================
-- Allow inserts into partitioned log tables (single-host default)
-- =============================================
--
-- Tables operation_logs / api_logs are partitioned by created_at, but v2 single-host
-- environment does not manage partitions yet.
-- Create DEFAULT partitions so inserts do not fail.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'operation_logs'
  ) THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS operation_logs_default PARTITION OF operation_logs DEFAULT;';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'api_logs'
  ) THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS api_logs_default PARTITION OF api_logs DEFAULT;';
  END IF;
END $$;

