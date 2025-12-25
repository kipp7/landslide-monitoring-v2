-- =============================================
-- audit/log tables: add trace_id (可重复执行)
-- =============================================

ALTER TABLE operation_logs ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS trace_id TEXT;

