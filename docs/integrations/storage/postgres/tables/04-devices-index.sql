-- =============================================
-- 设备/字典索引（v2）
-- =============================================

-- stations
CREATE INDEX idx_stations_deleted_at ON stations(deleted_at);
CREATE INDEX idx_stations_metadata ON stations USING GIN (metadata);

-- devices
CREATE INDEX idx_devices_metadata ON devices USING GIN (metadata);

-- sensors
CREATE INDEX idx_sensors_enabled ON sensors(is_enabled);
CREATE INDEX idx_sensors_tags ON sensors USING GIN (tags);

