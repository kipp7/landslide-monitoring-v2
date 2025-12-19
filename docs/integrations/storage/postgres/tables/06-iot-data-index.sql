-- =============================================
-- device_state 索引（v2）
-- =============================================

CREATE INDEX idx_device_state_updated_at ON device_state(updated_at DESC);
CREATE INDEX idx_device_state_state ON device_state USING GIN (state);

