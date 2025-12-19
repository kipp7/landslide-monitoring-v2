-- =============================================
-- 设备命令通知（v2 ops）
-- =============================================

CREATE TABLE device_command_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES device_command_events(event_id) ON DELETE CASCADE,
  notify_type VARCHAR(20) NOT NULL
    CHECK (notify_type IN ('app', 'sms', 'email', 'wechat')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, notify_type)
);

CREATE INDEX idx_device_command_notifications_event ON device_command_notifications(event_id);
CREATE INDEX idx_device_command_notifications_status ON device_command_notifications(status);
CREATE INDEX idx_device_command_notifications_created ON device_command_notifications(created_at DESC);

