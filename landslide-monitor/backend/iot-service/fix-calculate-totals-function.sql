-- 修复 calculate_totals 函数，移除异常检测逻辑
-- 在Supabase SQL编辑器中执行

-- 1. 查看当前的 calculate_totals 函数
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'calculate_totals';

-- 2. 删除旧的函数
DROP FUNCTION IF EXISTS calculate_totals();

-- 3. 重新创建函数，只计算总值，不做异常检测
CREATE OR REPLACE FUNCTION calculate_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- 只计算总加速度和总角速度，不做任何异常检测
    NEW.acceleration_total := SQRT(
        COALESCE(NEW.acceleration_x, 0)^2 + 
        COALESCE(NEW.acceleration_y, 0)^2 + 
        COALESCE(NEW.acceleration_z, 0)^2
    );
    
    NEW.gyroscope_total := SQRT(
        COALESCE(NEW.gyroscope_x, 0)^2 + 
        COALESCE(NEW.gyroscope_y, 0)^2 + 
        COALESCE(NEW.gyroscope_z, 0)^2
    );
    
    -- 不做任何异常检测，直接返回
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 清理所有现有的加速度异常记录
DELETE FROM public.iot_anomalies 
WHERE anomaly_type = 'acceleration_high';

-- 5. 验证函数是否正确更新
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'calculate_totals';

-- 6. 测试：插入一条测试数据看是否还会产生异常
-- （这条数据会被自动删除，只是为了测试）
INSERT INTO iot_data (device_id, acceleration_x, acceleration_y, acceleration_z, temperature, humidity)
VALUES ('test_trigger', 1000, 1000, 1000, 25.0, 50.0);

-- 检查是否产生了异常记录
SELECT COUNT(*) as anomaly_count 
FROM iot_anomalies 
WHERE device_id = 'test_trigger';

-- 删除测试数据
DELETE FROM iot_data WHERE device_id = 'test_trigger';

-- 7. 显示结果
SELECT 
    'Function updated successfully' as status,
    COUNT(*) as remaining_anomalies
FROM iot_anomalies 
WHERE anomaly_type = 'acceleration_high';
