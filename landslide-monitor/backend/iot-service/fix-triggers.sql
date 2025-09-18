-- 修复数据库触发器，更新异常检测阈值
-- 在Supabase SQL编辑器中执行

-- 1. 删除旧的触发器和函数
DROP TRIGGER IF EXISTS trigger_calculate_totals ON public.iot_data;
DROP FUNCTION IF EXISTS calculate_totals();

-- 2. 创建新的计算函数（只计算总值，不做异常检测）
CREATE OR REPLACE FUNCTION calculate_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- 只计算总加速度和总角速度，不做异常检测
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
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 重新创建触发器（只用于计算总值）
CREATE TRIGGER trigger_calculate_totals
    BEFORE INSERT OR UPDATE ON public.iot_data
    FOR EACH ROW
    EXECUTE FUNCTION calculate_totals();

-- 4. 删除可能存在的异常检测触发器
DROP TRIGGER IF EXISTS trigger_anomaly_detection ON public.iot_data;
DROP FUNCTION IF EXISTS detect_anomalies_trigger();

-- 5. 如果有自动异常检测的触发器，也删除它们
DROP TRIGGER IF EXISTS trigger_auto_anomaly_detection ON public.iot_data;
DROP FUNCTION IF EXISTS auto_detect_anomalies();

-- 6. 查看当前所有触发器
SELECT 
    schemaname,
    tablename,
    triggername,
    definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
AND c.relname IN ('iot_data', 'iot_anomalies', 'iot_devices');

-- 7. 清理异常表中的触发器产生的记录
DELETE FROM public.iot_anomalies 
WHERE anomaly_type = 'acceleration_high' 
AND value < 20000;  -- 删除低于新阈值的异常记录

-- 8. 显示清理结果
SELECT 
    'iot_data triggers' as table_name,
    COUNT(*) as trigger_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
AND c.relname = 'iot_data'
AND NOT t.tgisinternal;  -- 排除内部触发器
