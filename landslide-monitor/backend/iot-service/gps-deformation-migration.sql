-- GPS形变分析字段迁移
-- 执行此SQL来添加GPS和形变分析相关字段到 iot_data 表

-- 1. 添加GPS坐标字段（如果不存在）
ALTER TABLE public.iot_data
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) NULL,
ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) NULL;

-- 2. 添加GPS形变分析属性字段
ALTER TABLE public.iot_data
ADD COLUMN IF NOT EXISTS deformation_distance_3d DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_horizontal DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_vertical DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_velocity DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_risk_level INTEGER NULL,
ADD COLUMN IF NOT EXISTS deformation_type INTEGER NULL,
ADD COLUMN IF NOT EXISTS deformation_confidence DECIMAL(3,2) NULL,
ADD COLUMN IF NOT EXISTS baseline_established BOOLEAN NULL DEFAULT FALSE;

-- 3. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_iot_data_deformation_risk_level
ON public.iot_data USING btree (deformation_risk_level) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_iot_data_deformation_type
ON public.iot_data USING btree (deformation_type) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_iot_data_baseline_established
ON public.iot_data USING btree (baseline_established) TABLESPACE pg_default;

-- 4. 添加注释说明字段用途
COMMENT ON COLUMN public.iot_data.latitude IS 'GPS纬度坐标 (°, -90.0~90.0)';
COMMENT ON COLUMN public.iot_data.longitude IS 'GPS经度坐标 (°, -180.0~180.0)';
COMMENT ON COLUMN public.iot_data.deformation_distance_3d IS '3D总位移距离 (m, 0.0~1000.0)';
COMMENT ON COLUMN public.iot_data.deformation_horizontal IS '水平位移距离 (m, 0.0~1000.0)';
COMMENT ON COLUMN public.iot_data.deformation_vertical IS '垂直位移距离 (m, -500.0~500.0, 正值上升，负值下降)';
COMMENT ON COLUMN public.iot_data.deformation_velocity IS '形变速度 (m/h, 0.0~100.0)';
COMMENT ON COLUMN public.iot_data.deformation_risk_level IS '形变风险等级 (0=安全,1=低风险,2=中风险,3=高风险,4=危险)';
COMMENT ON COLUMN public.iot_data.deformation_type IS '形变类型 (0=无形变,1=水平,2=垂直,3=复合,4=旋转)';
COMMENT ON COLUMN public.iot_data.deformation_confidence IS '分析置信度 (0.0~1.0)';
COMMENT ON COLUMN public.iot_data.baseline_established IS '是否已建立基准位置';

-- 5. 创建形变分析函数
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
    IF NEW.deformation_risk_level IS NULL AND NEW.deformation_distance_3d IS NOT NULL THEN
        CASE 
            WHEN NEW.deformation_distance_3d >= 10.0 THEN NEW.deformation_risk_level := 4; -- 危险
            WHEN NEW.deformation_distance_3d >= 5.0 THEN NEW.deformation_risk_level := 3;  -- 高风险
            WHEN NEW.deformation_distance_3d >= 2.0 THEN NEW.deformation_risk_level := 2;  -- 中风险
            WHEN NEW.deformation_distance_3d >= 0.5 THEN NEW.deformation_risk_level := 1;  -- 低风险
            ELSE NEW.deformation_risk_level := 0; -- 安全
        END CASE;
    END IF;

    -- 根据水平和垂直位移自动判断形变类型（如果未手动设置）
    IF NEW.deformation_type IS NULL AND NEW.deformation_horizontal IS NOT NULL AND NEW.deformation_vertical IS NOT NULL THEN
        IF NEW.deformation_horizontal < 0.1 AND NEW.deformation_vertical < 0.1 THEN
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

-- 6. 创建触发器自动计算形变指标
DROP TRIGGER IF EXISTS trigger_calculate_deformation_metrics ON public.iot_data;
CREATE TRIGGER trigger_calculate_deformation_metrics
    BEFORE INSERT OR UPDATE ON public.iot_data
    FOR EACH ROW
    EXECUTE FUNCTION calculate_deformation_metrics();
