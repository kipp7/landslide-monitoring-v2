-- =============================================
-- 设备命令下发与回执（v2）
-- =============================================

CREATE TABLE device_commands (
  command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  command_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'acked', 'failed', 'timeout', 'canceled')),
  requested_by UUID REFERENCES users(user_id),
  request_source VARCHAR(20) NOT NULL DEFAULT 'api'
    CHECK (request_source IN ('api', 'system')),
  sent_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_commands_device_time ON device_commands(device_id, created_at DESC);
CREATE INDEX idx_device_commands_status ON device_commands(status);

