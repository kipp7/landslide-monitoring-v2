-- =============================================
-- 常用视图（v2）
-- 说明：遥测历史与聚合在 ClickHouse，不在 PostgreSQL 做 iot_data 视图。
-- =============================================

-- 设备完整信息（站点 + 设备元数据）
CREATE VIEW v_device_full_info AS
SELECT
  d.device_id,
  d.device_name,
  d.device_type,
  d.status,
  d.last_seen_at,
  d.metadata,
  s.station_id,
  s.station_code,
  s.station_name,
  s.latitude AS station_latitude,
  s.longitude AS station_longitude
FROM devices d
LEFT JOIN stations s ON d.station_id = s.station_id;

-- 设备最新影子状态（用于看板“最新值”展示）
CREATE VIEW v_device_latest_state AS
SELECT
  d.device_id,
  d.device_name,
  ds.version,
  ds.state,
  ds.updated_at AS state_updated_at
FROM devices d
LEFT JOIN device_state ds ON d.device_id = ds.device_id;

-- 告警统计（基于事件）
CREATE VIEW v_alert_statistics AS
SELECT
  device_id,
  COUNT(*) FILTER (WHERE event_type = 'ALERT_TRIGGER') AS triggers,
  COUNT(*) FILTER (WHERE event_type = 'ALERT_RESOLVE') AS resolves,
  MAX(created_at) AS last_event_at
FROM alert_events
GROUP BY device_id;

