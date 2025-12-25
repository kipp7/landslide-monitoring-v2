-- ClickHouse: telemetry_raw TTL 对齐（可重复执行）
--
-- 说明：
-- - `01-telemetry.sql` 负责新建表时的 TTL。
-- - 该脚本用于“已存在表”的场景（历史环境），确保 TTL 生效。
--
-- 当前默认：保留 30 天原始遥测（单机容量保护基线）。

ALTER TABLE landslide.telemetry_raw
MODIFY TTL toDateTime(received_ts) + INTERVAL 30 DAY;
