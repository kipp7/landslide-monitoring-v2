-- =============================================
-- 规则与告警事件（v2：版本化 + 事件化）
-- =============================================

-- 规则（逻辑容器）
CREATE TABLE alert_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  description TEXT,
  scope VARCHAR(20) NOT NULL DEFAULT 'device'
    CHECK (scope IN ('device', 'station', 'global')),
  device_id UUID REFERENCES devices(device_id),
  station_id UUID REFERENCES stations(station_id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_active ON alert_rules(is_active);
CREATE INDEX idx_alert_rules_device ON alert_rules(device_id);
CREATE INDEX idx_alert_rules_station ON alert_rules(station_id);

-- 规则版本（DSL 存 JSON，避免硬编码）
CREATE TABLE alert_rule_versions (
  rule_id UUID NOT NULL REFERENCES alert_rules(rule_id) ON DELETE CASCADE,
  rule_version INT NOT NULL,
  dsl_version INT NOT NULL DEFAULT 1,
  -- 完整 DSL（原样保存，保证可回放/可解释）
  dsl_json JSONB NOT NULL,
  -- 以下字段为“冗余字段”，用于检索/索引；由应用层确保与 dsl_json 一致
  conditions JSONB,
  window_json JSONB,
  hysteresis JSONB,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rule_id, rule_version)
);

-- 告警事件（统一事件流）
CREATE TABLE alert_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL, -- 同一生命周期告警的标识（触发/更新/恢复/确认共享）
  event_type VARCHAR(20) NOT NULL
    CHECK (event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE', 'ALERT_RESOLVE', 'ALERT_ACK')),
  rule_id UUID REFERENCES alert_rules(rule_id),
  rule_version INT,
  device_id UUID REFERENCES devices(device_id),
  station_id UUID REFERENCES stations(station_id),
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT,
  message TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  explain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_events_alert ON alert_events(alert_id);
CREATE INDEX idx_alert_events_device_time ON alert_events(device_id, created_at DESC);
CREATE INDEX idx_alert_events_rule_time ON alert_events(rule_id, created_at DESC);
