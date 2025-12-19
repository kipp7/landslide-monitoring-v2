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

