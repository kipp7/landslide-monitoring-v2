-- =============================================
-- Telemetry DLQ messages (ops/debug)
-- =============================================

CREATE TABLE telemetry_dlq_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kafka_topic TEXT NOT NULL,
  kafka_partition INT NOT NULL,
  kafka_offset BIGINT NOT NULL,
  kafka_key TEXT,
  received_ts TIMESTAMPTZ NOT NULL,
  device_id UUID,
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  raw_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kafka_topic, kafka_partition, kafka_offset)
);

CREATE INDEX idx_telemetry_dlq_messages_time ON telemetry_dlq_messages(received_ts DESC);
CREATE INDEX idx_telemetry_dlq_messages_reason ON telemetry_dlq_messages(reason_code);
CREATE INDEX idx_telemetry_dlq_messages_device_time ON telemetry_dlq_messages(device_id, received_ts DESC);
