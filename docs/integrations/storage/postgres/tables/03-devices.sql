-- =============================================
-- 站点/设备/传感器字典（v2：不写死）
-- =============================================

-- 站点（边坡/监测点位）
CREATE TABLE stations (
  station_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_code VARCHAR(50) NOT NULL UNIQUE,
  station_name VARCHAR(100) NOT NULL,
  province VARCHAR(50),
  city VARCHAR(50),
  district VARCHAR(50),
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'maintenance')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_stations_status ON stations(status);
CREATE INDEX idx_stations_location ON stations(latitude, longitude);

-- 设备（device_id 与设备端一致：烧录写入）
CREATE TABLE devices (
  device_id UUID PRIMARY KEY,
  device_name VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) NOT NULL DEFAULT 'generic',
  station_id UUID REFERENCES stations(station_id),
  status VARCHAR(20) NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive', 'active', 'revoked')),
  device_secret_hash VARCHAR(255) NOT NULL,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_station ON devices(station_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at DESC);

-- 传感器/指标字典（新增指标不改表结构）
CREATE TABLE sensors (
  sensor_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  unit TEXT,
  data_type VARCHAR(20) NOT NULL DEFAULT 'float'
    CHECK (data_type IN ('float', 'int', 'bool', 'string')),
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 设备支持的传感器声明（可选；用于前端展示/缺失提示）
CREATE TABLE device_sensors (
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  sensor_key TEXT NOT NULL REFERENCES sensors(sensor_key),
  status VARCHAR(20) NOT NULL DEFAULT 'enabled'
    CHECK (status IN ('enabled', 'disabled', 'missing')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, sensor_key)
);

