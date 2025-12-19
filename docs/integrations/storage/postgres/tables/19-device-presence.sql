-- =============================================
-- 设备在线/离线（Presence）快照
-- =============================================
--
-- PresenceEvent 属于“可选链路”，用于展示在线状态、联动告警缺失策略等。
-- 当前仅存最新快照（last-write-wins），不做历史分区。

CREATE TABLE IF NOT EXISTS device_presence (
  device_id UUID PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('online', 'offline')),
  event_ts TIMESTAMPTZ NOT NULL,
  received_ts TIMESTAMPTZ NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_presence_updated_at ON device_presence(updated_at DESC);

