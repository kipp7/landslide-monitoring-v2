-- =============================================
-- 初始数据（v2 Seed）
-- 说明：
-- - 本文件用于“计划/实现阶段”的初始化参考，便于前后端联调与规则配置。
-- - 设备（devices）需要 device_secret_hash，真实项目中应由后端生成并返回一次明文 secret。
-- =============================================

-- -----------------------------
-- sensors：传感器/指标字典（不写死，可持续扩展）
-- -----------------------------

INSERT INTO sensors (sensor_key, display_name, unit, data_type, min_value, max_value, description, tags)
VALUES
  ('displacement_mm', '位移', 'mm', 'float', NULL, NULL, '位移量（通用）', '["landslide","core"]'),
  ('displacement_velocity_mm_h', '位移速率', 'mm/h', 'float', NULL, NULL, '位移变化速率', '["landslide","core"]'),
  ('tilt_x_deg', '倾角X', 'deg', 'float', NULL, NULL, '倾角（X轴）', '["landslide","core"]'),
  ('tilt_y_deg', '倾角Y', 'deg', 'float', NULL, NULL, '倾角（Y轴）', '["landslide","core"]'),
  ('tilt_z_deg', '倾角Z', 'deg', 'float', NULL, NULL, '倾角（Z轴）', '["landslide","core"]'),
  ('rainfall_mm', '雨量', 'mm', 'float', 0, NULL, '降雨量（累计或瞬时，需在 meta 标注口径）', '["env","landslide"]'),
  ('rainfall_intensity_mm_h', '雨强', 'mm/h', 'float', 0, NULL, '降雨强度', '["env","landslide"]'),
  ('soil_moisture_pct', '土壤含水率', '%', 'float', 0, 100, '土壤含水率', '["env","landslide"]'),
  ('pore_water_pressure_kpa', '孔隙水压力', 'kPa', 'float', NULL, NULL, '孔隙水压力', '["landslide","advanced"]'),
  ('groundwater_level_m', '地下水位', 'm', 'float', NULL, NULL, '地下水位高度', '["landslide","advanced"]'),
  ('temperature_c', '温度', 'C', 'float', -50, 100, '温度（环境/设备）', '["env","device_health"]'),
  ('humidity_pct', '湿度', '%', 'float', 0, 100, '相对湿度', '["env","device_health"]'),
  ('vibration_g', '振动', 'g', 'float', 0, NULL, '振动强度（加速度量纲）', '["device_health"]'),
  ('battery_v', '电池电压', 'V', 'float', 0, 10, '电池电压', '["device_health"]'),
  ('battery_pct', '电量百分比', '%', 'float', 0, 100, '电量百分比（可由设备或算法给出）', '["device_health"]'),
  ('rssi_dbm', '信号强度 RSSI', 'dBm', 'float', -150, 0, '无线信号强度', '["device_health","network"]'),
  ('snr_db', '信噪比 SNR', 'dB', 'float', NULL, NULL, '信噪比', '["device_health","network"]'),
  ('packet_loss_pct', '丢包率', '%', 'float', 0, 100, '通信丢包率', '["device_health","network"]'),
  ('fw_version', '固件版本', NULL, 'string', NULL, NULL, '固件版本（建议走 meta/state，但允许作为指标）', '["meta"]'),
  ('relay_state', '继电器状态', NULL, 'string', NULL, NULL, '控制类状态（建议走命令/影子）', '["control","state"]')
ON CONFLICT (sensor_key) DO NOTHING;

-- -----------------------------
-- stations：示例站点（可选）
-- -----------------------------

INSERT INTO stations (station_code, station_name, latitude, longitude, metadata)
VALUES
  ('DEMO001', '示例监测点', 21.6847, 108.3516, '{"note":"seed demo"}')
ON CONFLICT (station_code) DO NOTHING;

-- -----------------------------
-- devices：示例设备（不建议在生产环境用固定 hash）
-- -----------------------------
--
-- 若用于联调，可在实现阶段由后端生成 device_secret 并写入 devices.device_secret_hash。
-- 这里仅给出示例结构（注释掉，避免误用）：
--
-- INSERT INTO devices (device_id, device_name, device_type, station_id, status, device_secret_hash, metadata)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   '示例设备',
--   'multi_sensor',
--   (SELECT station_id FROM stations WHERE station_code='DEMO001'),
--   'inactive',
--   '$2b$10$replace_with_real_hash',
--   '{"note":"seed demo"}'
-- );

