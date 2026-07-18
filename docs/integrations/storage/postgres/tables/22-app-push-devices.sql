-- HarmonyOS Push Kit device registrations. PostgreSQL remains the only server-side source.
CREATE TABLE IF NOT EXISTS app_push_devices (
  push_device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL DEFAULT 'harmonyos'
    CHECK (platform IN ('harmonyos')),
  push_token TEXT NOT NULL UNIQUE,
  bundle_name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_push_devices_user_active
  ON app_push_devices(user_id, is_active);
