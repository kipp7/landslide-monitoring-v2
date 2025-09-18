-- 扩展数据库表结构
-- 执行此SQL来扩展表结构

-- 1. 添加华为IoT数据中的新字段到 iot_data 表
ALTER TABLE public.iot_data
ADD COLUMN IF NOT EXISTS risk_level DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS alarm_active BOOLEAN NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS uptime INTEGER NULL,
ADD COLUMN IF NOT EXISTS angle_x DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS angle_y DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS angle_z DOUBLE PRECISION NULL;

-- 2. 扩展 iot_devices 表，添加友好名称字段
ALTER TABLE public.iot_devices
ADD COLUMN IF NOT EXISTS friendly_name TEXT NULL,
ADD COLUMN IF NOT EXISTS display_name TEXT NULL,
ADD COLUMN IF NOT EXISTS short_name TEXT NULL,
ADD COLUMN IF NOT EXISTS device_type TEXT NULL DEFAULT 'sensor',
ADD COLUMN IF NOT EXISTS manufacturer TEXT NULL DEFAULT '华为云IoT',
ADD COLUMN IF NOT EXISTS model TEXT NULL,
ADD COLUMN IF NOT EXISTS firmware_version TEXT NULL DEFAULT 'v1.0.0',
ADD COLUMN IF NOT EXISTS status TEXT NULL DEFAULT 'online';

-- 3. 扩展 iot_device_locations 表，添加位置名称字段
ALTER TABLE public.iot_device_locations
ADD COLUMN IF NOT EXISTS location_name TEXT NULL,
ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS installation_site TEXT NULL;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_iot_data_risk_level
ON public.iot_data USING btree (risk_level) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_iot_data_alarm_active
ON public.iot_data USING btree (alarm_active) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_iot_data_latitude_longitude
ON public.iot_data USING btree (latitude, longitude) TABLESPACE pg_default;

-- 添加注释说明字段用途
COMMENT ON COLUMN public.iot_data.risk_level IS '风险等级 (0-1)';
COMMENT ON COLUMN public.iot_data.alarm_active IS '是否触发报警';
COMMENT ON COLUMN public.iot_data.uptime IS '设备运行时间 (秒)';
COMMENT ON COLUMN public.iot_data.angle_x IS 'X轴角度 (弧度)';
COMMENT ON COLUMN public.iot_data.angle_y IS 'Y轴角度 (弧度)';
COMMENT ON COLUMN public.iot_data.angle_z IS 'Z轴角度 (弧度)';

-- 创建自动计算函数
-- 用于自动计算总加速度和总角速度
CREATE OR REPLACE FUNCTION calculate_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- 计算总加速度和总角速度
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

-- 创建触发器自动计算总值
DROP TRIGGER IF EXISTS trigger_calculate_totals ON public.iot_data;
CREATE TRIGGER trigger_calculate_totals
    BEFORE INSERT OR UPDATE ON public.iot_data
    FOR EACH ROW
    EXECUTE FUNCTION calculate_totals();
