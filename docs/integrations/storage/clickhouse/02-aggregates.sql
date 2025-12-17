-- ClickHouse: 聚合表规划（可选，后续实现）
-- 目标：提升曲线/统计查询性能，支持长期保留。

CREATE TABLE IF NOT EXISTS landslide.telemetry_agg_1m
(
  bucket_ts    DateTime('UTC'),
  device_id    String,
  sensor_key   LowCardinality(String),
  count        UInt32,
  min_f64      Nullable(Float64),
  max_f64      Nullable(Float64),
  avg_f64      Nullable(Float64),
  last_f64     Nullable(Float64),
  last_ts      Nullable(DateTime64(3, 'UTC'))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(bucket_ts)
ORDER BY (device_id, sensor_key, bucket_ts);

