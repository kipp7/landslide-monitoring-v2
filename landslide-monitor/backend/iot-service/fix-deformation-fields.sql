-- 修复GPS形变分析字段精度问题
-- 解决 numeric field overflow 错误

-- 1. 修改形变距离字段精度，支持更大的数值范围
ALTER TABLE public.iot_data
ALTER COLUMN deformation_distance_3d TYPE DECIMAL(12,3);

ALTER TABLE public.iot_data
ALTER COLUMN deformation_horizontal TYPE DECIMAL(12,3);

ALTER TABLE public.iot_data
ALTER COLUMN deformation_vertical TYPE DECIMAL(12,3);

-- 2. 修改形变速度字段精度
ALTER TABLE public.iot_data
ALTER COLUMN deformation_velocity TYPE DECIMAL(10,4);

-- 3. 更新字段注释，反映新的数值范围
COMMENT ON COLUMN public.iot_data.deformation_distance_3d IS '3D总位移距离 (m, 支持大范围数值)';
COMMENT ON COLUMN public.iot_data.deformation_horizontal IS '水平位移距离 (m, 支持大范围数值)';
COMMENT ON COLUMN public.iot_data.deformation_vertical IS '垂直位移距离 (m, 支持大范围数值，正值上升，负值下降)';
COMMENT ON COLUMN public.iot_data.deformation_velocity IS '形变速度 (m/h, 支持高精度数值)';

-- 4. 更新形变分析函数，适应新的数值范围
CREATE OR REPLACE FUNCTION calculate_deformation_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果有水平和垂直位移数据，自动计算3D总位移
    IF NEW.deformation_horizontal IS NOT NULL AND NEW.deformation_vertical IS NOT NULL THEN
        NEW.deformation_distance_3d := SQRT(
            POWER(COALESCE(NEW.deformation_horizontal, 0), 2) +
            POWER(COALESCE(NEW.deformation_vertical, 0), 2)
        );
    END IF;

    -- 根据位移距离自动评估风险等级（如果未手动设置）
    -- 调整风险等级阈值，适应更大的数值范围
    IF NEW.deformation_risk_level IS NULL AND NEW.deformation_distance_3d IS NOT NULL THEN
        CASE 
            WHEN NEW.deformation_distance_3d >= 1000000.0 THEN NEW.deformation_risk_level := 4; -- 危险 (>1000km)
            WHEN NEW.deformation_distance_3d >= 100000.0 THEN NEW.deformation_risk_level := 3;  -- 高风险 (>100km)
            WHEN NEW.deformation_distance_3d >= 10000.0 THEN NEW.deformation_risk_level := 2;   -- 中风险 (>10km)
            WHEN NEW.deformation_distance_3d >= 1000.0 THEN NEW.deformation_risk_level := 1;    -- 低风险 (>1km)
            ELSE NEW.deformation_risk_level := 0; -- 安全
        END CASE;
    END IF;

    -- 根据水平和垂直位移自动判断形变类型（如果未手动设置）
    IF NEW.deformation_type IS NULL AND NEW.deformation_horizontal IS NOT NULL AND NEW.deformation_vertical IS NOT NULL THEN
        IF NEW.deformation_horizontal < 100.0 AND NEW.deformation_vertical < 100.0 THEN
            NEW.deformation_type := 0; -- 无形变
        ELSIF NEW.deformation_horizontal > NEW.deformation_vertical * 2 THEN
            NEW.deformation_type := 1; -- 水平
        ELSIF NEW.deformation_vertical > NEW.deformation_horizontal * 2 THEN
            NEW.deformation_type := 2; -- 垂直
        ELSE
            NEW.deformation_type := 3; -- 复合
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 重新创建触发器
DROP TRIGGER IF EXISTS trigger_calculate_deformation_metrics ON public.iot_data;
CREATE TRIGGER trigger_calculate_deformation_metrics
    BEFORE INSERT OR UPDATE ON public.iot_data
    FOR EACH ROW
    EXECUTE FUNCTION calculate_deformation_metrics();

-- 6. 验证字段修改
SELECT 
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'iot_data' 
    AND column_name LIKE 'deformation_%'
ORDER BY column_name;
