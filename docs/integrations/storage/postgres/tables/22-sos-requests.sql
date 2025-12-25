-- =============================================
-- SOS requests (mobile MVP)
-- =============================================

CREATE TABLE sos_requests (
  sos_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'canceled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  description TEXT,
  address TEXT,
  contact_name VARCHAR(100),
  contact_phone VARCHAR(50),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_sos_requests_status ON sos_requests(status);
CREATE INDEX idx_sos_requests_created_at ON sos_requests(created_at DESC);
CREATE INDEX idx_sos_requests_created_by ON sos_requests(created_by);
