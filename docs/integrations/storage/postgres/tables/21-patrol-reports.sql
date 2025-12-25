-- =============================================
-- Patrol reports (mobile MVP)
-- =============================================

CREATE TABLE patrol_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID REFERENCES stations(station_id),
  task_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewed', 'archived')),
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  reported_by UUID REFERENCES users(user_id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_patrol_reports_station ON patrol_reports(station_id);
CREATE INDEX idx_patrol_reports_status ON patrol_reports(status);
CREATE INDEX idx_patrol_reports_reported_by ON patrol_reports(reported_by);
CREATE INDEX idx_patrol_reports_created_at ON patrol_reports(created_at DESC);
