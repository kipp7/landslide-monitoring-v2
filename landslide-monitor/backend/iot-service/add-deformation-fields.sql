-- 添加GPS形变分析字段到 iot_data 表
-- 在Supabase SQL编辑器中执行此脚本

-- 添加GPS形变分析属性字段
ALTER TABLE public.iot_data
ADD COLUMN IF NOT EXISTS deformation_distance_3d DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_horizontal DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_vertical DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_velocity DECIMAL(8,3) NULL,
ADD COLUMN IF NOT EXISTS deformation_risk_level INTEGER NULL,
ADD COLUMN IF NOT EXISTS deformation_type INTEGER NULL,
ADD COLUMN IF NOT EXISTS deformation_confidence DECIMAL(3,2) NULL,
ADD COLUMN IF NOT EXISTS baseline_established BOOLEAN NULL DEFAULT FALSE;

-- 添加注释说明字段用途
COMMENT ON COLUMN public.iot_data.deformation_distance_3d IS '3D总位移距离 (m, 0.0~1000.0)';
COMMENT ON COLUMN public.iot_data.deformation_horizontal IS '水平位移距离 (m, 0.0~1000.0)';
COMMENT ON COLUMN public.iot_data.deformation_vertical IS '垂直位移距离 (m, -500.0~500.0, 正值上升，负值下降)';
COMMENT ON COLUMN public.iot_data.deformation_velocity IS '形变速度 (m/h, 0.0~100.0)';
COMMENT ON COLUMN public.iot_data.deformation_risk_level IS '形变风险等级 (0=安全,1=低风险,2=中风险,3=高风险,4=危险)';
COMMENT ON COLUMN public.iot_data.deformation_type IS '形变类型 (0=无形变,1=水平,2=垂直,3=复合,4=旋转)';
COMMENT ON COLUMN public.iot_data.deformation_confidence IS '分析置信度 (0.0~1.0)';
COMMENT ON COLUMN public.iot_data.baseline_established IS '是否已建立基准位置';
