-- =============================================
-- Device Health Expert (v1)
-- =============================================

CREATE TABLE device_health_expert_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,

  metric TEXT NOT NULL CHECK (metric IN ('all', 'battery', 'health', 'signal')),
  result JSONB NOT NULL,

  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_health_expert_runs_device_metric_created
  ON device_health_expert_runs(device_id, metric, created_at DESC);

CREATE TABLE device_health_expert_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('recalibrate', 'reset_baseline', 'update_config')),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,

  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_health_expert_actions_device_created
  ON device_health_expert_actions(device_id, created_at DESC);
