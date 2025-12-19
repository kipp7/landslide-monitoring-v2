-- =============================================
-- 设备命令生命周期事件（v2 ops）
-- =============================================

CREATE TABLE device_command_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('COMMAND_SENT', 'COMMAND_ACKED', 'COMMAND_FAILED', 'COMMAND_TIMEOUT')),
  command_id UUID NOT NULL REFERENCES device_commands(command_id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('queued', 'sent', 'acked', 'failed', 'timeout', 'canceled')),
  detail TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_command_events_device_time ON device_command_events(device_id, created_at DESC);
CREATE INDEX idx_device_command_events_command_time ON device_command_events(command_id, created_at DESC);
CREATE INDEX idx_device_command_events_type_time ON device_command_events(event_type, created_at DESC);

