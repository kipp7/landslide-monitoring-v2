-- ClickHouse: 遥测时序表（稀疏点位模型，不写死）
-- 说明：
-- - 每条设备上报会拆成多行：每个 metric 一行（sensor_key）。
-- - event_ts 可能漂移/缺失，因此以 received_ts 为主时间轴。
-- - seq 为可选，但强烈建议设备端提供（便于幂等去重）。

CREATE DATABASE IF NOT EXISTS landslide;

CREATE TABLE IF NOT EXISTS landslide.telemetry_raw
(
  received_ts   DateTime64(3, 'UTC'),
  event_ts      Nullable(DateTime64(3, 'UTC')),
  device_id     String,
  sensor_key    LowCardinality(String),
  seq           Nullable(UInt64),
  value_f64     Nullable(Float64),
  value_i64     Nullable(Int64),
  value_str     Nullable(String),
  value_bool    Nullable(UInt8),
  quality       Nullable(UInt8),
  schema_version UInt16
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(received_ts)
ORDER BY (device_id, sensor_key, received_ts)
SETTINGS index_granularity = 8192;

