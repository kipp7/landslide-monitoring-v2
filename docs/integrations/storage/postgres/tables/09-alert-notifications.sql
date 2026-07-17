-- =============================================
-- 告警通知与订阅（v2）
-- =============================================

CREATE TABLE alert_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES alert_events(event_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  notify_type VARCHAR(20) NOT NULL
    CHECK (notify_type IN ('app', 'sms', 'email', 'wechat')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  title TEXT,
  content TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_notifications_event ON alert_notifications(event_id);
CREATE INDEX idx_alert_notifications_user ON alert_notifications(user_id);
CREATE INDEX idx_alert_notifications_status ON alert_notifications(status);

-- 用户订阅（可选：订阅设备/站点范围，做个性化推送）
CREATE TABLE user_alert_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(station_id) ON DELETE CASCADE,
  min_severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (min_severity IN ('low', 'medium', 'high', 'critical')),
  notify_app BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sms BOOLEAN NOT NULL DEFAULT FALSE,
  notify_email BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_start_time TIME,
  quiet_end_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id, station_id)
);

-- 区域/站点/设备短信联系人库（用于非登录用户、值班组、区域负责人）
CREATE TABLE alert_contact_groups (
  group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(80) NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  group_type VARCHAR(20) NOT NULL DEFAULT 'station'
    CHECK (group_type IN ('global', 'region', 'station', 'device')),
  province VARCHAR(50),
  city VARCHAR(50),
  district VARCHAR(50),
  region_code VARCHAR(80),
  station_id UUID REFERENCES stations(station_id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(device_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_contact_groups_scope ON alert_contact_groups(group_type, station_id, device_id, region_code);
CREATE INDEX idx_alert_contact_groups_active ON alert_contact_groups(is_active);

CREATE TABLE alert_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT NOT NULL,
  phone_e164 VARCHAR(32) NOT NULL,
  phone_country_code VARCHAR(8) NOT NULL DEFAULT '86',
  email VARCHAR(100),
  role_label VARCHAR(80),
  organization TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone_e164)
);

CREATE INDEX idx_alert_contacts_active ON alert_contacts(is_active);

CREATE TABLE alert_contact_bindings (
  binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES alert_contacts(contact_id) ON DELETE CASCADE,
  group_id UUID REFERENCES alert_contact_groups(group_id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(station_id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE,
  region_code VARCHAR(80),
  min_severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (min_severity IN ('low', 'medium', 'high', 'critical')),
  notify_sms BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  duty_label VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (group_id IS NOT NULL OR station_id IS NOT NULL OR device_id IS NOT NULL OR region_code IS NOT NULL)
);

CREATE INDEX idx_alert_contact_bindings_contact ON alert_contact_bindings(contact_id);
CREATE INDEX idx_alert_contact_bindings_station ON alert_contact_bindings(station_id);
CREATE INDEX idx_alert_contact_bindings_device ON alert_contact_bindings(device_id);
CREATE INDEX idx_alert_contact_bindings_region ON alert_contact_bindings(region_code);
CREATE INDEX idx_alert_contact_bindings_active ON alert_contact_bindings(is_active, notify_sms);

CREATE TABLE alert_sms_delivery_jobs (
  sms_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES alert_events(event_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES alert_contacts(contact_id) ON DELETE SET NULL,
  phone_e164 VARCHAR(32) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'mock',
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  title TEXT,
  content TEXT,
  template_code VARCHAR(80),
  template_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, contact_id, phone_e164, provider)
);

CREATE INDEX idx_alert_sms_delivery_jobs_event ON alert_sms_delivery_jobs(event_id);
CREATE INDEX idx_alert_sms_delivery_jobs_contact ON alert_sms_delivery_jobs(contact_id);
CREATE INDEX idx_alert_sms_delivery_jobs_status ON alert_sms_delivery_jobs(status);
