-- 设备映射表迁移脚本
-- 创建设备映射表，将简洁的device_1, device_2映射到实际的设备ID

-- 1. 创建设备映射表
CREATE TABLE IF NOT EXISTS public.device_mapping (
  id SERIAL PRIMARY KEY,
  simple_id TEXT UNIQUE NOT NULL,           -- device_1, device_2 等
  actual_device_id TEXT UNIQUE NOT NULL,    -- 实际的华为IoT设备ID
  device_name TEXT NOT NULL,                -- 友好名称
  location_name TEXT,                       -- 位置名称
  device_type TEXT DEFAULT 'sensor',        -- 设备类型
  latitude DOUBLE PRECISION,                -- 纬度
  longitude DOUBLE PRECISION,               -- 经度
  install_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active',             -- active, inactive, maintenance
  description TEXT,                         -- 设备描述
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_device_mapping_simple_id ON public.device_mapping(simple_id);
CREATE INDEX IF NOT EXISTS idx_device_mapping_actual_id ON public.device_mapping(actual_device_id);
CREATE INDEX IF NOT EXISTS idx_device_mapping_status ON public.device_mapping(status);

-- 3. 添加注释
COMMENT ON TABLE public.device_mapping IS '设备映射表：将简洁ID映射到实际设备ID';
COMMENT ON COLUMN public.device_mapping.simple_id IS '简洁设备ID，如device_1, device_2';
COMMENT ON COLUMN public.device_mapping.actual_device_id IS '实际的华为IoT设备ID';
COMMENT ON COLUMN public.device_mapping.device_name IS '设备友好名称';
COMMENT ON COLUMN public.device_mapping.location_name IS '安装位置名称';

-- 4. 创建自动更新时间戳的触发器
CREATE OR REPLACE FUNCTION update_device_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_device_mapping_timestamp ON public.device_mapping;
CREATE TRIGGER trigger_update_device_mapping_timestamp
    BEFORE UPDATE ON public.device_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_device_mapping_timestamp();

-- 5. 插入示例映射（如果你的设备ID是这个的话）
INSERT INTO public.device_mapping (
    simple_id, 
    actual_device_id, 
    device_name, 
    location_name, 
    device_type,
    latitude,
    longitude,
    description
) VALUES (
    'device_1',
    '6815a14f9314d118511807c6_rk2206',
    '龙门滑坡监测站',
    '防城港华石镇龙门村',
    'rk2206',
    22.817,
    108.3669,
    'RK2206滑坡监测站，主要监测温湿度、加速度、陀螺仪等数据'
) ON CONFLICT (simple_id) DO UPDATE SET
    actual_device_id = EXCLUDED.actual_device_id,
    device_name = EXCLUDED.device_name,
    location_name = EXCLUDED.location_name,
    updated_at = NOW();

-- 6. 创建视图，方便查询设备映射信息
CREATE OR REPLACE VIEW public.device_mapping_view AS
SELECT 
    dm.simple_id,
    dm.actual_device_id,
    dm.device_name,
    dm.location_name,
    dm.device_type,
    dm.latitude,
    dm.longitude,
    dm.status,
    dm.description,
    dm.install_date,
    -- 从iot_data表获取最新数据
    (SELECT event_time FROM public.iot_data 
     WHERE device_id = dm.actual_device_id 
     ORDER BY event_time DESC LIMIT 1) as last_data_time,
    -- 计算在线状态
    CASE 
        WHEN dm.status = 'maintenance' THEN 'maintenance'
        WHEN (SELECT event_time FROM public.iot_data 
              WHERE device_id = dm.actual_device_id 
              ORDER BY event_time DESC LIMIT 1) > NOW() - INTERVAL '5 minutes' 
        THEN 'online'
        ELSE 'offline'
    END as online_status
FROM public.device_mapping dm
WHERE dm.status = 'active'
ORDER BY dm.simple_id;

-- 7. 创建获取下一个可用简洁ID的函数
CREATE OR REPLACE FUNCTION get_next_simple_device_id()
RETURNS TEXT AS $$
DECLARE
    next_id INTEGER;
    simple_id TEXT;
BEGIN
    -- 找到最大的数字ID
    SELECT COALESCE(MAX(CAST(SUBSTRING(simple_id FROM 'device_(\d+)') AS INTEGER)), 0) + 1
    INTO next_id
    FROM public.device_mapping
    WHERE simple_id ~ '^device_\d+$';
    
    simple_id := 'device_' || next_id;
    RETURN simple_id;
END;
$$ LANGUAGE plpgsql;

-- 8. 创建自动注册新设备的函数
CREATE OR REPLACE FUNCTION auto_register_device(
    p_actual_device_id TEXT,
    p_device_name TEXT DEFAULT NULL,
    p_location_name TEXT DEFAULT NULL,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_simple_id TEXT;
    v_device_name TEXT;
BEGIN
    -- 检查设备是否已经注册
    SELECT simple_id INTO v_simple_id
    FROM public.device_mapping
    WHERE actual_device_id = p_actual_device_id;
    
    IF v_simple_id IS NOT NULL THEN
        RETURN v_simple_id; -- 设备已存在，返回现有的简洁ID
    END IF;
    
    -- 获取下一个可用的简洁ID
    v_simple_id := get_next_simple_device_id();
    
    -- 生成默认设备名称
    v_device_name := COALESCE(p_device_name, '监测设备-' || SUBSTRING(v_simple_id FROM 'device_(\d+)'));
    
    -- 插入新设备映射
    INSERT INTO public.device_mapping (
        simple_id,
        actual_device_id,
        device_name,
        location_name,
        device_type,
        latitude,
        longitude,
        description
    ) VALUES (
        v_simple_id,
        p_actual_device_id,
        v_device_name,
        COALESCE(p_location_name, '未知位置'),
        CASE WHEN p_actual_device_id LIKE '%rk2206%' THEN 'rk2206' ELSE 'sensor' END,
        p_latitude,
        p_longitude,
        '自动注册的设备'
    );
    
    RETURN v_simple_id;
END;
$$ LANGUAGE plpgsql;
