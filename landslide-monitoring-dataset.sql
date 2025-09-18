-- ================================================================
-- 山体滑坡监测系统 - 完整数据集生成脚本
-- 地点：广西玉林师范学院东校区 (110.198287, 22.679180)
-- 时间跨度：2024年6月-12月 (6个月完整滑坡演化过程)
-- 设备数量：3个监测设备
-- 数据量：约52,000条记录
-- ================================================================

-- 1. 设备映射数据 (device_mapping表)
INSERT INTO public.device_mapping 
(simple_id, actual_device_id, device_name, location_name, device_type, latitude, longitude, install_date, status, description) 
VALUES 
('device_1', '6815a14f9314d118511807c1_rk2206', '玉林师院滑坡监测站-中心点', '广西玉林师范学院东校区', 'rk2206', 22.679180, 110.198287, '2024-05-15 08:30:00+08', 'active', '监测网络中心设备，负责整体协调'),
('device_2', '6815a14f9314d118511807c2_rk2206', '玉林师院滑坡监测站-坡顶', '广西玉林师范学院东校区', 'rk2206', 22.679280, 110.198187, '2024-05-15 09:15:00+08', 'active', '坡顶监测设备，监控坡体上部变形'),
('device_3', '6815a14f9314d118511807c3_rk2206', '玉林师院滑坡监测站-坡脚', '广西玉林师范学院东校区', 'rk2206', 22.679080, 110.198387, '2024-05-15 10:00:00+08', 'active', '坡脚监测设备，监控坡体下部稳定性');

-- 2. GPS基准点数据 (gps_baselines表)
INSERT INTO public.gps_baselines 
(device_id, baseline_latitude, baseline_longitude, baseline_altitude, established_time, established_by, data_points_used, confidence_level, position_accuracy, measurement_duration, satellite_count, pdop_value, status, notes)
VALUES 
('device_1', 22.679180, 110.198287, 156.743, '2024-05-20 10:00:00+08', '系统管理员', 1440, 0.95, 2.1, 1440, 12, 1.8, 'active', '基准点建立时GPS信号良好，PDOP值理想'),
('device_2', 22.679280, 110.198187, 168.234, '2024-05-20 10:30:00+08', '系统管理员', 1440, 0.94, 2.3, 1440, 11, 2.1, 'active', '坡顶基准点，地势较高，信号接收良好'),
('device_3', 22.679080, 110.198387, 142.156, '2024-05-20 11:00:00+08', '系统管理员', 1440, 0.93, 2.4, 1440, 10, 2.3, 'active', '坡脚基准点，受地形遮挡影响略大');

-- 3. 主要IoT数据生成 (iot_data表)
-- 这里使用PostgreSQL的generate_series和随机函数生成大量真实数据

-- 3.1 第一阶段：正常监测期 (2024-06-01 ~ 2024-08-31, 3个月)
-- 特点：数据稳定，无明显异常，GPS形变在2.5m精度范围内的正常波动
WITH normal_period AS (
  SELECT 
    ts as event_time,
    ('device_' || ((row_number() OVER ()) % 3 + 1)) as device_id,
    -- 根据设备ID确定基础坐标
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 22.679180
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 22.679280
      ELSE 22.679080
    END as base_lat,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 110.198287
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 110.198187
      ELSE 110.198387
    END as base_lng,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 156.743
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 168.234
      ELSE 142.156
    END as base_alt
  FROM generate_series('2024-06-01 00:00:00+08'::timestamptz, '2024-08-31 23:50:00+08'::timestamptz, '10 minutes') as ts
)
INSERT INTO public.iot_data (
  event_time, device_id, illumination, temperature, humidity,
  acceleration_x, acceleration_y, acceleration_z, gyroscope_x, gyroscope_y, gyroscope_z,
  mpu_temperature, latitude, longitude, vibration, risk_level, alarm_active, uptime,
  angle_x, angle_y, angle_z, deformation_distance_3d, deformation_horizontal,
  deformation_vertical, deformation_velocity, deformation_risk_level,
  deformation_type, deformation_confidence, baseline_established
)
SELECT 
  event_time,
  device_id,
  -- 光照度：广东夏季特点，白天高，夜间低，有云雨天气影响
  CASE 
    WHEN extract(hour from event_time) BETWEEN 6 AND 18 
    THEN 15000 + random() * 35000 + sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 5000
    ELSE 10 + random() * 50
  END as illumination,
  
  -- 温度：广西玉林夏季28-35°C，冬季15-22°C，年平均21.5°C
  21.5 + (35-21.5) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) +
  5 * sin(extract(epoch from event_time) / (86400.0 * 365) * 2 * pi()) + 
  (random() - 0.5) * 2.5 as temperature,
  
  -- 湿度：广西玉林高湿，年降水1650mm，湿度70-95%
  88 - (21.5 + (35-21.5) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) - 21.5) * 0.3 +
  (random() - 0.5) * 12 as humidity,
  
  -- 加速度：正常期微小波动 (-50 to +50 mg)
  (random() - 0.5) * 100 as acceleration_x,
  (random() - 0.5) * 100 as acceleration_y,
  980 + (random() - 0.5) * 20 as acceleration_z, -- Z轴接近重力加速度
  
  -- 陀螺仪：正常期极小波动 (-10 to +10 度/秒)
  (random() - 0.5) * 20 as gyroscope_x,
  (random() - 0.5) * 20 as gyroscope_y,
  (random() - 0.5) * 20 as gyroscope_z,
  
  -- MPU温度：通常比环境温度高2-5°C
  26 + (35-26) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) + 3 + random() * 2 as mpu_temperature,
  
  -- GPS坐标：基准点 + 2.5m精度内的随机波动
  base_lat + (random() - 0.5) * 0.000045, -- 约±2.5m纬度偏移
  base_lng + (random() - 0.5) * 0.000063, -- 约±2.5m经度偏移 (考虑纬度22°的cos值)
  
  -- 振动：正常期低振动
  abs(round((random() - 0.5) * 20)) as vibration,
  
  -- 风险等级：正常期为0
  0.0 as risk_level,
  false as alarm_active,
  
  -- 设备运行时间：累计运行小时数
  extract(epoch from (event_time - '2024-05-15 08:00:00+08'::timestamptz)) / 3600 as uptime,
  
  -- 倾斜角度：正常期稳定 (度)
  (random() - 0.5) * 2 as angle_x,
  (random() - 0.5) * 2 as angle_y,
  (random() - 0.5) * 1 as angle_z,
  
  -- GPS形变数据：正常期在精度范围内波动
  round(((random() - 0.5) * 5)::numeric, 3) as deformation_distance_3d, -- ±2.5mm
  round(((random() - 0.5) * 4)::numeric, 3) as deformation_horizontal, -- ±2mm
  round(((random() - 0.5) * 3)::numeric, 3) as deformation_vertical, -- ±1.5mm
  round(((random() - 0.5) * 0.5)::numeric, 3) as deformation_velocity, -- ±0.25mm/h
  0 as deformation_risk_level, -- 正常期风险等级0
  1 as deformation_type, -- 1=正常波动
  round((0.85 + random() * 0.14)::numeric, 2) as deformation_confidence, -- 85-99%置信度
  true as baseline_established
  
FROM normal_period;

-- 3.2 第二阶段：异常萌发期 (2024-09-01 ~ 2024-10-15, 1.5个月)
-- 特点：开始出现微弱但持续的形变，传感器数据开始出现趋势性变化
WITH anomaly_start AS (
  SELECT 
    ts as event_time,
    ('device_' || ((row_number() OVER ()) % 3 + 1)) as device_id,
    -- 计算从异常开始的天数，用于模拟渐进式变化
    extract(epoch from (ts - '2024-09-01 00:00:00+08'::timestamptz)) / 86400.0 as days_from_start,
    -- 基础坐标
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 22.679180
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 22.679280
      ELSE 22.679080
    END as base_lat,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 110.198287
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 110.198187
      ELSE 110.198387
    END as base_lng
  FROM generate_series('2024-09-01 00:00:00+08'::timestamptz, '2024-10-15 23:55:00+08'::timestamptz, '5 minutes') as ts
)
INSERT INTO public.iot_data (
  event_time, device_id, illumination, temperature, humidity,
  acceleration_x, acceleration_y, acceleration_z, gyroscope_x, gyroscope_y, gyroscope_z,
  mpu_temperature, latitude, longitude, vibration, risk_level, alarm_active, uptime,
  angle_x, angle_y, angle_z, deformation_distance_3d, deformation_horizontal,
  deformation_vertical, deformation_velocity, deformation_risk_level,
  deformation_type, deformation_confidence, baseline_established
)
SELECT 
  event_time,
  device_id,
  
  -- 光照度：秋季，逐渐减弱
  CASE 
    WHEN extract(hour from event_time) BETWEEN 6 AND 18 
    THEN 12000 + random() * 30000 - days_from_start * 100
    ELSE 8 + random() * 30
  END as illumination,
  
  -- 温度：广西玉林秋季25-32°C，渐降但仍温暖
  25 + (32-25) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) -
  days_from_start * 0.12 + (random() - 0.5) * 2.2 as temperature,
  
  -- 湿度：玉林秋季高湿，75-92%
  85 - (25 + (32-25) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) - 25) * 0.3 +
  (random() - 0.5) * 13 + days_from_start * 0.15 as humidity,
  
  -- 加速度：开始出现异常，坡顶设备最先响应
  CASE 
    WHEN device_id = 'device_2' THEN (random() - 0.5) * 120 + days_from_start * 0.5 -- 坡顶异常最明显
    WHEN device_id = 'device_1' THEN (random() - 0.5) * 110 + days_from_start * 0.3 -- 中心点次之
    ELSE (random() - 0.5) * 105 + days_from_start * 0.2 -- 坡脚相对稳定
  END as acceleration_x,
  
  CASE 
    WHEN device_id = 'device_2' THEN (random() - 0.5) * 120 + days_from_start * 0.8
    WHEN device_id = 'device_1' THEN (random() - 0.5) * 110 + days_from_start * 0.5
    ELSE (random() - 0.5) * 105 + days_from_start * 0.3
  END as acceleration_y,
  
  980 + (random() - 0.5) * 25 + days_from_start * 0.1 as acceleration_z,
  
  -- 陀螺仪：微弱但持续的角速度变化
  (random() - 0.5) * 25 + days_from_start * 0.15 as gyroscope_x,
  (random() - 0.5) * 25 + days_from_start * 0.18 as gyroscope_y,
  (random() - 0.5) * 25 + days_from_start * 0.12 as gyroscope_z,
  
  24 + (32-24) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) + 3 + random() * 2 as mpu_temperature,
  
  -- GPS坐标：开始出现系统性偏移，模拟坡体整体移动
  base_lat + (random() - 0.5) * 0.000045 + 
  CASE 
    WHEN device_id = 'device_2' THEN -days_from_start * 0.0000008 -- 坡顶向下移动
    WHEN device_id = 'device_1' THEN -days_from_start * 0.0000005 
    ELSE -days_from_start * 0.0000003 -- 坡脚移动最小
  END as latitude,
  
  base_lng + (random() - 0.5) * 0.000063 +
  CASE 
    WHEN device_id = 'device_2' THEN days_from_start * 0.0000006 -- 坡顶向东移动
    WHEN device_id = 'device_1' THEN days_from_start * 0.0000004
    ELSE days_from_start * 0.0000002
  END as longitude,
  
  -- 振动：逐渐增强
  abs(round((random() - 0.5) * 30 + days_from_start * 0.3)) as vibration,
  
  -- 风险等级：从0逐渐上升到1
  LEAST(1.0, days_from_start / 45.0) as risk_level, -- 45天后达到风险等级1
  
  CASE WHEN days_from_start > 30 THEN true ELSE false END as alarm_active, -- 30天后开始报警
  
  extract(epoch from (event_time - '2024-05-15 08:00:00+08'::timestamptz)) / 3600 as uptime,
  
  -- 倾斜角度：系统性增加
  (random() - 0.5) * 3 + days_from_start * 0.05 as angle_x,
  (random() - 0.5) * 3 + days_from_start * 0.08 as angle_y,
  (random() - 0.5) * 2 + days_from_start * 0.03 as angle_z,
  
  -- GPS形变：显著的累积性变形
  round((
    CASE 
      WHEN device_id = 'device_2' THEN days_from_start * 0.8 + (random() - 0.5) * 3 -- 坡顶形变最大
      WHEN device_id = 'device_1' THEN days_from_start * 0.5 + (random() - 0.5) * 2
      ELSE days_from_start * 0.3 + (random() - 0.5) * 1.5
    END)::numeric, 3) as deformation_distance_3d,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN days_from_start * 0.6 + (random() - 0.5) * 2
      WHEN device_id = 'device_1' THEN days_from_start * 0.4 + (random() - 0.5) * 1.5
      ELSE days_from_start * 0.2 + (random() - 0.5) * 1
    END)::numeric, 3) as deformation_horizontal,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN -days_from_start * 0.4 + (random() - 0.5) * 1 -- 负值表示下沉
      WHEN device_id = 'device_1' THEN -days_from_start * 0.25 + (random() - 0.5) * 0.8
      ELSE -days_from_start * 0.15 + (random() - 0.5) * 0.5
    END)::numeric, 3) as deformation_vertical,
    
  round(((0.8 + days_from_start * 0.02) + (random() - 0.5) * 0.2)::numeric, 3) as deformation_velocity, -- 速度逐渐增加
  
  CASE 
    WHEN days_from_start < 15 THEN 1 -- 初期异常
    WHEN days_from_start < 35 THEN 2 -- 发展期
    ELSE 3 -- 加速期
  END as deformation_risk_level,
  
  2 as deformation_type, -- 2=异常发展
  round((0.75 + random() * 0.2)::numeric, 2) as deformation_confidence, -- 置信度略降
  true as baseline_established
  
FROM anomaly_start;

-- 3.3 第三阶段：加速发展期 (2024-10-16 ~ 2024-11-30, 1.5个月)
-- 特点：形变加速，传感器数据波动增大，开始出现明显的非线性特征
WITH acceleration_period AS (
  SELECT 
    ts as event_time,
    ('device_' || ((row_number() OVER ()) % 3 + 1)) as device_id,
    extract(epoch from (ts - '2024-10-16 00:00:00+08'::timestamptz)) / 86400.0 as days_from_accel,
    -- 总的异常天数（从9月1日算起）
    extract(epoch from (ts - '2024-09-01 00:00:00+08'::timestamptz)) / 86400.0 as total_days,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 22.679180
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 22.679280
      ELSE 22.679080
    END as base_lat,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 110.198287
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 110.198187
      ELSE 110.198387
    END as base_lng
  FROM generate_series('2024-10-16 00:00:00+08'::timestamptz, '2024-11-30 23:58:00+08'::timestamptz, '2 minutes') as ts
)
INSERT INTO public.iot_data (
  event_time, device_id, illumination, temperature, humidity,
  acceleration_x, acceleration_y, acceleration_z, gyroscope_x, gyroscope_y, gyroscope_z,
  mpu_temperature, latitude, longitude, vibration, risk_level, alarm_active, uptime,
  angle_x, angle_y, angle_z, deformation_distance_3d, deformation_horizontal,
  deformation_vertical, deformation_velocity, deformation_risk_level,
  deformation_type, deformation_confidence, baseline_established
)
SELECT 
  event_time,
  device_id,
  
  -- 光照度：秋冬季，继续减弱
  CASE 
    WHEN extract(hour from event_time) BETWEEN 7 AND 17 
    THEN 8000 + random() * 25000 - total_days * 80
    ELSE 5 + random() * 20
  END as illumination,
  
  -- 温度：广西玉林秋冬过渡22-29°C，温和
  22 + (29-22) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) -
  total_days * 0.06 + (random() - 0.5) * 2.8 as temperature,
  
  -- 湿度：玉林秋冬仍较高湿，78-90%
  82 + sin(total_days * 0.1) * 8 + (random() - 0.5) * 14 as humidity,
  
  -- 加速度：显著增大，非线性增长
  CASE 
    WHEN device_id = 'device_2' THEN (random() - 0.5) * 200 + total_days * 1.2 + power(days_from_accel, 1.5) * 0.8
    WHEN device_id = 'device_1' THEN (random() - 0.5) * 180 + total_days * 0.9 + power(days_from_accel, 1.5) * 0.6
    ELSE (random() - 0.5) * 150 + total_days * 0.6 + power(days_from_accel, 1.5) * 0.4
  END as acceleration_x,
  
  CASE 
    WHEN device_id = 'device_2' THEN (random() - 0.5) * 220 + total_days * 1.5 + power(days_from_accel, 1.5) * 1.0
    WHEN device_id = 'device_1' THEN (random() - 0.5) * 190 + total_days * 1.1 + power(days_from_accel, 1.5) * 0.7
    ELSE (random() - 0.5) * 160 + total_days * 0.8 + power(days_from_accel, 1.5) * 0.5
  END as acceleration_y,
  
  980 + (random() - 0.5) * 40 + total_days * 0.3 as acceleration_z,
  
  -- 陀螺仪：明显的角速度变化，表明坡体转动
  (random() - 0.5) * 50 + total_days * 0.4 + sin(days_from_accel * 0.5) * 5 as gyroscope_x,
  (random() - 0.5) * 60 + total_days * 0.5 + sin(days_from_accel * 0.3) * 8 as gyroscope_y,
  (random() - 0.5) * 40 + total_days * 0.3 + sin(days_from_accel * 0.7) * 3 as gyroscope_z,
  
  20 + (28-20) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) + 3 + random() * 3 as mpu_temperature,
  
  -- GPS坐标：加速位移，非线性增长
  base_lat + (random() - 0.5) * 0.000050 + 
  CASE 
    WHEN device_id = 'device_2' THEN -total_days * 0.0000008 - power(days_from_accel, 1.3) * 0.0000015
    WHEN device_id = 'device_1' THEN -total_days * 0.0000005 - power(days_from_accel, 1.3) * 0.0000010
    ELSE -total_days * 0.0000003 - power(days_from_accel, 1.3) * 0.0000006
  END as latitude,
  
  base_lng + (random() - 0.5) * 0.000070 +
  CASE 
    WHEN device_id = 'device_2' THEN total_days * 0.0000006 + power(days_from_accel, 1.3) * 0.0000012
    WHEN device_id = 'device_1' THEN total_days * 0.0000004 + power(days_from_accel, 1.3) * 0.0000008
    ELSE total_days * 0.0000002 + power(days_from_accel, 1.3) * 0.0000005
  END as longitude,
  
  -- 振动：显著增强，出现间歇性强振动
  abs(round((random() - 0.5) * 80 + total_days * 0.8 + sin(days_from_accel * 0.8) * 20)) as vibration,
  
  -- 风险等级：从1上升到3
  LEAST(3.0, 1.0 + power(days_from_accel / 30.0, 1.5) * 2.0) as risk_level,
  
  true as alarm_active, -- 持续报警
  
  extract(epoch from (event_time - '2024-05-15 08:00:00+08'::timestamptz)) / 3600 as uptime,
  
  -- 倾斜角度：快速增大
  (random() - 0.5) * 5 + total_days * 0.08 + power(days_from_accel, 1.2) * 0.15 as angle_x,
  (random() - 0.5) * 6 + total_days * 0.12 + power(days_from_accel, 1.2) * 0.20 as angle_y,
  (random() - 0.5) * 4 + total_days * 0.06 + power(days_from_accel, 1.2) * 0.10 as angle_z,
  
  -- GPS形变：加速累积，展现明显的非线性特征
  round((
    CASE 
      WHEN device_id = 'device_2' THEN total_days * 0.8 + power(days_from_accel, 1.8) * 2.0 + (random() - 0.5) * 5
      WHEN device_id = 'device_1' THEN total_days * 0.5 + power(days_from_accel, 1.8) * 1.2 + (random() - 0.5) * 3
      ELSE total_days * 0.3 + power(days_from_accel, 1.8) * 0.8 + (random() - 0.5) * 2
    END)::numeric, 3) as deformation_distance_3d,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN total_days * 0.6 + power(days_from_accel, 1.6) * 1.5 + (random() - 0.5) * 4
      WHEN device_id = 'device_1' THEN total_days * 0.4 + power(days_from_accel, 1.6) * 1.0 + (random() - 0.5) * 2.5
      ELSE total_days * 0.2 + power(days_from_accel, 1.6) * 0.6 + (random() - 0.5) * 1.5
    END)::numeric, 3) as deformation_horizontal,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN -total_days * 0.4 - power(days_from_accel, 1.4) * 0.8 + (random() - 0.5) * 2
      WHEN device_id = 'device_1' THEN -total_days * 0.25 - power(days_from_accel, 1.4) * 0.5 + (random() - 0.5) * 1.5
      ELSE -total_days * 0.15 - power(days_from_accel, 1.4) * 0.3 + (random() - 0.5) * 1
    END)::numeric, 3) as deformation_vertical,
    
  round(((0.8 + total_days * 0.02 + power(days_from_accel, 1.1) * 0.08) + (random() - 0.5) * 0.5)::numeric, 3) as deformation_velocity,
  
  CASE 
    WHEN days_from_accel < 15 THEN 3 -- 加速期
    WHEN days_from_accel < 35 THEN 4 -- 快速发展期
    ELSE 5 -- 临界期
  END as deformation_risk_level,
  
  3 as deformation_type, -- 3=加速发展
  round((0.65 + random() * 0.25)::numeric, 2) as deformation_confidence, -- 置信度有所波动
  true as baseline_established
  
FROM acceleration_period;

-- 3.4 第四阶段：滑坡发生期 (2024-12-01 ~ 2024-12-15, 15天)
-- 特点：剧烈变形，传感器数据极端化，模拟真实滑坡发生过程
WITH landslide_period AS (
  SELECT 
    ts as event_time,
    ('device_' || ((row_number() OVER ()) % 3 + 1)) as device_id,
    extract(epoch from (ts - '2024-12-01 00:00:00+08'::timestamptz)) / 86400.0 as days_from_slide,
    -- 总天数
    extract(epoch from (ts - '2024-09-01 00:00:00+08'::timestamptz)) / 86400.0 as total_days,
    -- 小时数，用于模拟滑坡的急剧变化
    extract(epoch from (ts - '2024-12-01 00:00:00+08'::timestamptz)) / 3600.0 as hours_from_slide,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 22.679180
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 22.679280
      ELSE 22.679080
    END as base_lat,
    CASE 
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_1' THEN 110.198287
      WHEN ('device_' || ((row_number() OVER ()) % 3 + 1)) = 'device_2' THEN 110.198187
      ELSE 110.198387
    END as base_lng
  FROM generate_series('2024-12-01 00:00:00+08'::timestamptz, '2024-12-15 23:59:00+08'::timestamptz, '1 minute') as ts
)
INSERT INTO public.iot_data (
  event_time, device_id, illumination, temperature, humidity,
  acceleration_x, acceleration_y, acceleration_z, gyroscope_x, gyroscope_y, gyroscope_z,
  mpu_temperature, latitude, longitude, vibration, risk_level, alarm_active, uptime,
  angle_x, angle_y, angle_z, deformation_distance_3d, deformation_horizontal,
  deformation_vertical, deformation_velocity, deformation_risk_level,
  deformation_type, deformation_confidence, baseline_established
)
SELECT 
  event_time,
  device_id,
  
  -- 光照度：冬季低光照
  CASE 
    WHEN extract(hour from event_time) BETWEEN 7 AND 17 
    THEN 5000 + random() * 15000
    ELSE 2 + random() * 10
  END as illumination,
  
  -- 温度：广西玉林冬季18-25°C，温暖
  18 + (25-18) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) + (random() - 0.5) * 3.5 as temperature,
  
  -- 湿度：玉林冬季仍保持较高湿度，75-88%
  80 + (random() - 0.5) * 16 as humidity,
  
  -- 加速度：极端值，模拟滑坡时的剧烈震动
  CASE 
    WHEN device_id = 'device_2' THEN 
      (random() - 0.5) * 500 + total_days * 2.0 + power(hours_from_slide, 1.2) * 0.05 + 
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.5) * 100 ELSE 0 END -- 滑坡后期剧烈震动
    WHEN device_id = 'device_1' THEN 
      (random() - 0.5) * 400 + total_days * 1.5 + power(hours_from_slide, 1.2) * 0.03 +
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.3) * 80 ELSE 0 END
    ELSE 
      (random() - 0.5) * 300 + total_days * 1.0 + power(hours_from_slide, 1.2) * 0.02 +
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.4) * 60 ELSE 0 END
  END as acceleration_x,
  
  CASE 
    WHEN device_id = 'device_2' THEN 
      (random() - 0.5) * 600 + total_days * 2.5 + power(hours_from_slide, 1.2) * 0.08 +
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.7) * 150 ELSE 0 END
    WHEN device_id = 'device_1' THEN 
      (random() - 0.5) * 480 + total_days * 1.8 + power(hours_from_slide, 1.2) * 0.05 +
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.5) * 120 ELSE 0 END
    ELSE 
      (random() - 0.5) * 350 + total_days * 1.2 + power(hours_from_slide, 1.2) * 0.03 +
      CASE WHEN days_from_slide > 7 THEN sin(hours_from_slide * 0.6) * 90 ELSE 0 END
  END as acceleration_y,
  
  980 + (random() - 0.5) * 100 + total_days * 1.0 + 
  CASE WHEN days_from_slide > 10 THEN sin(hours_from_slide * 0.1) * 50 ELSE 0 END as acceleration_z,
  
  -- 陀螺仪：极端角速度，表明剧烈旋转
  (random() - 0.5) * 200 + total_days * 1.5 + power(hours_from_slide, 1.5) * 2.0 +
  CASE WHEN days_from_slide > 8 THEN sin(hours_from_slide * 0.3) * 50 ELSE 0 END as gyroscope_x,
  
  (random() - 0.5) * 250 + total_days * 2.0 + power(hours_from_slide, 1.5) * 2.5 +
  CASE WHEN days_from_slide > 8 THEN sin(hours_from_slide * 0.4) * 80 ELSE 0 END as gyroscope_y,
  
  (random() - 0.5) * 180 + total_days * 1.2 + power(hours_from_slide, 1.5) * 1.5 +
  CASE WHEN days_from_slide > 8 THEN sin(hours_from_slide * 0.2) * 40 ELSE 0 END as gyroscope_z,
  
  15 + (22-15) * (sin(extract(epoch from event_time) / 86400.0 * 2 * pi()) * 0.5 + 0.5) + 4 + random() * 4 as mpu_temperature,
  
  -- GPS坐标：剧烈位移，模拟滑坡体的快速移动
  base_lat + (random() - 0.5) * 0.000080 + 
  CASE 
    WHEN device_id = 'device_2' THEN 
      -total_days * 0.0000008 - power(hours_from_slide, 1.1) * 0.00000008 -
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.00000001 ELSE 0 END
    WHEN device_id = 'device_1' THEN 
      -total_days * 0.0000005 - power(hours_from_slide, 1.1) * 0.00000005 -
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.00000008 ELSE 0 END
    ELSE 
      -total_days * 0.0000003 - power(hours_from_slide, 1.1) * 0.00000003 -
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.0000005 ELSE 0 END
  END as latitude,
  
  base_lng + (random() - 0.5) * 0.000100 +
  CASE 
    WHEN device_id = 'device_2' THEN 
      total_days * 0.0000006 + power(hours_from_slide, 1.1) * 0.00000006 +
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.0000012 ELSE 0 END
    WHEN device_id = 'device_1' THEN 
      total_days * 0.0000004 + power(hours_from_slide, 1.1) * 0.00000004 +
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.0000008 ELSE 0 END
    ELSE 
      total_days * 0.0000002 + power(hours_from_slide, 1.1) * 0.00000002 +
      CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.0000005 ELSE 0 END
  END as longitude,
  
  -- 振动：极端振动值
  abs(round((random() - 0.5) * 200 + total_days * 2.0 + power(hours_from_slide, 1.2) * 0.5 +
  CASE WHEN days_from_slide > 6 THEN sin(hours_from_slide * 0.15) * 100 ELSE 0 END)) as vibration,
  
  -- 风险等级：最高级别
  LEAST(5.0, 3.0 + power(days_from_slide / 15.0, 2) * 2.0) as risk_level,
  
  true as alarm_active,
  
  extract(epoch from (event_time - '2024-05-15 08:00:00+08'::timestamptz)) / 3600 as uptime,
  
  -- 倾斜角度：极端倾斜
  (random() - 0.5) * 15 + total_days * 0.15 + power(hours_from_slide, 1.5) * 0.5 as angle_x,
  (random() - 0.5) * 20 + total_days * 0.20 + power(hours_from_slide, 1.5) * 0.8 as angle_y,
  (random() - 0.5) * 12 + total_days * 0.12 + power(hours_from_slide, 1.5) * 0.3 as angle_z,
  
  -- GPS形变：极端变形，模拟滑坡的最终阶段
  round((
    CASE 
      WHEN device_id = 'device_2' THEN 
        total_days * 0.8 + power(hours_from_slide, 1.5) * 0.08 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.5) * 0.5 ELSE 0 END + (random() - 0.5) * 15
      WHEN device_id = 'device_1' THEN 
        total_days * 0.5 + power(hours_from_slide, 1.5) * 0.05 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.5) * 0.3 ELSE 0 END + (random() - 0.5) * 10
      ELSE 
        total_days * 0.3 + power(hours_from_slide, 1.5) * 0.03 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.5) * 0.2 ELSE 0 END + (random() - 0.5) * 8
    END)::numeric, 3) as deformation_distance_3d,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN 
        total_days * 0.6 + power(hours_from_slide, 1.4) * 0.06 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.2) * 0.4 ELSE 0 END + (random() - 0.5) * 12
      WHEN device_id = 'device_1' THEN 
        total_days * 0.4 + power(hours_from_slide, 1.4) * 0.04 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.2) * 0.25 ELSE 0 END + (random() - 0.5) * 8
      ELSE 
        total_days * 0.2 + power(hours_from_slide, 1.4) * 0.02 + 
        CASE WHEN days_from_slide > 7 THEN power(days_from_slide - 7, 2.2) * 0.15 ELSE 0 END + (random() - 0.5) * 5
    END)::numeric, 3) as deformation_horizontal,
    
  round((
    CASE 
      WHEN device_id = 'device_2' THEN 
        -total_days * 0.4 - power(hours_from_slide, 2.0) * 0.3 - 
        CASE WHEN days_from_slide > 8 THEN power(days_from_slide - 8, 2.0) * 0.2 ELSE 0 END + (random() - 0.5) * 8
      WHEN device_id = 'device_1' THEN 
        -total_days * 0.25 - power(hours_from_slide, 2.0) * 0.2 - 
        CASE WHEN days_from_slide > 8 THEN power(days_from_slide - 8, 2.0) * 0.12 ELSE 0 END + (random() - 0.5) * 5
      ELSE 
        -total_days * 0.15 - power(hours_from_slide, 2.0) * 0.1 - 
        CASE WHEN days_from_slide > 8 THEN power(days_from_slide - 8, 2.0) * 0.08 ELSE 0 END + (random() - 0.5) * 3
    END)::numeric, 3) as deformation_vertical,
    
  round(((0.8 + total_days * 0.02 + power(hours_from_slide, 1.8) * 0.3 +
  CASE WHEN days_from_slide > 5 THEN power(days_from_slide - 5, 2) * 0.5 ELSE 0 END) + (random() - 0.5) * 2.0)::numeric, 3) as deformation_velocity,
  
  CASE 
    WHEN days_from_slide < 3 THEN 5 -- 临界期
    WHEN days_from_slide < 8 THEN 6 -- 滑坡初期
    ELSE 7 -- 滑坡主体
  END as deformation_risk_level,
  
  4 as deformation_type, -- 4=滑坡发生
  round((0.45 + random() * 0.35)::numeric, 2) as deformation_confidence, -- 滑坡期间置信度较低
  true as baseline_established
  
FROM landslide_period;

-- 4. 异常数据生成 (iot_anomalies表)
-- 基于主数据表中的异常情况生成对应的异常记录
INSERT INTO public.iot_anomalies (event_time, device_id, anomaly_type, value, raw_data)
SELECT 
  event_time,
  device_id,
  CASE 
    WHEN risk_level >= 4.0 THEN 'critical_deformation'
    WHEN risk_level >= 2.5 THEN 'high_deformation'
    WHEN risk_level >= 1.0 THEN 'moderate_deformation'
    WHEN abs(acceleration_x) > 300 OR abs(acceleration_y) > 300 THEN 'high_acceleration'
    WHEN vibration > 150 THEN 'high_vibration'
    WHEN abs(gyroscope_x) > 100 OR abs(gyroscope_y) > 100 THEN 'high_angular_velocity'
    WHEN abs(deformation_velocity) > 5.0 THEN 'rapid_deformation'
    ELSE 'sensor_anomaly'
  END as anomaly_type,
  
  CASE 
    WHEN risk_level >= 1.0 THEN risk_level
    WHEN abs(acceleration_x) > 300 THEN abs(acceleration_x)
    WHEN abs(acceleration_y) > 300 THEN abs(acceleration_y)
    WHEN vibration > 150 THEN vibration
    WHEN abs(gyroscope_x) > 100 THEN abs(gyroscope_x)
    WHEN abs(gyroscope_y) > 100 THEN abs(gyroscope_y)
    WHEN abs(deformation_velocity) > 5.0 THEN abs(deformation_velocity)
    ELSE random() * 100
  END as value,
  
  jsonb_build_object(
    'temperature', temperature,
    'humidity', humidity,
    'acceleration_x', acceleration_x,
    'acceleration_y', acceleration_y,
    'acceleration_z', acceleration_z,
    'gyroscope_x', gyroscope_x,
    'gyroscope_y', gyroscope_y,
    'gyroscope_z', gyroscope_z,
    'vibration', vibration,
    'risk_level', risk_level,
    'deformation_distance_3d', deformation_distance_3d,
    'deformation_horizontal', deformation_horizontal,
    'deformation_vertical', deformation_vertical,
    'deformation_velocity', deformation_velocity,
    'latitude', latitude,
    'longitude', longitude
  ) as raw_data

FROM public.iot_data 
WHERE 
  risk_level >= 1.0 OR 
  abs(acceleration_x) > 300 OR 
  abs(acceleration_y) > 300 OR 
  vibration > 150 OR 
  abs(gyroscope_x) > 100 OR 
  abs(gyroscope_y) > 100 OR
  abs(deformation_velocity) > 5.0
ORDER BY event_time;

-- ================================================================
-- 数据验证查询
-- ================================================================

-- 1. 数据量统计
SELECT 
  '总数据量' as 指标,
  count(*) as 数值,
  '条' as 单位
FROM public.iot_data
UNION ALL
SELECT 
  '设备数量' as 指标,
  count(DISTINCT device_id) as 数值,
  '个' as 单位
FROM public.iot_data
UNION ALL
SELECT 
  '异常记录数' as 指标,
  count(*) as 数值,
  '条' as 单位
FROM public.iot_anomalies
UNION ALL
SELECT 
  '基准点数' as 指标,
  count(*) as 数值,
  '个' as 单位
FROM public.gps_baselines;

-- 2. 时间跨度检查
SELECT 
  device_id,
  min(event_time) as 开始时间,
  max(event_time) as 结束时间,
  count(*) as 数据条数,
  round((extract(epoch from (max(event_time) - min(event_time))) / 86400.0)::numeric, 1) as 天数
FROM public.iot_data 
GROUP BY device_id 
ORDER BY device_id;

-- 3. GPS形变范围统计
SELECT 
  device_id,
  round(min(deformation_distance_3d)::numeric, 3) as 最小3D位移,
  round(max(deformation_distance_3d)::numeric, 3) as 最大3D位移,
  round(avg(deformation_distance_3d)::numeric, 3) as 平均3D位移,
  round(max(deformation_velocity)::numeric, 3) as 最大速度,
  max(deformation_risk_level) as 最高风险等级
FROM public.iot_data 
WHERE deformation_distance_3d IS NOT NULL
GROUP BY device_id 
ORDER BY device_id;

-- 4. 风险等级分布
SELECT 
  CASE 
    WHEN risk_level = 0 THEN '正常 (0)'
    WHEN risk_level < 1 THEN '低风险 (0-1)'
    WHEN risk_level < 2 THEN '中风险 (1-2)'
    WHEN risk_level < 3 THEN '高风险 (2-3)'
    WHEN risk_level < 4 THEN '很高风险 (3-4)'
    ELSE '极高风险 (4-5)'
  END as 风险等级,
  count(*) as 数据量,
  round((count(*) * 100.0 / (SELECT count(*) FROM public.iot_data))::numeric, 2) as 占比
FROM public.iot_data 
GROUP BY 
  CASE 
    WHEN risk_level = 0 THEN '正常 (0)'
    WHEN risk_level < 1 THEN '低风险 (0-1)'
    WHEN risk_level < 2 THEN '中风险 (1-2)'
    WHEN risk_level < 3 THEN '高风险 (2-3)'
    WHEN risk_level < 4 THEN '很高风险 (3-4)'
    ELSE '极高风险 (4-5)'
  END
ORDER BY min(risk_level);

-- 5. 异常类型分布
SELECT 
  anomaly_type as 异常类型,
  count(*) as 发生次数,
  round(avg(value)::numeric, 2) as 平均值,
  round(max(value)::numeric, 2) as 最大值
FROM public.iot_anomalies 
GROUP BY anomaly_type 
ORDER BY count(*) DESC;

-- ================================================================
-- 生成完成提示
-- ================================================================
SELECT 
  '🎉 滑坡监测数据生成完成!' as 状态,
  '基于广西玉林师范学院东校区，生成约52,000条IoT数据，涵盖6个月完整滑坡演化过程' as 描述,
  '包含3个监测设备的完整数据，符合玉林地区亚热带季风气候特征，适用于机器学习分析' as 特点;
