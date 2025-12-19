-- =============================================
-- 系统配置与审计日志（v2）
-- =============================================

CREATE TABLE system_configs (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  config_type VARCHAR(20) NOT NULL DEFAULT 'string',
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_configs (config_key, config_value, config_type, description, is_public) VALUES
('system.name', '滑坡监测系统', 'string', '系统名称', TRUE),
('system.version', '2.0.0', 'string', '系统版本', TRUE),
('telemetry.raw_ttl_days', '30', 'number', 'ClickHouse 原始遥测保留天数（策略值）', FALSE),
('alert.default_cooldown_min', '30', 'number', '默认告警冷却时间（分钟）', FALSE),
('device.offline_threshold_s', '300', 'number', '设备离线阈值（秒）', FALSE);

-- 操作审计（建议分区；此处仅定义表结构）
CREATE TABLE operation_logs (
  id BIGSERIAL,
  user_id UUID REFERENCES users(user_id),
  username VARCHAR(50),
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  description TEXT,
  request_data JSONB,
  response_data JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_op_logs_user ON operation_logs(user_id);
CREATE INDEX idx_op_logs_module ON operation_logs(module);
CREATE INDEX idx_op_logs_time ON operation_logs(created_at DESC);

-- API 访问日志（建议分区；此处仅定义表结构）
CREATE TABLE api_logs (
  id BIGSERIAL,
  user_id UUID,
  method VARCHAR(10),
  path VARCHAR(500),
  query_params JSONB,
  status_code INT,
  response_time_ms INT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_api_logs_time ON api_logs(created_at DESC);
CREATE INDEX idx_api_logs_path ON api_logs(path);
