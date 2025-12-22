-- =============================================
-- AI predictions / expert outputs (v1)
-- =============================================

CREATE TABLE ai_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(station_id) ON DELETE SET NULL,

  model_key TEXT NOT NULL,
  model_version TEXT,

  horizon_seconds INTEGER NOT NULL DEFAULT 0 CHECK (horizon_seconds >= 0),
  predicted_ts TIMESTAMPTZ NOT NULL,

  risk_score DOUBLE PRECISION NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_level VARCHAR(10) CHECK (risk_level IN ('low', 'medium', 'high')),
  explain TEXT,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_predictions_device_created ON ai_predictions(device_id, created_at DESC);
CREATE INDEX idx_ai_predictions_station_created ON ai_predictions(station_id, created_at DESC);
CREATE INDEX idx_ai_predictions_model_created ON ai_predictions(model_key, created_at DESC);

