-- =============================================
-- 说明：v2 不在 PostgreSQL 存 iot_data 宽表
-- =============================================
--
-- 遥测（telemetry）全部落 ClickHouse（稀疏点位模型），避免频繁改表结构。
-- - ClickHouse DDL：`docs/integrations/storage/clickhouse/01-telemetry.sql`
--
-- PostgreSQL 仅存“设备影子”（最新状态快照）与“命令下发”等业务数据。

-- 设备影子：用于前端展示“最新值/当前状态”，不用于曲线历史查询
CREATE TABLE device_state (
  device_id UUID PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
