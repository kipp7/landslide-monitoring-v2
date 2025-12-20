-- 快速生成GPS测试数据
-- 为device_1和device_2生成最近24小时的数据

-- 清理旧数据（可选）
-- DELETE FROM iot_data WHERE device_id IN ('device_1', 'device_2');

-- 为device_1生成100个数据点
INSERT INTO iot_data (
    device_id,
    event_time,
    latitude,
    longitude,
    deformation_distance_3d,
    deformation_horizontal,
    deformation_vertical,
    deformation_velocity,
    deformation_confidence,
    baseline_established,
    temperature,
    humidity,
    illumination,
    vibration,
    risk_level
)
SELECT 
    'device_1' as device_id,
    (NOW() - INTERVAL '24 hours') + (generate_series * INTERVAL '15 minutes') as event_time,
    
    -- 基于基准点的GPS坐标（线性形变）
    22.62736667 + 
        (random() - 0.5) * 0.000001 + -- GPS噪声
        (generate_series::DOUBLE PRECISION / 100.0) * 0.000005 as latitude,
    
    114.05743983 + 
        (random() - 0.5) * 0.000001 + -- GPS噪声
        (generate_series::DOUBLE PRECISION / 100.0) * 0.000003 as longitude,
    
    -- 形变距离（米）
    (generate_series::DOUBLE PRECISION / 100.0) * 0.8 + random() * 0.1 as deformation_distance_3d,
    
    -- 水平和垂直形变
    (generate_series::DOUBLE PRECISION / 100.0) * 0.72 + random() * 0.05 as deformation_horizontal,
    (generate_series::DOUBLE PRECISION / 100.0) * 0.08 + random() * 0.02 as deformation_vertical,
    
    -- 形变速度
    CASE 
        WHEN generate_series = 0 THEN 0
        ELSE random() * 0.001
    END as deformation_velocity,
    
    -- 置信度
    0.85 + (random() - 0.5) * 0.2 as deformation_confidence,
    
    true as baseline_established,
    
    -- 环境数据
    20 + random() * 10 as temperature,
    60 + random() * 20 as humidity,
    1000 + random() * 500 as illumination,
    
    -- 振动数据
    (10 + random() * 20)::INTEGER as vibration,
    
    -- 风险等级
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.3 THEN 0
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.6 THEN 1
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.8 THEN 2
        ELSE 3
    END as risk_level

FROM generate_series(0, 99) -- 生成100个数据点
ON CONFLICT DO NOTHING;

-- 为device_2生成100个数据点
INSERT INTO iot_data (
    device_id,
    event_time,
    latitude,
    longitude,
    deformation_distance_3d,
    deformation_horizontal,
    deformation_vertical,
    deformation_velocity,
    deformation_confidence,
    baseline_established,
    temperature,
    humidity,
    illumination,
    vibration,
    risk_level
)
SELECT 
    'device_2' as device_id,
    (NOW() - INTERVAL '24 hours') + (generate_series * INTERVAL '15 minutes') as event_time,
    
    -- 基于基准点的GPS坐标（突变形变）
    22.627100 + 
        (random() - 0.5) * 0.000001 + -- GPS噪声
        CASE 
            WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN (random() - 0.5) * 0.0000005
            ELSE 0.000008 + (random() - 0.5) * 0.000001
        END as latitude,
    
    114.057900 + 
        (random() - 0.5) * 0.000001 + -- GPS噪声
        CASE 
            WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN (random() - 0.5) * 0.0000005
            ELSE 0.000003 + (random() - 0.5) * 0.000001
        END as longitude,
    
    -- 形变距离（突变模式）
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN random() * 0.05
        ELSE 0.8 + random() * 0.1
    END as deformation_distance_3d,
    
    -- 水平和垂直形变
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN random() * 0.03
        ELSE 0.72 + random() * 0.05
    END as deformation_horizontal,
    
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN random() * 0.01
        ELSE 0.08 + random() * 0.02
    END as deformation_vertical,
    
    -- 形变速度
    CASE 
        WHEN generate_series = 0 THEN 0
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN random() * 0.0001
        ELSE random() * 0.003
    END as deformation_velocity,
    
    -- 置信度
    0.85 + (random() - 0.5) * 0.2 as deformation_confidence,
    
    true as baseline_established,
    
    -- 环境数据
    22 + random() * 8 as temperature,
    65 + random() * 15 as humidity,
    800 + random() * 400 as illumination,
    
    -- 振动数据（突变模式）
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN (8 + random() * 5)::INTEGER
        ELSE (80 + random() * 40)::INTEGER
    END as vibration,
    
    -- 风险等级（突变模式）
    CASE 
        WHEN generate_series::DOUBLE PRECISION / 100.0 < 0.7 THEN 0
        ELSE 4
    END as risk_level

FROM generate_series(0, 99) -- 生成100个数据点
ON CONFLICT DO NOTHING;

-- 验证生成的数据
SELECT 
    device_id,
    COUNT(*) as data_count,
    MIN(event_time) as start_time,
    MAX(event_time) as end_time,
    ROUND(AVG(deformation_distance_3d * 1000)::NUMERIC, 2) as avg_displacement_mm,
    ROUND(MAX(deformation_distance_3d * 1000)::NUMERIC, 2) as max_displacement_mm
FROM iot_data 
WHERE device_id IN ('device_1', 'device_2')
AND event_time >= NOW() - INTERVAL '24 hours'
GROUP BY device_id
ORDER BY device_id;

-- 显示最新的几条数据
SELECT 
    device_id,
    event_time,
    ROUND(latitude::NUMERIC, 8) as latitude,
    ROUND(longitude::NUMERIC, 8) as longitude,
    ROUND((deformation_distance_3d * 1000)::NUMERIC, 2) as displacement_mm,
    risk_level
FROM iot_data 
WHERE device_id IN ('device_1', 'device_2')
ORDER BY event_time DESC 
LIMIT 10;
