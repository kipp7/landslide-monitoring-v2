-- =============================================
-- GPS 基准（v2，可选模块）
-- =============================================
--
-- 说明：
-- - GPS 原始时序数据在 ClickHouse（telemetry_raw）。
-- - 基准点/基线计算结果属于“业务配置/元数据”，适合存 PostgreSQL。

CREATE TABLE gps_baselines (
  device_id UUID PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL DEFAULT 'auto'
    CHECK (method IN ('auto', 'manual')),
  points_count INT,
  baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

